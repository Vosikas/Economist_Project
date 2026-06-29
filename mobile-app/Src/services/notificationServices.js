import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './apiClient'; // Το δικό σου Axios instance

// 1. Ρύθμιση συμπεριφοράς όταν το app είναι ανοιχτό (Foreground)
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false, // Χωρίς ήχο όπως ζήτησες
        shouldSetBadge: true,
    }),
});

// 2. Η κύρια συνάρτηση που θα καλούμε
export const registerForPushNotificationsAsync = async () => {
    let token;

    // Τα Android απαιτούν Notification Channel (Υποχρεωτικό)
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#06b6d4', // Το primary color σου
        });
    }

    if (Device.isDevice) {
        // Έλεγχος τρέχουσας άδειας
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        // Αν δεν έχει δώσει άδεια, του πετάμε το popup
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
            console.log('⚠️ [NOTIFICATIONS] Ο χρήστης αρνήθηκε τις ειδοποιήσεις.');
            return null;
        }

        // Λήψη του Expo Push Token
        try {
            // Παίρνουμε το projectId δυναμικά από το app.json
            const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
            
            if (!projectId) {
                console.warn('⚠️ Δεν βρέθηκε Project ID. Βεβαιώσου ότι έχεις κάνει "eas init".');
            }

            token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            console.log('📱 [NOTIFICATIONS] To Expo Token είναι:', token);

            // Στέλνουμε το token στο Backend χρησιμοποιώντας το έτοιμο api interceptor σου
            await api.post('/update-push-token', { token: token });
            console.log('✅ [NOTIFICATIONS] Το Token αποθηκεύτηκε επιτυχώς στη βάση!');

        } catch (error) {
            console.error('❌ [NOTIFICATIONS] Σφάλμα κατά τη διαδικασία:', error);
        }
    } else {
        console.log('⚠️ [NOTIFICATIONS] Χρησιμοποιείς Emulator. Τα Push Notifications απαιτούν φυσική συσκευή.');
    }

    return token;
};