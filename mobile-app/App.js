import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import mobileAds from 'react-native-google-mobile-ads';
import AuthWrapper from './Src/navigation/AuthWrapper';
import { CustomAlertModal } from './Src/components/CustomAlert';
import { initializeRevenueCat } from './Src/services/revenueCat';

export default function App() {
    useEffect(() => {
        // Initialize AdMob
        mobileAds()
            .initialize()
            .then(adapterStatuses => {
                console.log('AdMob Initialized', adapterStatuses);
            })
            .catch(error => {
                console.error('AdMob Initialization Error:', error);
            });

        // Initialize RevenueCat SDK at the app root (equivalent to _layout.jsx)
        // This prevents the "There is no singleton instance" error by ensuring
        // Purchases.configure() is called before any screens attempt to getOfferings()
        initializeRevenueCat().catch((e) =>
            console.error('RevenueCat Initialization Error:', e)
        );
    }, []);

    return (
        <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
            <AuthWrapper />
            <CustomAlertModal />
        </SafeAreaProvider>
    );
}