/**
 * @file revenueCat.js
 * @description RevenueCat service layer.
 *
 * Responsibilities:
 *   - Configure the Purchases SDK once per session (idempotent via `isConfigured` guard).
 *   - Listen to real-time CustomerInfo updates and sync them to Zustand.
 *   - Expose helpers for fetching offerings, purchasing a package, and restoring purchases.
 *
 * WHY dynamic require for useAppStore?
 *   This file is imported at app startup. A static ES-module import of useAppStore
 *   here would create a circular dependency (store → services → store). The dynamic
 *   require() breaks the cycle while still giving us access to the store at call time.
 */

import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const RC_API_KEY_IOS     = process.env.EXPO_PUBLIC_RC_API_KEY_IOS;
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;

/** The entitlement ID configured in the RevenueCat dashboard. */
export const PREMIUM_ENTITLEMENT_ID = 'premium';

/**
 * Initialises the RevenueCat SDK and attaches a CustomerInfo listener.
 * Safe to call multiple times — the `isConfigured` guard makes it idempotent.
 *
 * @param {string} appUserID - The authenticated user's UUID (used to link
 *   RevenueCat subscribers to your backend User rows via webhooks).
 */
export async function initializeRevenueCat(appUserID) {
    // `isConfigured` is a native getter — cast to boolean to guard against
    // undefined/null returns before native modules finish loading on Android.
    if (Boolean(Purchases.isConfigured)) {
        console.log('[RC] Purchases already configured. Setting rcReady to true.');
        const { default: useAppStore } = require('../store/useAppStore');
        useAppStore.getState().setRCReady(true);
        return;
    }

    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);

    const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
    console.log(`[RC] Initializing RevenueCat for ${Platform.OS} with API Key:`, apiKey);

    // String() coercion: user.id may be a UUID object from Zustand rehydration.
    // RevenueCat requires a plain string — [object Object] would create a ghost subscriber.
    Purchases.configure({ apiKey, appUserID: String(appUserID) });

    // Signal to usePaywall that the SDK singleton now exists and getOfferings() is safe.
    // This MUST be set synchronously after configure() and before addCustomerInfoUpdateListener()
    // so that any usePaywall effect that fires after this point sees rcReady=true.
    const { default: useAppStore } = require('../store/useAppStore');
    useAppStore.getState().setRCReady(true);

    // Real-time listener: fires whenever RevenueCat detects a subscription change
    // (e.g., renewal, cancellation, grace period). Keeps Zustand in sync without
    // requiring the user to restart the app.
    Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        const isPremium =
            customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
        useAppStore.getState().setIsPremium(isPremium);
    });
}

export async function fetchCurrentOffering() {
    try {
        console.log('[RC] Fetching current offerings...');
        const offerings = await Purchases.getOfferings();
        console.log('[RC] Fetch success! Offerings object:', JSON.stringify(offerings, null, 2));
        
        if (!offerings || !offerings.current || !offerings.current.availablePackages || offerings.current.availablePackages.length === 0) {
            console.warn('[RC] No current offering configured in dashboard or availablePackages is empty.');
            return null;
        }
        return offerings.current;
    } catch (error) {
        console.error('[RC] Failed to fetch offerings. Catch block triggered!');
        console.error('[RC] Error Code:', error.code);
        console.error('[RC] Error Message:', error.message);
        console.error('[RC] Full error object:', error);
        return null;
    }
}

/**
 * Purchases a package from the current offering.
 *
 * @param {import('react-native-purchases').PurchasesPackage} pkg
 * @returns {Promise<{success: boolean, cancelled?: boolean, error?: string}>}
 */
export async function purchasePackage(pkg) {
    try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const isNowPremium =
            customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;

        if (isNowPremium) {
            const { default: useAppStore } = require('../store/useAppStore');
            useAppStore.getState().setIsPremium(true);
            return { success: true };
        }
        return {
            success: false,
            error: 'Η αγορά ολοκληρώθηκε αλλά το Premium δεν ενεργοποιήθηκε.',
        };
    } catch (error) {
        if (error.userCancelled) return { cancelled: true, success: false };
        console.error('[RC] Purchase failed:', error);
        return { success: false, error: 'Η αγορά απέτυχε.' };
    }
}

/**
 * Restores previous purchases for the current user.
 * Useful when users reinstall the app or switch devices.
 *
 * @returns {Promise<{success: boolean, isPremium: boolean, error?: string}>}
 */
export async function restorePurchases() {
    try {
        const customerInfo = await Purchases.restorePurchases();
        const isPremium =
            customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
        const { default: useAppStore } = require('../store/useAppStore');
        useAppStore.getState().setIsPremium(isPremium);
        return { success: true, isPremium };
    } catch (error) {
        console.error('[RC] Restore failed:', error);
        return { success: false, isPremium: false, error: error.message };
    }
}
