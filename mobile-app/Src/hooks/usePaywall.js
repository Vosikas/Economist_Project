/**
 * @file usePaywall.js
 * @description Custom hook that encapsulates all paywall UI state.
 *
 * KEY FIX — Why rcReady instead of empty dep array:
 *
 * React Navigation's Bottom Tab Navigator mounts ALL tab screens immediately
 * when the navigator first renders — including PremiumPaywallScreen, even if the
 * user is on the Roadmap tab. React runs effects children-before-parents within
 * the same commit, so usePaywall's `useEffect` fires BEFORE AuthWrapper's
 * `useEffect([user?.id])` can call initializeRevenueCat().
 *
 * With an empty dep array, fetchCurrentOffering() runs against an unconfigured
 * SDK and throws "There is no singleton instance."
 *
 * With `[rcReady]` as the dependency:
 *   1. rcReady starts as false  →  effect skips, isLoading stays true (spinner)
 *   2. AuthWrapper's effect runs →  initializeRevenueCat() →  setRCReady(true)
 *   3. rcReady flips to true    →  this effect re-runs  →  fetchCurrentOffering()
 *      is now safe ✅
 *
 * This works for ALL authentication paths:
 *   - Boot with saved token  →  dashboardData fetch sets user → RC init → rcReady
 *   - Fresh login            →  same flow, just triggered later
 *   - OAuth callback         →  same flow
 */

import { useState, useEffect, useCallback } from 'react';
import useAppStore from '../store/useAppStore';
import {
    fetchCurrentOffering,
    purchasePackage as rcPurchasePackage,
    restorePurchases as rcRestore,
} from '../services/revenueCat';

/**
 * @returns {{
 *   offering: import('react-native-purchases').PurchasesOffering | null,
 *   isLoading: boolean,
 *   isPurchasing: boolean,
 *   error: string | null,
 *   handlePurchase: (pkg: import('react-native-purchases').PurchasesPackage) => Promise<any>,
 *   handleRestore: () => Promise<any>,
 * }}
 */
export function usePaywall() {
    // Subscribe to the RC readiness signal from the store.
    // Granular selector — only re-renders this hook when rcReady changes,
    // not on every store update.
    const rcReady = useAppStore((state) => state.rcReady);

    const [offering, setOffering]         = useState(null);
    const [isLoading, setIsLoading]       = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [error, setError]               = useState(null);

    // Fetch offerings only after the RC SDK singleton is confirmed ready.
    // `rcReady` as the dependency guarantees this effect re-runs the moment
    // initializeRevenueCat() signals completion, regardless of which render
    // cycle PremiumPaywallScreen was mounted in.
    useEffect(() => {
        if (!rcReady) return; // SDK not yet configured — wait for the signal

        let mounted = true;
        (async () => {
            const result = await fetchCurrentOffering();
            if (mounted) {
                setOffering(result);
                setIsLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [rcReady]);

    /**
     * Initiates a purchase flow for the given package.
     * Sets isPurchasing during the network call so the UI can show a spinner.
     *
     * @param {import('react-native-purchases').PurchasesPackage} pkg
     */
    const handlePurchase = useCallback(async (pkg) => {
        setIsPurchasing(true);
        setError(null);
        const result = await rcPurchasePackage(pkg);
        setIsPurchasing(false);
        if (result.cancelled) return; // User dismissed the OS payment sheet — no error shown
        if (!result.success) setError(result.error ?? 'Άγνωστο σφάλμα.');
        return result;
    }, []);

    /**
     * Triggers a purchase restore for the current App Store / Play Store account.
     */
    const handleRestore = useCallback(async () => {
        setIsPurchasing(true);
        setError(null);
        const result = await rcRestore();
        setIsPurchasing(false);
        if (!result.success) setError(result.error ?? 'Η επαναφορά απέτυχε.');
        return result;
    }, []);

    return { offering, isLoading, isPurchasing, error, handlePurchase, handleRestore };
}
