import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

// BULLETPROOF GUARD: Ο δικός μας διακόπτης
let hasInitializedLocal = false; 

export async function initializeRevenueCat() {
    if (hasInitializedLocal) {
        console.log('[RC] Already configured locally.');
        return;
    }

    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);

    const apiKey = Platform.OS === 'ios' 
        ? process.env.EXPO_PUBLIC_RC_API_KEY_IOS 
        : process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;

    console.log(`[RC] Initializing RevenueCat for ${Platform.OS} with API Key:`, apiKey);

    if (!apiKey) {
        console.error('[RC] CRITICAL ERROR: API Key is undefined. Check your .env file!');
        return;
    }

    try {
        Purchases.configure({ apiKey });
        hasInitializedLocal = true; // Κλειδώνουμε το setup

        const { default: useAppStore } = require('../store/useAppStore');
        useAppStore.getState().setRCReady(true);

        Purchases.addCustomerInfoUpdateListener((customerInfo) => {
            const isPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
            useAppStore.getState().setIsPremium(isPremium);
        });
    } catch (e) {
        console.error("[RC] Error during configuration:", e);
    }
}

export async function logInRevenueCat(appUserID) {
    if (!hasInitializedLocal) {
        console.warn("[RC] Tried to login, but RevenueCat is not initialized yet.");
        return;
    }
    try {
        await Purchases.logIn(String(appUserID));
        console.log(`[RC] Logged in with appUserID: ${appUserID}`);
    } catch (error) {
        console.error('[RC] Failed to log in user:', error);
    }
}

export async function fetchCurrentOffering() {
    if (!hasInitializedLocal) return null;
    
    try {
        console.log('[RC] Fetching current offerings...');
        const offerings = await Purchases.getOfferings();
        console.log('[RC] Fetch success! Offerings found.');
        
        if (!offerings?.current?.availablePackages?.length) {
            console.warn('[RC] No current offering configured or availablePackages is empty.');
            return null;
        }
        return offerings.current;
    } catch (error) {
        console.error('[RC] Failed to fetch offerings:', error);
        return null;
    }
}

export async function purchasePackage(pkg) {
    try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const isNowPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;

        if (isNowPremium) {
            const { default: useAppStore } = require('../store/useAppStore');
            useAppStore.getState().setIsPremium(true);
            return { success: true };
        }
        return { success: false, error: 'Η αγορά ολοκληρώθηκε αλλά το Premium δεν ενεργοποιήθηκε.' };
    } catch (error) {
        if (error.userCancelled) return { cancelled: true, success: false };
        console.error('[RC] Purchase failed:', error);
        return { success: false, error: 'Η αγορά απέτυχε.' };
    }
}

export async function restorePurchases() {
    try {
        const customerInfo = await Purchases.restorePurchases();
        const isPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
        const { default: useAppStore } = require('../store/useAppStore');
        useAppStore.getState().setIsPremium(isPremium);
        return { success: true, isPremium };
    } catch (error) {
        console.error('[RC] Restore failed:', error);
        return { success: false, isPremium: false, error: error.message };
    }
}