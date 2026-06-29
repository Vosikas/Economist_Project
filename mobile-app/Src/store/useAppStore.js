/**
 * @file useAppStore.js
 * @description Central Zustand store for the Economist app.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import tokenStorage from '../services/tokenstorage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const SHIELD_REFILL_MINUTES = 30;
const THEORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Module-level in-flight deduplication map ────────────────────────────────
// Lives outside Zustand because Promises are not serializable.
// Prevents duplicate network requests when the same chapterId is requested
// multiple times before the first request resolves (e.g., rapid tab switching).
const theoryFetchPromises = new Map();

const useAppStore = create(
    persist(
        (set, get) => ({
            // ── Core Auth State ───────────────────────────────────────────────
            user: null,
            token: null,
            setToken: (newToken) => set({ token: newToken }),

            /**
             * Sets the _justLoggedIn flag via a proper Zustand action.
             *
             * WHY an explicit setter instead of direct mutation?
             * `useAppStore.getState()._justLoggedIn = true` bypasses Zustand's
             * subscriber notification system and is invisible to persist middleware.
             * Always use this setter from login screens and OAuth handlers.
             *
             * @param {boolean} value
             */
            setJustLoggedIn: (value) => set({ _justLoggedIn: value }),

            // ── Gamification / Energy System ──────────────────────────────────
            shields: 5,
            lastShieldUpdate: Date.now(),
            isPremium: false,

            // ── RevenueCat SDK Signal ─────────────────────────────────────────
            // `rcReady` is set to true by initializeRevenueCat() immediately after
            // Purchases.configure() succeeds. usePaywall subscribes to this flag
            // and defers its offerings fetch until the SDK is ready.
            //
            // WHY not in partialize?
            // Purchases.configure() must be called on every app launch — the native
            // SDK singleton is NOT persisted across process restarts. Starting with
            // rcReady=true from AsyncStorage would cause usePaywall to call
            // Purchases.getOfferings() on a brand-new, unconfigured SDK instance.
            rcReady: false,
            setRCReady: (value) => set({ rcReady: value }),

            decreaseShield: () => {
                const { isPremium, shields } = get();
                if (isPremium) return;

                if (shields > 0) {
                    const newShields = shields - 1;
                    set({
                        shields: newShields,
                        // Start the refill timer the moment we drop from full
                        lastShieldUpdate: shields === 5 ? Date.now() : get().lastShieldUpdate,
                    });
                }
            },

            addShields: (amount) => {
                const { shields } = get();
                const newShields = Math.min(shields + amount, 5);
                set({
                    shields: newShields,
                    // If we just topped back up to max, reset the refill clock
                    ...(newShields === 5 ? { lastShieldUpdate: Date.now() } : {}),
                });
            },

            /**
             * Sets the premium status for the current user.
             *
             * Called by two callers:
             *   1. revenueCat.js `addCustomerInfoUpdateListener` — real-time subscription events.
             *   2. revenueCat.js `purchasePackage` / `restorePurchases` — after a successful action.
             *
             * WHY update both `isPremium` AND `user.is_premium`?
             *   `isPremium` is the fast reactive selector used by gating logic everywhere
             *   (AuthWrapper, DashboardTabs). `user.is_premium` keeps the user object
             *   consistent so any screen that reads user data directly stays in sync too.
             *
             * @param {boolean} value
             */
            setIsPremium: (value) => {
                set((state) => ({
                    isPremium: value,
                    user: state.user ? { ...state.user, is_premium: value } : state.user,
                }));
            },

            refreshShields: () => {
                const { shields, lastShieldUpdate, isPremium } = get();
                if (isPremium || shields >= 5) return;

                const now = Date.now();
                const minsPassed = Math.floor((now - lastShieldUpdate) / (1000 * 60));
                const shieldsToAdd = Math.floor(minsPassed / SHIELD_REFILL_MINUTES);

                if (shieldsToAdd > 0) {
                    const newShields = Math.min(shields + shieldsToAdd, 5);
                    const remainderMins = minsPassed % SHIELD_REFILL_MINUTES;
                    const newUpdateTime = now - remainderMins * 60 * 1000;

                    set({
                        shields: newShields,
                        lastShieldUpdate: newShields === 5 ? Date.now() : newUpdateTime,
                    });
                }
            },

            // ── Course Content ────────────────────────────────────────────────
            chapters: [],
            questionsCache: {},

            // Shape: { [chapterId]: { data: Question[], fetchedAt: number } }
            // Not persisted — questions are session-only to stay fresh.
            // TTL: 5 minutes. Stale-while-revalidate on error (returns old data
            // rather than crashing if the network drops mid-session).
            theoryQuestionsCache: {},

            // ── Progress ──────────────────────────────────────────────────────
            progress: [],
            progressByUser: {},

            // ── Mistakes / Notebook ───────────────────────────────────────────
            activeMistakes: [],

            // ── Badges ────────────────────────────────────────────────────────
            userBadges: [],
            badgeDefinitions: [],

            // ── Leaderboard ───────────────────────────────────────────────────
            leaderboard: [],
            isLoadingLeaderboard: false,
            /** @type {string|null} Null on success; error message string on failure. */
            leaderboardError: null,

            // ── Meta State ────────────────────────────────────────────────────
            error: null,
            appState: 'CHECKING_AUTH',
            sessionExpired: false,
            _justLoggedIn: false,

            // ================================================================
            // ACTION: fetchDashboardData
            // ================================================================
            fetchDashboardData: async (freshToken = null) => {
                const currentState = get().appState;
                if (currentState === 'LOADING_DATA' || currentState === 'READY') return;

                get().refreshShields();

                const localChapters = get().chapters;

                // Fast path: we have cached chapters — show READY immediately
                // and let the network call update silently in the background.
                if (
                    localChapters &&
                    localChapters.length > 0 &&
                    currentState === 'CHECKING_AUTH' &&
                    (get().token || freshToken)
                ) {
                    set({ appState: 'READY', error: null, _justLoggedIn: false });
                }

                try {
                    const token =
                        freshToken ?? get().token ?? (await tokenStorage.getAccessToken());
                    if (freshToken) set({ token: freshToken });

                    if (!token) {
                        set({ appState: 'AUTHENTICATING', _justLoggedIn: false });
                        return;
                    }

                    if (currentState !== 'READY') {
                        set({ appState: 'LOADING_DATA' });
                    }

                    const response = await axios.get(`${BASE_URL}/dashboard`, {
                        headers: { Authorization: 'Bearer ' + token },
                        timeout: 10000,
                    });

                    let { user, progress, chapters } = response.data;
                    if (!chapters) chapters = [];

                    const userId = user?.id;
                    const existingUserProgress = userId
                        ? get().progressByUser[userId] || []
                        : [];
                    const finalProgress =
                        progress && progress.length > 0 ? progress : existingUserProgress;

                    const updatedProgressByUser = userId
                        ? { ...get().progressByUser, [userId]: finalProgress }
                        : get().progressByUser;

                    set({
                        user,
                        isPremium: user?.is_premium || false,
                        progressByUser: updatedProgressByUser,
                        progress: finalProgress,
                        chapters,
                        error: null,
                        appState: 'READY',
                        _justLoggedIn: false,
                    });
                } catch (error) {
                    if (!get().chapters) set({ chapters: [] });

                    if (error.response?.status === 401) {
                        const wasJustLoggedIn = get()._justLoggedIn;
                        if (!wasJustLoggedIn) {
                            await tokenStorage.removeTokens();
                            // Single authoritative set() — do NOT also set error on a
                            // deliberate session expiry. The sessionExpired flag drives
                            // the UI; setting error simultaneously causes both the
                            // session-expired banner AND a generic error to show.
                            set({
                                user: null,
                                token: null,
                                sessionExpired: true,
                                error: null,
                                appState: 'AUTHENTICATING',
                            });
                            return; // Exit early — skip the generic error set below
                        }
                    }
                    // Non-auth errors — surface the message so the UI can show a retry
                    set({ error: error.message, appState: 'AUTHENTICATING' });
                }
            },

            // ================================================================
            // ACTION: fetchTheoryQuestionsForChapter
            //
            // IMPROVEMENTS over original:
            //   1. TTL-based cache expiry (5 min) — prevents stale questions
            //      if a teacher edits content while the app is open.
            //   2. In-flight deduplication via module-level Map — if two
            //      components request the same chapterId simultaneously, only
            //      one HTTP request fires. Both callers await the same Promise.
            //   3. forceRefresh flag — pull-to-refresh or manual invalidation.
            //   4. Stale-while-error — if the network drops mid-session, we
            //      return the expired cache rather than throwing, so the UI
            //      doesn't blank out.
            //   5. Timeout — won't hang indefinitely if the server stalls.
            // ================================================================
            fetchTheoryQuestionsForChapter: async (chapterId, { forceRefresh = false } = {}) => {
                const cached = get().theoryQuestionsCache[chapterId];
                const isStale =
                    !cached || Date.now() - cached.fetchedAt > THEORY_CACHE_TTL_MS;

                // Cache hit and still fresh — return immediately, no network call
                if (!forceRefresh && !isStale) {
                    return cached.data;
                }

                // In-flight deduplication: reuse the existing Promise if one is
                // already running for this chapterId
                if (theoryFetchPromises.has(chapterId)) {
                    return theoryFetchPromises.get(chapterId);
                }

                const fetchPromise = (async () => {
                    try {
                        const currentToken =
                            get().token || (await tokenStorage.getAccessToken());

                        const response = await axios.get(
                            `${BASE_URL}/ai-tutor/questions/${chapterId}`,
                            {
                                headers: { Authorization: `Bearer ${currentToken}` },
                                timeout: 8000,
                            }
                        );

                        const questions = response.data;

                        set((state) => ({
                            theoryQuestionsCache: {
                                ...state.theoryQuestionsCache,
                                [chapterId]: { data: questions, fetchedAt: Date.now() },
                            },
                        }));

                        return questions;
                    } catch (error) {
                        // Stale-while-error: if we have *any* cached data (even expired),
                        // return it silently rather than crashing the UI.
                        if (cached) {
                            console.warn(
                                `[AI Tutor] Network error for chapter ${chapterId}. Returning stale cache.`
                            );
                            return cached.data;
                        }
                        // No cache at all — must surface the error so the screen
                        // can show a proper empty/retry state
                        console.error(
                            `[AI Tutor] Failed to load theory questions for chapter ${chapterId}:`,
                            error
                        );
                        throw error;
                    } finally {
                        // Always clean up the in-flight entry, whether success or failure
                        theoryFetchPromises.delete(chapterId);
                    }
                })();

                theoryFetchPromises.set(chapterId, fetchPromise);
                return fetchPromise;
            },

            // ================================================================
            // ACTION: invalidateTheoryCache
            // Call this after an admin content update, or from a pull-to-refresh.
            // ================================================================
            invalidateTheoryCache: (chapterId = null) => {
                if (chapterId) {
                    // Invalidate a single chapter
                    set((state) => {
                        const updated = { ...state.theoryQuestionsCache };
                        delete updated[chapterId];
                        return { theoryQuestionsCache: updated };
                    });
                } else {
                    // Invalidate everything
                    set({ theoryQuestionsCache: {} });
                }
            },

            // ================================================================
            // ACTION: logout
            // ================================================================
            logout: async () => {
                // Clear in-flight requests too so stale promises don't resolve
                // after the user logs out and re-logs in as someone else
                theoryFetchPromises.clear();

                await tokenStorage.removeTokens();
                set({
                    user: null,
                    token: null,
                    progress: [],
                    questionsCache: {},
                    theoryQuestionsCache: {},
                    error: null,
                    sessionExpired: false,
                    appState: 'AUTHENTICATING',
                    activeMistakes: [],
                    userBadges: [],
                    badgeDefinitions: [],
                    shields: 5,
                    lastShieldUpdate: Date.now(),
                    isPremium: false,
                    rcReady: false,  // RC must be re-configured on next login
                });
            },

            // ================================================================
            // ACTION: deleteAccount
            // ================================================================
            deleteAccount: async () => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    await axios.delete(`${BASE_URL}/me`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    await get().logout();
                } catch (error) {
                    console.error('Failed to delete account:', error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: fetchQuestionsForLevel
            // Fixed: added try/catch (original had unhandled rejection risk)
            // and a timeout.
            // ================================================================
            fetchQuestionsForLevel: async (levelId) => {
                const { questionsCache, token } = get();
                if (questionsCache[levelId]) return questionsCache[levelId];

                try {
                    const currentToken = token || (await tokenStorage.getAccessToken());
                    const response = await axios.get(
                        `${BASE_URL}/levels/${levelId}/questions`,
                        {
                            headers: { Authorization: `Bearer ${currentToken}` },
                            timeout: 8000,
                        }
                    );

                    const questions = response.data.questions;
                    set((state) => ({
                        questionsCache: { ...state.questionsCache, [levelId]: questions },
                    }));

                    return questions;
                } catch (error) {
                    console.error(`[Quiz] Failed to fetch questions for level ${levelId}:`, error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: completeLevel
            // ================================================================
            completeLevel: async (
                levelId,
                score,
                wrongQuestionIds = [],
                totalQuestions = 10
            ) => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    const response = await axios.post(
                        `${BASE_URL}/levels/complete`,
                        {
                            level_id: levelId,
                            score: score,
                            wrong_question_ids: wrongQuestionIds,
                            total_questions: totalQuestions,
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const { xp_gained, new_total_xp, streak_days, passed, accuracy } =
                        response.data;

                    set((state) => {
                        const userId = state.user?.id;
                        if (!userId) return {};

                        const updatedUser = {
                            ...state.user,
                            total_xp: new_total_xp,
                            streak_days: streak_days ?? state.user.streak_days,
                        };

                        const userProgress = [...(state.progressByUser[userId] || [])];
                        const existingIdx = userProgress.findIndex(
                            (p) => p.level_id === levelId
                        );

                        if (existingIdx >= 0) {
                            userProgress[existingIdx] = {
                                ...userProgress[existingIdx],
                                is_completed: passed
                                    ? true
                                    : userProgress[existingIdx].is_completed,
                                score: Math.max(
                                    userProgress[existingIdx].score || 0,
                                    accuracy
                                ),
                            };
                        } else {
                            userProgress.push({
                                level_id: levelId,
                                is_completed: passed,
                                score: accuracy,
                            });
                        }

                        return {
                            user: updatedUser,
                            progressByUser: {
                                ...state.progressByUser,
                                [userId]: userProgress,
                            },
                            progress: userProgress,
                        };
                    });

                    return response.data;
                } catch (error) {
                    console.error('Failed to sync level completion:', error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: fetchActiveMistakes
            // ================================================================
            fetchActiveMistakes: async () => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    const response = await axios.get(`${BASE_URL}/mistakes/active`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    set({ activeMistakes: response.data });
                    return response.data;
                } catch (error) {
                    console.error('Failed to fetch active mistakes:', error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: fetchRedemptionQuiz
            // ================================================================
            fetchRedemptionQuiz: async () => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    const response = await axios.get(`${BASE_URL}/mistakes/quiz`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    return response.data;
                } catch (error) {
                    console.error('Failed to fetch redemption quiz:', error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: resolveMistake
            // ================================================================
            resolveMistake: async (questionId) => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    const response = await axios.post(
                        `${BASE_URL}/mistakes/resolve`,
                        { question_id: questionId },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const { new_total_coins } = response.data;

                    set((state) => {
                        const updatedUser = { ...state.user, coins: new_total_coins };
                        const updatedMistakes = state.activeMistakes.filter(
                            (m) => m.question_id !== questionId
                        );
                        return { user: updatedUser, activeMistakes: updatedMistakes };
                    });

                    return response.data;
                } catch (error) {
                    console.error('Failed to resolve mistake:', error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: fetchUserBadges
            // ================================================================
            fetchUserBadges: async () => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    const response = await axios.get(`${BASE_URL}/badges`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    set({ userBadges: response.data });
                    return response.data;
                } catch (error) {
                    console.error('Failed to fetch user badges:', error);
                    throw error;
                }
            },

            // ================================================================
            // ACTION: fetchBadgeDefinitions
            // ================================================================
            fetchBadgeDefinitions: async () => {
                try {
                    const token = get().token || (await tokenStorage.getAccessToken());
                    const response = await axios.get(`${BASE_URL}/badges/definitions`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    set({ badgeDefinitions: response.data });
                    return response.data;
                } catch (error) {
                    console.error('Failed to fetch badge definitions:', error);
                    throw error;
                }
            },

            /**
             * Fetches the public top-100 leaderboard from the server.
             *
             * This endpoint requires no authentication (publicly viewable).
             * Sets `leaderboardError` on failure so the UI can display a retry button.
             * Applies an 8-second timeout to prevent the screen from hanging
             * indefinitely on a slow connection.
             *
             * @returns {Promise<void>}
             */
            fetchLeaderboard: async () => {
                set({ isLoadingLeaderboard: true, leaderboardError: null });
                try {
                    const response = await axios.get(`${BASE_URL}/leaderboard`, {
                        timeout: 8000,
                    });
                    set({ leaderboard: response.data, isLoadingLeaderboard: false });
                } catch (error) {
                    console.error('Σφάλμα φόρτωσης Leaderboard:', error);
                    set({
                        isLoadingLeaderboard: false,
                        // Expose the error message so the LeaderboardScreen can
                        // render a retry button instead of a blank list.
                        leaderboardError: error.message ?? 'Σφάλμα σύνδεσης.',
                    });
                }
            },

            // ================================================================
            // UTILITY ACTIONS
            // ================================================================
            clearData: () => {
                theoryFetchPromises.clear();
                set({
                    user: null,
                    token: null,
                    progressByUser: {},
                    chapters: [],
                    questionsCache: {},
                    theoryQuestionsCache: {},
                    error: null,
                    sessionExpired: false,
                    appState: 'CHECKING_AUTH',
                    activeMistakes: [],
                    userBadges: [],
                    badgeDefinitions: [],
                    isPremium: false,
                    rcReady: false,  // RC must be re-configured on next login
                });
            },

            clearSessionExpired: () => set({ sessionExpired: false }),
        }),

        // ======================================================================
        // PERSIST MIDDLEWARE OPTIONS
        // ======================================================================
        {
            name: 'app-storage',
            storage: createJSONStorage(() => AsyncStorage),

            // theoryQuestionsCache intentionally excluded: session-only, stays fresh
            // questionsCache intentionally excluded: re-fetched per level session
            // leaderboard intentionally excluded: always needs fresh data
            // badgeDefinitions intentionally excluded: static, re-fetched on demand
            partialize: (state) => ({
                user: state.user,
                chapters: state.chapters,
                progressByUser: state.progressByUser,
                progress: state.progress,
                activeMistakes: state.activeMistakes,
                userBadges: state.userBadges,
                shields: state.shields,
                lastShieldUpdate: state.lastShieldUpdate,
                isPremium: state.isPremium,
            }),

            onRehydrateStorage: () => (state) => {
                if (!state) return;

                // Always recalculate shield regeneration on app resume —
                // user may have been offline for hours
                if (state.refreshShields) {
                    state.refreshShields();
                }

                // Do NOT call fetchDashboardData here. onRehydrateStorage fires
                // before the app tree mounts and before token validity is confirmed.
                // Let the root navigator trigger fetchDashboardData after mount.
                // This avoids a 401 race on first launch after install.
            },
        }
    )
);

export default useAppStore;
