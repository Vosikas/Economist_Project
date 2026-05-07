/**
 * @file PremiumPaywallScreen.jsx
 * @description Paywall gate for the AI Tutor tab.
 *
 * INTEGRATION:
 *   - Uses `usePaywall` hook (src/hooks/usePaywall.js) for all RevenueCat logic.
 *   - `offering.availablePackages` drives the dynamic package buttons — no
 *     hardcoded plans. RevenueCat dashboard controls what appears here.
 *   - `handleRestore` is exposed per Apple App Store Review Guidelines §3.1.1
 *     (restore purchases must be accessible without navigating away).
 *
 * PRESERVED:
 *   - COLOR_BG, COLOR_PREMIUM, paywallGlow, paywallIconRing, feature list,
 *     all typography, all animation, all shadow styling.
 */

import React from 'react';
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

// ─── Design Tokens ─────────────────────────────────────────────────────────────
const COLOR_BG      = '#0f172a';
const COLOR_PREMIUM = '#8b5cf6';

// ─── Feature List (static — content-driven, not plan-driven) ──────────────────
const FEATURES = [
    { icon: 'check-circle', text: 'Απεριόριστες βαθμολογήσεις ανάπτυξης' },
    { icon: 'check-circle', text: 'Ακριβής ανίχνευση λέξεων-κλειδιών' },
    { icon: 'check-circle', text: 'Προσωπικό feedback από AI καθηγητή' },
];

// ─── Package Button ────────────────────────────────────────────────────────────

/**
 * A single purchasable package card.
 *
 * WHY a separate component?
 * Each card needs its own animated enter delay (staggered by index) and
 * a selected/highlighted state when the user taps it. Keeping it isolated
 * prevents re-renders of sibling cards.
 *
 * @param {{ pkg: PurchasesPackage, onPress: () => void, isPurchasing: boolean, index: number }} props
 */
