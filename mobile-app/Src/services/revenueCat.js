import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

export const PREMIUM_ENTITLEMENT_ID = 'E20 Pro';

// BULLETPROOF GUARD: Ο δικός μας διακόπτης
let hasInitializedLocal = false;

export async function initializeRevenueCat(appUserID = null) {
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
        // Pass appUserID at configure time to avoid the anonymous → real ID
        // aliasing window. If not yet available, call logIn() immediately after
        // auth completes — before any purchase is attempted.
        const config = appUserID
            ? { apiKey, appUserID: String(appUserID) }
            : { apiKey };

        Purchases.configure(config);
        console.log(`[RC] ✅ Configured for ${Platform.OS}. appUserID: ${appUserID ?? 'anonymous'}`);
        hasInitializedLocal = true;

        const { default: useAppStore } = require('../store/useAppStore');
        useAppStore.getState().setRCReady(true);

        Purchases.addCustomerInfoUpdateListener((customerInfo) => {
            const isPremium =
                customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;
            console.log('[RC] 👂 CustomerInfo updated. isPremium:', isPremium);
            useAppStore.getState().setIsPremium(isPremium);
        });
    } catch (e) {
        console.error('[RC] Error during configuration:', e);
    }
}

export async function logInRevenueCat(appUserID) {
    if (!hasInitializedLocal) {
        console.warn('[RC] Tried to login, but RevenueCat is not initialized yet.');
        return;
    }
    try {
        await Purchases.logIn(String(appUserID));
        console.log(`[RC] Logged in with appUserID: ${appUserID}`);
    } catch (error) {
        console.error('[RC] Failed to log in user:', error);
    }
}

export async function fetchCurrentOffering(retries = 2) {
    if (!hasInitializedLocal) return null;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`[RC] Fetching offerings (attempt ${attempt}/${retries})...`);
            const offerings = await Purchases.getOfferings();

            if (!offerings?.current?.availablePackages?.length) {
                console.warn('[RC] No current offering configured or availablePackages is empty.');
                return null;
            }

            console.log(
                '[RC] ✅ Offerings loaded:',
                offerings.current.availablePackages.map((p) => p.identifier)
            );
            return offerings.current;
        } catch (error) {
            console.error(`[RC] getOfferings attempt ${attempt} failed:`, error.code, error.message);
            if (attempt === retries) {
                // Throw on final attempt so the hook/UI can show a retry button
                throw error;
            }
            // Brief pause before retry
            await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
    }
    return null;
}

export async function purchasePackage(pkg) {
    console.log('[RC] ▶ purchasePackage called:', pkg?.identifier);
    try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const isNowPremium =
            customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !== undefined;

        if (isNowPremium) {
            const { default: useAppStore } = require('../store/useAppStore');
            useAppStore.getState().setIsPremium(true);
            console.log('[RC] ✅ Purchase success — entitlement active.');
            return { success: true };
        }

        // Purchase went through but entitlement not active — rare, but log it.
        console.warn(
            '[RC] ⚠️ Purchase completed but entitlement NOT active.',
            'Active entitlements:', Object.keys(customerInfo.entitlements.active)
        );
        return {
            success: false,
            error: 'Η αγορά ολοκληρώθηκε αλλά το Premium δεν ενεργοποιήθηκε.',
        };
    } catch (error) {
        // Log the full error object — this is your debug lifeline
        console.error('[RC] ❌ purchasePackage error:', {
            code: error.code,
            message: error.message,
            userCancelled: error.userCancelled,
            underlyingErrorMessage: error.underlyingErrorMessage,
        });

        if (error.userCancelled) {
            console.log('[RC] 🚫 User cancelled the purchase.');
            return { cancelled: true, success: false };
        }

        // Map RevenueCat error codes to user-facing Greek messages
        const errorMessages = {
            PURCHASE_NOT_ALLOWED:
                'Οι αγορές δεν επιτρέπονται σε αυτή τη συσκευή.',
            PAYMENT_PENDING:
                'Η πληρωμή εκκρεμεί. Έλεγξε το λογαριασμό σου στο Play Store.',
            PRODUCT_NOT_AVAILABLE_FOR_PURCHASE:
                'Αυτό το προϊόν δεν είναι διαθέσιμο. Επικοινώνησε με την υποστήριξη.',
            PURCHASE_INVALID:
                'Μη έγκυρη αγορά. Δοκίμασε ξανά.',
            NETWORK_ERROR:
                'Σφάλμα δικτύου. Έλεγξε τη σύνδεσή σου.',
            INSUFFICIENT_PERMISSIONS:
                'Δεν έχεις δικαιώματα για αυτή την αγορά.',
            UNKNOWN:
                'Άγνωστο σφάλμα. Κωδικός: ' + error.code,
        };

        const userMessage =
            errorMessages[error.code] ??
            `Η αγορά απέτυχε. (${error.code ?? 'UNKNOWN'})`;

        return { success: false, error: userMessage, code: error.code };
    }
}

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
    export async function syncUserPremiumStatus() {
    try {
        console.log('[App Sync] 🔄 Syncing user premium status from backend...');
        
        // Χτυπάμε το /dashboard endpoint που επιστρέφει το user object με το ενημερωμένο is_premium
        const response = await api.get('/dashboard');
        
        if (response.data && response.data.user) {
            const isPremium = response.data.user.is_premium;
            
            // Ενημερώνουμε ακαριαία το Zustand store
            const { default: useAppStore } = require('../store/useAppStore');
            useAppStore.getState().setIsPremium(isPremium);
            
            console.log('[App Sync] ✅ Premium status synced successfully. isPremium:', isPremium);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[App Sync] ❌ Failed to sync user status:', error);
        return false;
    }
}
}
