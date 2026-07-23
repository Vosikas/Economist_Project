/**
 * @file PremiumPaywallScreen.jsx
 * @description Paywall gate for the AI Tutor tab with seamless session sync.
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { usePaywall } from '../hooks/usePaywall';
import { CustomAlert } from '../components/CustomAlert';
import { syncUserPremiumStatus } from '../services/revenueCat'; // ← Νέα εισαγωγή για το seamless sync

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const COLOR_BG      = '#0f172a';
const COLOR_PREMIUM = '#8b5cf6';

// ─── Feature List ──────────────────────────────────────────────────────────────
const FEATURES = [
    { icon: 'check-circle', text: 'Απεριόριστες βαθμολογήσεις ανάπτυξης' },
    { icon: 'check-circle', text: 'Ακριβής ανίχνευση λέξεων-κλειδιών' },
    { icon: 'check-circle', text: 'Προσωπικό feedback από AI καθηγητή' },
];

// ─── Package Button ────────────────────────────────────────────────────────────
function PackageCard({ pkg, onPress, isPurchasing, index }) {
    const isAnnual =
        pkg.packageType === 'ANNUAL' ||
        pkg.identifier?.toLowerCase().includes('annual') ||
        pkg.identifier?.toLowerCase().includes('year');

    return (
        <Animated.View
            entering={FadeInDown.duration(350).delay(index * 80)}
            style={styles.pkgWrapper}
        >
            {isAnnual && (
                <View style={styles.pkgBadge}>
                    <Text style={styles.pkgBadgeText}>✦ Καλύτερη Αξία</Text>
                </View>
            )}
            <TouchableOpacity
                style={[styles.pkgCard, isAnnual && styles.pkgCardHighlighted]}
                onPress={onPress}
                activeOpacity={0.8}
                disabled={isPurchasing}
            >
                <Text style={styles.pkgTitle} numberOfLines={1}>
                    {pkg.product?.title ?? pkg.identifier}
                </Text>

                {!!pkg.product?.description && (
                    <Text style={styles.pkgDescription} numberOfLines={2}>
                        {pkg.product.description}
                    </Text>
                )}

                <View style={styles.pkgPriceRow}>
                    <Text style={styles.pkgPrice}>{pkg.product?.priceString ?? '—'}</Text>
                    <Text style={styles.pkgPricePeriod}>
                        {isAnnual ? '/ έτος' : '/ μήνα'}
                    </Text>
                </View>

                <LinearGradient
                    colors={
                        isAnnual ? ['#8b5cf6', '#6d28d9'] : ['#1e293b', '#334155']
                    }
                    style={styles.pkgButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                >
                    {isPurchasing ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <Icon
                                name="crown"
                                size={14}
                                color="#fff"
                                solid
                                style={{ marginRight: 8 }}
                            />
                            <Text style={styles.pkgButtonText}>
                                {isAnnual ? 'Επιλογή Ετήσιου' : 'Επιλογή Μηνιαίου'}
                            </Text>
                        </>
                    )}
                </LinearGradient>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Screen ────────────────────────────────────────────────────────────────────
export default function PremiumPaywallScreen({ navigation }) {
    const [isSyncing, setIsSyncing] = useState(false); // ← State για τη loading οθόνη συγχρονισμού

    const {
        offering,
        isLoading,
        isPurchasing,
        error,
        handlePurchase,
        handleRestore,
        retryFetchOffering,
    } = usePaywall();

    // ── Purchase handler ─────────────────────────────────────────────────────
    const onPackagePress = async (pkg) => {
        console.log('════════════════════════════════════════');
        console.log('[Paywall] 🛒 Purchase initiated');
        console.log('[Paywall]   package identifier :', pkg.identifier);

        const result = await handlePurchase(pkg);

        if (!result) return;

        if (result.cancelled) {
            console.log('[Paywall] 🚫 User cancelled the purchase sheet.');
            return;
        }

        if (result.success) {
            console.log('[Paywall] ✅ Purchase SUCCESS — syncing session O(1)...');
            
            // Δείχνουμε τη loading οθόνη ανανέωσης
            setIsSyncing(true);

            // Κάνουμε fetch το dashboard για να ενημερωθεί το Zustand store ακαριαία
            const synced = await syncUserPremiumStatus();

            setIsSyncing(false);

            if (synced) {
                CustomAlert.alert(
                    'Επιτυχής Αναβάθμιση! 🎉',
                    'Ο AI Tutor είναι πλέον ξεκλειδωμένος!',
                    [{ text: 'Τέλεια', onPress: () => navigation.navigate('AI Tutor') }]
                );
            } else {
                CustomAlert.alert(
                    'Επιτυχής Αγορά!',
                    'Η συνδρομή σου ενεργοποιήθηκε!',
                    [{ text: 'Εντάξει', onPress: () => navigation.navigate('AI Tutor') }]
                );
            }
        } else {
            console.error('[Paywall] ❌ Purchase FAILED. Error:', result.error);
        }
        console.log('════════════════════════════════════════');
    };

    // ── Restore handler ──────────────────────────────────────────────────────
    const onRestorePress = async () => {
        console.log('════════════════════════════════════════');
        console.log('[Paywall] 🔄 Restore initiated');

        const result = await handleRestore();

        if (result?.success) {
            const isPremiumRestored = result.isPremium;
            const msg = isPremiumRestored
                ? 'Το Premium σου αποκαταστάθηκε επιτυχώς!'
                : 'Δεν βρέθηκαν προηγούμενες αγορές Premium.';
            
            CustomAlert.alert('Επαναφορά Αγορών', msg, [
                {
                    text: 'Εντάξει',
                    onPress: isPremiumRestored
                        ? () => navigation.navigate('AI Tutor')
                        : undefined,
                },
            ]);
        } else {
            console.error('[Paywall] ❌ Restore FAILED. Error:', result?.error);
        }
        console.log('════════════════════════════════════════');
    };

    // ── Full-screen loading (SDK fetching offerings OR Syncing Session) ──────────
    if (isLoading || isSyncing) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLOR_PREMIUM} />
                    <Text style={styles.loadingText}>
                        {isSyncing ? 'Ενημέρωση συνδρομής και συγχρονισμός…' : 'Φόρτωση πακέτων…'}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // ── Main render ──────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
                <Animated.View entering={FadeIn.duration(400)} style={styles.paywallContainer}>

                    <LinearGradient
                        colors={['rgba(139,92,246,0.15)', 'transparent']}
                        style={styles.paywallGlow}
                    />

                    <View style={styles.paywallIconRing}>
                        <Icon name="crown" size={36} color={COLOR_PREMIUM} />
                    </View>

                    <Text style={styles.paywallTitle}>AI Tutor</Text>

                    <Text style={styles.paywallSubtitle}>
                        Βαθμολόγησε τις απαντήσεις σου με τεχνητή νοημοσύνη,{' '}
                        μάθε τι παρέλειψες και βελτιώσου πριν τις Πανελλήνιες.
                    </Text>

                    <View style={styles.paywallFeatures}>
                        {FEATURES.map((f, index) => (
                            <View key={index} style={styles.paywallFeatureRow}>
                                <Icon name={f.icon} size={16} color={COLOR_PREMIUM} solid />
                                <Text style={styles.paywallFeatureText}>{f.text}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.divider} />

                    {offering?.availablePackages?.length > 0 ? (
                        offering.availablePackages.map((pkg, index) => (
                            <PackageCard
                                key={pkg.identifier}
                                pkg={pkg}
                                index={index}
                                isPurchasing={isPurchasing}
                                onPress={() => onPackagePress(pkg)}
                            />
                        ))
                    ) : (
                        <Animated.View entering={FadeInDown.duration(300)} style={styles.noOfferings}>
                            <Icon name="exclamation-circle" size={22} color="#f59e0b" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.noOfferingsText}>
                                    Δεν βρέθηκαν διαθέσιμα πακέτα αυτή τη στιγμή.
                                </Text>
                                {typeof retryFetchOffering === 'function' && (
                                    <TouchableOpacity
                                        onPress={retryFetchOffering}
                                        activeOpacity={0.7}
                                        style={styles.retryButton}
                                    >
                                        <Text style={styles.retryButtonText}>↺ Δοκίμασε ξανά</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </Animated.View>
                    )}

                    {!!error && (
                        <Text style={styles.errorText}>{error}</Text>
                    )}

                    <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={onRestorePress}
                        activeOpacity={0.6}
                        disabled={isPurchasing}
                    >
                        <Text style={styles.restoreText}>Επαναφορά Αγορών</Text>
                    </TouchableOpacity>

                    <Text style={styles.legalText}>
                        Η συνδρομή ανανεώνεται αυτόματα. Μπορείς να ακυρώσεις
                        ανά πάσα στιγμή από τις ρυθμίσεις του λογαριασμού σου.
                    </Text>

                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: COLOR_BG,
    },
    scrollContent: {
        flexGrow: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    loadingText: {
        color: '#64748b',
        fontSize: 14,
    },
    paywallContainer: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        paddingBottom: 24,
    },
    paywallGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
    },
    paywallIconRing: {
        width: 88,
        height: 88,
        borderRadius: 44,
        borderWidth: 2,
        borderColor: 'rgba(139,92,246,0.4)',
        backgroundColor: 'rgba(139,92,246,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    paywallTitle: {
        color: '#f1f5f9',
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 12,
    },
    paywallSubtitle: {
        color: '#94a3b8',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 28,
    },
    paywallFeatures: {
        width: '100%',
        marginBottom: 28,
    },
    paywallFeatureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    paywallFeatureText: {
        color: '#e2e8f0',
        fontSize: 15,
        marginLeft: 12,
    },
    divider: {
        width: '100%',
        height: 1,
        backgroundColor: 'rgba(139,92,246,0.2)',
        marginBottom: 24,
    },
    pkgWrapper: {
        width: '100%',
        marginBottom: 14,
    },
    pkgBadge: {
        alignSelf: 'flex-end',
        backgroundColor: COLOR_PREMIUM,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: -1,
    },
    pkgBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.4,
    },
    pkgCard: {
        width: '100%',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(100,116,139,0.3)',
        backgroundColor: 'rgba(30,41,59,0.7)',
        padding: 18,
        overflow: 'hidden',
    },
    pkgCardHighlighted: {
        borderColor: 'rgba(139,92,246,0.6)',
        backgroundColor: 'rgba(139,92,246,0.08)',
        shadowColor: COLOR_PREMIUM,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
    },
    pkgTitle: {
        color: '#f1f5f9',
        fontSize: 17,
        fontWeight: '800',
        marginBottom: 4,
    },
    pkgDescription: {
        color: '#94a3b8',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 12,
    },
    pkgPriceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 16,
    },
    pkgPrice: {
        color: '#f1f5f9',
        fontSize: 24,
        fontWeight: '900',
        marginRight: 4,
    },
    pkgPricePeriod: {
        color: '#64748b',
        fontSize: 13,
    },
    pkgButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
    },
    pkgButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    noOfferings: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: 'rgba(245,158,11,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.25)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    noOfferingsText: {
        color: '#94a3b8',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 8,
    },
    retryButton: {
        alignSelf: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(245,158,11,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.3)',
    },
    retryButtonText: {
        color: '#f59e0b',
        fontSize: 13,
        fontWeight: '600',
    },
    errorText: {
        color: '#f87171',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 8,
    },
    restoreButton: {
        marginTop: 20,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    restoreText: {
        color: '#64748b',
        fontSize: 13,
        textDecorationLine: 'underline',
        textAlign: 'center',
    },
    legalText: {
        color: '#334155',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 16,
        marginTop: 8,
        paddingHorizontal: 8,
    },
});