function PackageCard({ pkg, onPress, isPurchasing, index }) {
    // RC package identifier heuristics — highlight annual plans as "Best Value"
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
                {/* Package name — pulled from RC dashboard product title */}
                <Text style={styles.pkgTitle} numberOfLines={1}>
                    {pkg.product?.title ?? pkg.identifier}
                </Text>

                {/* Short description (e.g. "Monthly subscription") */}
                {!!pkg.product?.description && (
                    <Text style={styles.pkgDescription} numberOfLines={2}>
                        {pkg.product.description}
                    </Text>
                )}

                {/* Price string — formatted for user locale by RC automatically */}
                <View style={styles.pkgPriceRow}>
                    <Text style={styles.pkgPrice}>{pkg.product?.priceString ?? '—'}</Text>
                    <Text style={styles.pkgPricePeriod}>
                        {isAnnual ? '/ έτος' : '/ μήνα'}
                    </Text>
                </View>

                {/* CTA gradient — shown in loading state during an active purchase */}
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
    const { offering, isLoading, isPurchasing, error, handlePurchase, handleRestore } =
        usePaywall();

    // ── Purchase handler ─────────────────────────────────────────────────────
    const onPackagePress = async (pkg) => {
        console.log('════════════════════════════════════════');
        console.log('[Paywall] 🛒 Purchase initiated');
        console.log('[Paywall]   package identifier :', pkg.identifier);
        console.log('[Paywall]   packageType        :', pkg.packageType);
        console.log('[Paywall]   priceString        :', pkg.product?.priceString);
        console.log('[Paywall]   productIdentifier  :', pkg.product?.identifier);
        console.log('────────────────────────────────────────');

        const result = await handlePurchase(pkg);

        console.log('[Paywall] 📦 handlePurchase result:', JSON.stringify(result, null, 2));

        if (!result) {
            // handlePurchase returned undefined — this should never happen
            console.warn('[Paywall] ⚠️  result is undefined/null — handlePurchase did not return a value.');
            return;
        }

        if (result.cancelled) {
            console.log('[Paywall] 🚫 User cancelled the purchase sheet — no action taken.');
            return;
        }

        if (result.success) {
            console.log('[Paywall] ✅ Purchase SUCCESS — navigating to AI Tutor.');
            CustomAlert.alert(
                'Επιτυχής Αναβάθμιση! 🎉',
                'Ο AI Tutor είναι πλέον ξεκλειδωμένος!',
                [{ text: 'Τέλεια', onPress: () => navigation.navigate('AI Tutor') }]
            );
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

        console.log('[Paywall] 📦 handleRestore result:', JSON.stringify(result, null, 2));

        if (result?.success) {
            const isPremiumRestored = result.isPremium;
            console.log('[Paywall] ✅ Restore SUCCESS — isPremium:', isPremiumRestored);
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

    // ── Full-screen loading (SDK fetching offerings) ──────────────────────────
    if (isLoading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLOR_PREMIUM} />
                    <Text style={styles.loadingText}>Φόρτωση πακέτων…</Text>
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

                    {/* ── Purple ambient glow — PRESERVED ── */}
                    <LinearGradient
                        colors={['rgba(139,92,246,0.15)', 'transparent']}
                        style={styles.paywallGlow}
                    />

                    {/* ── Crown icon ring — PRESERVED ── */}
                    <View style={styles.paywallIconRing}>
                        <Icon name="crown" size={36} color={COLOR_PREMIUM} />
                    </View>

                    {/* ── Headline — PRESERVED ── */}
                    <Text style={styles.paywallTitle}>AI Tutor</Text>

                    {/* ── Subtitle — PRESERVED ── */}
                    <Text style={styles.paywallSubtitle}>
                        Βαθμολόγησε τις απαντήσεις σου με τεχνητή νοημοσύνη,{' '}
                        μάθε τι παρέλειψες και βελτιώσου πριν τις Πανελλήνιες.
                    </Text>

                    {/* ── Feature list — PRESERVED ── */}
                    <View style={styles.paywallFeatures}>
                        {FEATURES.map((f, index) => (
                            <View key={index} style={styles.paywallFeatureRow}>
                                <Icon name={f.icon} size={16} color={COLOR_PREMIUM} solid />
                                <Text style={styles.paywallFeatureText}>{f.text}</Text>
                            </View>
                        ))}
                    </View>

                    {/* ── Divider ── */}
                    <View style={styles.divider} />

                    {/* ── Dynamic package buttons (from RevenueCat dashboard) ── */}
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
                        // Fallback: no offerings configured in RC dashboard yet
                        <Animated.View entering={FadeInDown.duration(300)} style={styles.noOfferings}>
                            <Icon name="exclamation-circle" size={22} color="#f59e0b" />
                            <Text style={styles.noOfferingsText}>
                                Δεν βρέθηκαν διαθέσιμα πακέτα αυτή τη στιγμή.
                                Δοκίμασε ξανά αργότερα.
                            </Text>
                        </Animated.View>
                    )}

                    {/* ── Inline purchase error ── */}
                    {!!error && (
                        <Text style={styles.errorText}>{error}</Text>
                    )}

                    {/* ── Restore Purchases — required by Apple §3.1.1 ── */}
                    <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={onRestorePress}
                        activeOpacity={0.6}
                        disabled={isPurchasing}
                    >
                        <Text style={styles.restoreText}>Επαναφορά Αγορών</Text>
                    </TouchableOpacity>

                    {/* ── Legal fine-print ── */}
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
    // ── Layout ────────────────────────────────────────────────────────────────
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

    // ── Paywall container — PRESERVED ─────────────────────────────────────────
    paywallContainer: {
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        paddingBottom: 24,
    },

    // ── Glow — PRESERVED ──────────────────────────────────────────────────────
    paywallGlow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
    },

    // ── Icon ring — PRESERVED ─────────────────────────────────────────────────
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

    // ── Typography — PRESERVED ────────────────────────────────────────────────
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

    // ── Feature list — PRESERVED ──────────────────────────────────────────────
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

    // ── Divider ───────────────────────────────────────────────────────────────
    divider: {
        width: '100%',
        height: 1,
        backgroundColor: 'rgba(139,92,246,0.2)',
        marginBottom: 24,
    },

    // ── Package card ──────────────────────────────────────────────────────────
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
        marginBottom: -1, // overlaps card top border cleanly
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
        // Glow shadow
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

    // ── No offerings fallback ─────────────────────────────────────────────────
    noOfferings: {
        flexDirection: 'row',
        alignItems: 'center',
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
        flex: 1,
        lineHeight: 20,
    },

    // ── Error text ────────────────────────────────────────────────────────────
    errorText: {
        color: '#f87171',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 8,
    },

    // ── Restore button ────────────────────────────────────────────────────────
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

    // ── Legal fine-print ──────────────────────────────────────────────────────
    legalText: {
        color: '#334155',
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 16,
        marginTop: 8,
        paddingHorizontal: 8,
    },
});