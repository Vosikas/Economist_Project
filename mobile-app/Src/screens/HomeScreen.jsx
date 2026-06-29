import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Animated, {
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withRepeat,
    withSequence,
} from 'react-native-reanimated';
import useAppStore from '../store/useAppStore';
import api from '../services/apiClient'; // 👉 Προστέθηκε το API!

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Roadmap connector constants ─────────────────────────────────────────────
const CONNECTOR_X = 41;
const ICON_MID_Y = 41;
const CARD_GAP = 16;

const ICON_COLOR_COMPLETED = '#10b981'; // Emerald
const ICON_COLOR_ACTIVE = '#06b6d4'; // Cyan
const ICON_COLOR_LOCKED = '#475569'; // Slate

// ─── Daily Quiz Banner Component ──────────────────────────────────────────────
const DailyQuizBanner = ({ status, onPress }) => {
    const pulseScale = useSharedValue(1);

    useEffect(() => {
        if (status === 'available') {
            pulseScale.value = withRepeat(
                withSequence(
                    withTiming(1.02, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ),
                -1,
                true
            );
        } else {
            pulseScale.value = 1;
        }
    }, [status]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }]
    }));

    if (status === 'loading') {
        return (
            <View style={[styles.dailyQuizContainer, { backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator color="#fbbf24" />
            </View>
        );
    }

    if (status === 'played') {
        return (
            <View style={[styles.dailyQuizContainer, { backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: '#334155' }]}>
                <View style={styles.dailyQuizIconBgPlayed}>
                    <Icon name="check" size={20} color="#10b981" />
                </View>
                <View style={styles.dailyQuizTextContainer}>
                    <Text style={styles.dailyQuizTitlePlayed}>Daily Quiz Ολοκληρώθηκε</Text>
                    <Text style={styles.dailyQuizDescPlayed}>Τα λέμε αύριο για νέο x2 XP!</Text>
                </View>
            </View>
        );
    }

    if (status === 'unavailable') {
        return null; // Το AI δεν έχει φτιάξει το σημερινό quiz ακόμα, το κρύβουμε
    }

    // Διαθέσιμο! (Available)
    return (
        <AnimatedTouchableOpacity 
            activeOpacity={0.9} 
            onPress={onPress} 
            style={[animatedStyle, styles.dailyQuizWrapper]}
        >
            <LinearGradient 
                colors={['#f59e0b', '#d97706']} 
                start={{ x: 0, y: 0 }} 
                end={{ x: 1, y: 1 }} 
                style={styles.dailyQuizContainerActive}
            >
                <View style={styles.dailyQuizIconBgActive}>
                    <Icon name="bolt" size={20} color="#f59e0b" solid />
                </View>
                <View style={styles.dailyQuizTextContainer}>
                    <Text style={styles.dailyQuizTitleActive}>Κουίζ Ημέρας!</Text>
                    <Text style={styles.dailyQuizDescActive}>Παίξε τώρα και κέρδισε διπλά XP (x2)</Text>
                </View>
                <View style={styles.dailyQuizAction}>
                    <Icon name="play-circle" size={28} color="#fff" solid />
                </View>
            </LinearGradient>
        </AnimatedTouchableOpacity>
    );
};

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
const SkeletonCard = () => (
    <View style={styles.chapterCardSkeleton}>
        <View style={styles.chapterCardContent}>
            <View style={styles.skeletonIconBg} />
            <View style={styles.chapterTextContainer}>
                <View style={styles.skeletonTitle} />
                <View style={styles.skeletonDesc} />
                <View style={styles.skeletonDescShort} />
                <View style={styles.skeletonProgressBarBg} />
            </View>
            <View style={styles.skeletonAction} />
        </View>
    </View>
);

// ─── Chapter Card ─────────────────────────────────────────────────────────────
const ChapterCard = ({ chapter, index, isCompleted, isUnlocked, isNextActive, completedLevels, totalLevels, onPress }) => {
    const scale = useSharedValue(1);
    const progressWidth = useSharedValue(0);
    const pulseOpacity = useSharedValue(isNextActive ? 0.4 : 1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const progressAnimatedStyle = useAnimatedStyle(() => ({
        width: `${progressWidth.value}%`,
    }));

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
    }));

    useEffect(() => {
        const percent = totalLevels > 0 ? (completedLevels / totalLevels) * 100 : 0;
        progressWidth.value = withTiming(percent, { duration: 1000 });

        if (isNextActive) {
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.4, { duration: 700 }),
                    withTiming(1.0, { duration: 700 }),
                ),
                -1,
                false
            );
        }
    }, [completedLevels, totalLevels, isNextActive]);

    const handlePressIn = () => {
        if (!isUnlocked) return;
        scale.value = withSpring(0.95, { damping: 10, stiffness: 300 });
    };
    const handlePressOut = () => {
        if (!isUnlocked) return;
        scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    };

    const iconName = isCompleted ? 'check' : !isUnlocked ? 'lock' : 'book-open';
    const iconColor = isCompleted ? ICON_COLOR_COMPLETED : !isUnlocked ? ICON_COLOR_LOCKED : ICON_COLOR_ACTIVE;

    return (
        <Animated.View entering={FadeInUp.delay(300 + index * 50).duration(600)}>
            <AnimatedTouchableOpacity
                style={[
                    styles.chapterCard,
                    isCompleted && styles.chapterCardCompleted,
                    !isUnlocked && styles.chapterCardLocked,
                    isNextActive && styles.chapterCardActiveBorder,
                    animatedStyle,
                ]}
                activeOpacity={0.9}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={isUnlocked ? onPress : undefined}
            >
                {isNextActive && (
                    <Animated.View style={[StyleSheet.absoluteFill, styles.activePulseOverlay, pulseStyle]} pointerEvents="none" />
                )}

                <View style={styles.chapterCardContent}>
                    <View style={[
                        styles.chapterIconBg,
                        isCompleted && { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                        !isUnlocked && { backgroundColor: 'rgba(71,  85, 105, 0.10)' },
                        isNextActive && { backgroundColor: 'rgba(6,  182, 212, 0.15)' },
                    ]}>
                        <Icon name={iconName} size={22} color={iconColor} />
                    </View>

                    <View style={styles.chapterTextContainer}>
                        <Text style={[styles.chapterTitle, !isUnlocked && { color: '#94a3b8' }]}>
                            {chapter.title}
                        </Text>
                        <Text style={[styles.chapterDescription, !isUnlocked && { color: '#475569' }]} numberOfLines={2}>
                            {chapter.description || 'Μάθε τα βασικά της ζήτησης και της προσφοράς.'}
                        </Text>

                        <View style={styles.chapterProgressBarBg}>
                            <Animated.View style={[
                                styles.chapterProgressBarFill,
                                progressAnimatedStyle,
                                isCompleted && { backgroundColor: ICON_COLOR_COMPLETED, shadowColor: ICON_COLOR_COMPLETED, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 5, elevation: 3 },
                                !isUnlocked && { backgroundColor: ICON_COLOR_LOCKED },
                                isNextActive && { backgroundColor: ICON_COLOR_ACTIVE, shadowColor: ICON_COLOR_ACTIVE, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 5, elevation: 3 },
                            ]} />
                        </View>
                    </View>

                    <View style={styles.chapterAction}>
                        {!isUnlocked ? (
                            <Icon name="lock" size={20} color={ICON_COLOR_LOCKED} />
                        ) : isCompleted ? (
                            <Icon name="check-circle" size={24} color={ICON_COLOR_COMPLETED} />
                        ) : (
                            <Icon name="chevron-right" size={20} color={ICON_COLOR_ACTIVE} />
                        )}
                    </View>
                </View>
            </AnimatedTouchableOpacity>
        </Animated.View>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GamifiedHomeScreen() {
    const { 
        user, progress, chapters, isLoading, error, fetchDashboardData,
        shields, lastShieldUpdate, isPremium, refreshShields 
    } = useAppStore();
    
    const navigation = useNavigation();
    
    const [timerText, setTimerText] = useState('');
    const [dailyQuizStatus, setDailyQuizStatus] = useState('loading'); // loading, available, played, unavailable

    // Αρχικό φόρτωμα δεδομένων + Έλεγχος για το Daily Quiz
    useEffect(() => {
        fetchDashboardData();
        
        const checkDailyQuiz = async () => {
            try {
                // Ρωτάμε το API αν το σημερινό quiz είναι έτοιμο
                await api.get('/daily-quiz/today');
                setDailyQuizStatus('available');
            } catch (err) {
                if (err.response?.status === 403) {
                    setDailyQuizStatus('played'); // Το έπαιξε ήδη!
                } else if (err.response?.status === 404) {
                    setDailyQuizStatus('unavailable'); // Το AI δεν το έχει φτιάξει
                } else {
                    setDailyQuizStatus('unavailable'); // Κάποιο άλλο σφάλμα
                }
            }
        };

        checkDailyQuiz();
    }, []);

    // Timer Ασπίδων
    useEffect(() => {
        if (isPremium) {
            setTimerText('Άπειρες');
            return;
        }
        if (shields >= 5) {
            setTimerText('Γεμάτη'); 
            return;
        }

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - lastShieldUpdate;
            const refillMs = 30 * 60 * 1000;
            const remainingMs = refillMs - (elapsed % refillMs);

            if (remainingMs <= 0 || elapsed >= refillMs * (5 - shields)) {
                refreshShields();
            } else {
                const m = Math.floor(remainingMs / 60000);
                const s = Math.floor((remainingMs % 60000) / 1000);
                setTimerText(`${m}:${s < 10 ? '0' : ''}${s}`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [shields, lastShieldUpdate, isPremium, refreshShields]);

    const currentXP = user?.total_xp || 0;
    const streakDays = user?.streak_days || 0;
    const currentCoins = user?.coins || 0;

    const { totalLevels, completedLevelsCount, chapterProgressData } = useMemo(() => {
        const total = chapters ? chapters.reduce((acc, chap) => acc + (chap.levels?.length || 0), 0) : 0;
        const completed = progress ? progress.filter(p => p.is_completed).length : 0;
        let firstUnlockedUncompletedEncountered = false;

        const chapData = (chapters || []).map((chapter, index) => {
            const chapLevelsCount = chapter.levels?.length || 0;
            const completedInChap = progress ? progress.filter(p =>
                p.is_completed && chapter.levels?.some(lvl => lvl.id === p.level_id)
            ).length : 0;

            const isChapCompleted = chapLevelsCount > 0 && completedInChap === chapLevelsCount;

            let isChapUnlocked = true;
            if (index > 0) {
                const prevLevelCount = chapters[index - 1].levels?.length || 0;
                const prevCompleted = progress ? progress.filter(p =>
                    p.is_completed && chapters[index - 1].levels?.some(lvl => lvl.id === p.level_id)
                ).length : 0;
                isChapUnlocked = completedInChap > 0 || (prevLevelCount > 0 && prevCompleted === prevLevelCount);
            }

            let isNextActive = false;
            if (isChapUnlocked && !isChapCompleted && !firstUnlockedUncompletedEncountered) {
                isNextActive = true;
                firstUnlockedUncompletedEncountered = true;
            }

            return {
                id: chapter.id,
                chapter,
                completedLevelsInChapter: completedInChap,
                totalLevelsInChapter: chapLevelsCount,
                isCompleted: isChapCompleted,
                isUnlocked: isChapUnlocked,
                isNextActive,
            };
        });

        return { totalLevels: total, completedLevelsCount: completed, chapterProgressData: chapData };
    }, [chapters, progress]);

    const renderChapterItem = ({ item, index }) => {
        const isFirst = index === 0;
        const isLast = index === chapterProgressData.length - 1;

        const topLineColor = chapterProgressData[index - 1]?.isCompleted ? '#10b981' : '#334155';
        const bottomLineColor = item.isCompleted ? '#10b981' : '#334155';

        return (
            <View style={{ marginBottom: CARD_GAP }}>
                {!isFirst && (
                    <View style={[
                        styles.connector,
                        { left: CONNECTOR_X, top: 0, height: ICON_MID_Y, backgroundColor: topLineColor },
                    ]} />
                )}
                {!isLast && (
                    <View style={[
                        styles.connector,
                        { left: CONNECTOR_X, top: ICON_MID_Y, bottom: -CARD_GAP, backgroundColor: bottomLineColor },
                    ]} />
                )}
                <ChapterCard
                    chapter={item.chapter}
                    index={index}
                    isCompleted={item.isCompleted}
                    isUnlocked={item.isUnlocked}
                    isNextActive={item.isNextActive}
                    completedLevels={item.completedLevelsInChapter}
                    totalLevels={item.totalLevelsInChapter}
                    onPress={() => navigation.navigate('Levels', { chapterId: item.chapter.id })}
                />
            </View>
        );
    };

    if (isLoading && (!chapters || chapters.length === 0)) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.listContainer}>
                    <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </View>
            </SafeAreaView>
        );
    }

    if (error && (!chapters || chapters.length === 0)) {
        return (
            <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
                <Icon name="exclamation-circle" size={50} color="#ef4444" style={{ marginBottom: 15 }} />
                <Text style={{ color: '#f1f5f9', fontSize: 18, textAlign: 'center', marginBottom: 20 }}>
                    {`Σφάλμα: ${error}`}
                </Text>
                <TouchableOpacity style={{ backgroundColor: '#10b981', padding: 12, borderRadius: 10 }} onPress={fetchDashboardData}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Επανάληψη</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* 1. Gamified Header - Stats */}
            <View style={styles.header}>
                
                {/* 🛡️ Shields (Energy) */}
                <View style={[
                    styles.statBadge, 
                    shields > 0 ? styles.shieldBadgeActive : styles.shieldBadgeEmpty
                ]}>
                    <Icon name="shield-alt" size={15} color={shields > 0 ? "#ec4899" : "#ef4444"} style={styles.statIcon} solid />
                    <View style={styles.statCol}>
                        <Text style={[styles.statText, { color: shields > 0 ? '#f472b6' : '#fca5a5' }]}>{shields}</Text>
                        {shields < 5 && !isPremium && (
                             <Text style={[styles.timerText, { color: shields > 0 ? '#fbcfe8' : '#fecaca' }]}>{timerText}</Text>
                        )}
                    </View>
                </View>

                {/* 💰 Coins */}
                <View style={[styles.statBadge, { borderColor: 'rgba(234, 179, 8, 0.4)' }]}>
                    <Icon name="coins" size={15} color="#fbbf24" style={styles.statIcon} />
                    <View style={styles.statCol}>
                        <Text style={[styles.statText, { color: '#fde047' }]}>{currentCoins}</Text>
                    </View>
                </View>

                {/* 🔥 Fire/Streak */}
                <View style={[styles.statBadge, { borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                    <Icon name="fire" size={15} color="#f97316" style={styles.statIcon} />
                    <View style={styles.statCol}>
                        <Text style={[styles.statText, { color: '#fdba74' }]}>{streakDays}</Text>
                    </View>
                </View>
                
                {/* ⭐ XP */}
                <View style={[styles.statBadge, { borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                    <Icon name="star" size={15} color="#34d399" style={styles.statIcon} solid />
                    <View style={styles.statCol}>
                        <Text style={[styles.statText, { color: '#6ee7b7' }]}>{currentXP}</Text>
                    </View>
                </View>
            </View>
            
            {/* 2. Sleek Visual Divider */}
            <View style={styles.dividerContainer}>
                <LinearGradient
                    colors={['transparent', 'rgba(6, 182, 212, 0.5)', 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.dividerLine}
                />
                <View style={styles.dividerIconContainer}>
                    <Icon name="map-marker-alt" size={14} color="#06b6d4" />
                </View>
            </View>

            {/* 3. Chapter List with Daily Quiz inside Header */}
            <View style={styles.listContainer}>
                <FlatList
                    data={chapterProgressData}
                    keyExtractor={(item) => item.id}
                    renderItem={renderChapterItem}
                    contentContainerStyle={styles.flatListContent}
                    initialNumToRender={5}
                    windowSize={5}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyTextPrimary}>Δεν βρέθηκαν κεφάλαια προς το παρόν.</Text>
                        </View>
                    }
                    ListHeaderComponent={
                        <View style={{ marginBottom: 16 }}>
                            {/* 👉 Το Νέο Daily Quiz Banner! */}
                            <DailyQuizBanner 
                                status={dailyQuizStatus} 
                                onPress={() => navigation.navigate('DailyQuiz')} // Προσαρμογή του navigation ονόματος αργότερα
                            />

                            {(completedLevelsCount === 0 && chapters && chapters.length > 0) ? (
                                <Animated.View entering={FadeInUp} style={styles.welcomeBanner}>
                                    <Icon name="rocket" size={20} color={ICON_COLOR_ACTIVE} style={{ marginRight: 10 }} />
                                    <Text style={styles.welcomeText}>Καλώς ήρθες! Ξεκίνα το πρώτο σου μάθημα τώρα!</Text>
                                </Animated.View>
                            ) : null}
                        </View>
                    }
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#0f172a' },

    // Header
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 10, 
        paddingTop: 10, 
        paddingBottom: 15,
        width: '100%',
    },
    
    // Gamified Badges
    statBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30, 41, 59, 0.6)', borderRadius: 14, paddingHorizontal: 4, paddingVertical: 8, borderWidth: 1, marginHorizontal: 4 },
    shieldBadgeActive: { backgroundColor: 'rgba(236, 72, 153, 0.1)', borderColor: 'rgba(236, 72, 153, 0.4)' },
    shieldBadgeEmpty: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.6)' },
    statIcon: { marginRight: 5, textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    statCol: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
    statText: { fontSize: 16, fontWeight: '900', textShadowColor: 'rgba(0, 0, 0, 0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
    timerText: { fontSize: 9, fontWeight: '700', marginTop: -1, letterSpacing: 0.5 },

    // Elegant Divider
    dividerContainer: { position: 'relative', height: 20, justifyContent: 'center', alignItems: 'center', marginVertical: 5, marginHorizontal: 20 },
    dividerLine: { position: 'absolute', width: '100%', height: 1 },
    dividerIconContainer: { backgroundColor: '#0f172a', paddingHorizontal: 10 },

    // List
    listContainer: { flex: 1, paddingHorizontal: 20 },
    flatListContent: { paddingBottom: 100 }, 
    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
    emptyTextPrimary: { color: '#f1f5f9', marginTop: 20, fontSize: 16, textAlign: 'center' },

    // 👉 Styles for Daily Quiz Banner
    dailyQuizWrapper: { marginBottom: 15, shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
    dailyQuizContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 15 },
    dailyQuizContainerActive: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16 },
    dailyQuizIconBgActive: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
    dailyQuizIconBgPlayed: { width: 45, height: 45, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.2)', justifyContent: 'center', alignItems: 'center' },
    dailyQuizTextContainer: { flex: 1, marginLeft: 15 },
    dailyQuizTitleActive: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    dailyQuizDescActive: { color: '#fef3c7', fontSize: 12, opacity: 0.9 },
    dailyQuizTitlePlayed: { color: '#cbd5e1', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    dailyQuizDescPlayed: { color: '#64748b', fontSize: 12 },
    dailyQuizAction: { paddingLeft: 10 },

    // Welcome Banner
    welcomeBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(6, 182, 212, 0.15)', padding: 15, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.3)' },
    welcomeText: { color: '#06b6d4', fontSize: 14, fontWeight: 'bold', flex: 1 },

    // Chapter Card
    chapterCard: { backgroundColor: '#1e293b', borderRadius: 16, borderWidth: 1.5, borderColor: '#334155', borderBottomWidth: 5, borderBottomColor: '#0f172a', overflow: 'hidden' },
    connector: { position: 'absolute', width: 2, zIndex: 0 },
    chapterCardCompleted: { borderColor: '#10b981', borderBottomColor: '#047857' },
    chapterCardLocked: { opacity: 0.7, borderColor: '#334155', borderBottomColor: '#1e293b' },
    chapterCardActiveBorder: { borderColor: '#06b6d4', borderWidth: 1.5, borderBottomWidth: 5, borderBottomColor: '#0891b2', backgroundColor: 'rgba(6, 182, 212, 0.08)', shadowColor: '#06b6d4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 },
    activePulseOverlay: { borderRadius: 16, borderWidth: 2, borderColor: '#06b6d4' },
    chapterCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    chapterIconBg: { width: 55, height: 55, borderRadius: 16, backgroundColor: 'rgba(6, 182, 212, 0.1)', justifyContent: 'center', alignItems: 'center' },
    chapterTextContainer: { flex: 1, marginLeft: 16, marginRight: 12 },
    chapterTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    chapterDescription: { color: '#94a3b8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
    chapterProgressBarBg: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, width: '100%' },
    chapterProgressBarFill: { height: 8, backgroundColor: '#10b981', borderRadius: 4 },
    chapterAction: { justifyContent: 'center', alignItems: 'center', width: 30 },

    // Skeletons
    chapterCardSkeleton: { backgroundColor: '#1e293b', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#334155', opacity: 0.5 },
    skeletonIconBg: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#334155' },
    skeletonTitle: { height: 16, backgroundColor: '#334155', borderRadius: 8, width: '60%', marginBottom: 8 },
    skeletonDesc: { height: 12, backgroundColor: '#334155', borderRadius: 6, width: '90%', marginBottom: 6 },
    skeletonDescShort: { height: 12, backgroundColor: '#334155', borderRadius: 6, width: '40%', marginBottom: 14 },
    skeletonProgressBarBg: { height: 6, backgroundColor: '#334155', borderRadius: 3, width: '100%' },
    skeletonAction: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#334155' },
});