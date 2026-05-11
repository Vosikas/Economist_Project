import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import useAppStore from '../store/useAppStore';

// Google's Official Test Banner Ad Unit ID
const adUnitId = 'ca-app-pub-3940256099942544/6300978111';

export default function SmartBannerAd() {
    // Read the premium status directly from our Zustand store
    const isPremium = useAppStore((state) => state.user?.is_premium);

    // If the user is a premium subscriber, render nothing
    if (isPremium) {
        return null;
    }

    // Otherwise, render the Adaptive Banner Ad
    return (
        <View style={styles.container}>
            <BannerAd
                unitId={adUnitId}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                requestOptions={{
                    requestNonPersonalizedAdsOnly: true, // Helpful for strict privacy compliance (GDPR/CCPA)
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        backgroundColor: 'transparent',
    },
});
