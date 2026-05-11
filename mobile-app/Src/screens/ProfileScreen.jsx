import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import useAppStore from '../store/useAppStore';

const COLOR_BG = '#0f172a';
const COLOR_CARD = 'rgba(30, 41, 59, 0.5)'; 
const COLOR_PRIMARY = '#06b6d4'; 

const getUserTitle = (level) => {
    if (level < 5) return 'Αρχάριος Οικονομολόγος';
    if (level < 10) return 'Αναλυτής';
    if (level < 20) return 'Μάνατζερ';
    return 'Υπουργός Οικονομικών';
};

const ClickableStatCard = ({ icon, value, label, color, bgColor, borderColor, onPress }) => (
    <TouchableOpacity 
        onPress={onPress}
        activeOpacity={0.8}
        style={[styles.statCard, { borderColor: borderColor, shadowColor: color }]}
    >
        <View style={[styles.iconWrapper, { backgroundColor: bgColor }]}>
            <Icon name={icon} size={20} color={color} />
        </View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        {onPress && <Icon name="external-link-alt" size={10} color={color} style={styles.linkIcon} />}
    </TouchableOpacity>
);

export default function ProfileScreen({ navigation }) {
    const { user, userBadges, fetchUserBadges } = useAppStore();

    useEffect(() => {
        if (fetchUserBadges) fetchUserBadges();
    }, []);

    const currentXP = user?.total_xp || 0;
    const streakDays = user?.streak_days || 0;
    const currentCoins = user?.coins || 0;
    const unlockedBadgesCount = userBadges?.length || 0;
    
    const currentLevel = Math.floor(currentXP/100) + 1;
    const progressPercent = currentXP % 100;

    const scale = useSharedValue(0.8);
    useEffect(() => { scale.value = withSpring(1, { damping: 12, stiffness: 100 }); }, []);
    const animatedGridStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Top Right Settings Icon (Προαιρετικό, αλλά βολικό) */}
            <View style={styles.topActions}>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
                    <Icon name="cog" size={22} color="#64748b" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                {/* HERO SECTION */}
                <Animated.View entering={FadeInUp.duration(600)} style={styles.headerWrapper}>
                    <View style={styles.headerGlow} />
                    <LinearGradient colors={['rgba(30, 41, 59, 0.9)', 'rgba(15, 23, 42, 0.95)']} style={styles.headerCard}>
                        <View style={styles.avatarContainer}>
                            <View style={styles.avatarRing}><Icon name="user-astronaut" size={40} color={COLOR_PRIMARY} /></View>
                            <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>LVL {currentLevel}</Text></View>
                        </View>
                        <Text style={styles.username}>{user?.username || 'Παίκτης'}</Text>
                        <Text style={styles.userTitle}>{getUserTitle(currentLevel)}</Text>
                        
                        <View style={styles.progressContainer}>
                            <View style={styles.progressTextRow}>
                                <Text style={styles.progressText}>{currentXP} XP</Text>
                                <Text style={styles.progressText}>{currentLevel * 100} XP</Text>
                            </View>
                            <View style={styles.progressBarBg}>
                                <Animated.View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* STATS GRID */}
                <Animated.View style={[styles.statsMainContainer, animatedGridStyle]}>
                    <View style={styles.statsRow}>
                        <ClickableStatCard icon="star" value={currentXP} label="ΣΥΝΟΛΙΚΟ XP" color="#10b981" bgColor="rgba(16, 185, 129, 0.15)" borderColor="rgba(16, 185, 129, 0.4)" />
                        <ClickableStatCard icon="fire" value={streakDays} label="STREAK" color="#f59e0b" bgColor="rgba(245, 158, 11, 0.15)" borderColor="rgba(245, 158, 11, 0.4)" />
                    </View>
                    <View style={styles.statsRow}>
                        <ClickableStatCard icon="coins" value={currentCoins} label="ΝΟΜΙΣΜΑΤΑ" color="#eab308" bgColor="rgba(234, 179, 8, 0.15)" borderColor="rgba(234, 179, 8, 0.4)" />
                        <ClickableStatCard icon="award" value={unlockedBadgesCount} label="ΕΠΙΤΕΥΓΜΑΤΑ" color="#8b5cf6" bgColor="rgba(139, 92, 246, 0.15)" borderColor="rgba(139, 92, 246, 0.4)" onPress={() => navigation.navigate('BadgesScreen')}/>
                    </View>
                </Animated.View>

                {/* PREMIUM BANNER */}
                <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                    <TouchableOpacity activeOpacity={0.8} style={styles.premiumContainer}>
                        <LinearGradient colors={['#8b5cf6', '#d946ef']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.premiumGradient}>
                            <View style={styles.premiumIconBg}><Icon name="crown" size={20} color="#fff" /></View>
                            <View style={styles.premiumTextContainer}>
                                <Text style={styles.premiumTitle}>20_E Premium</Text>
                                <Text style={styles.premiumSubtitle}>Ξεκλείδωσε τον AI Καθηγητή σου</Text>
                            </View>
                            <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.7)" />
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    topActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 10 },
    settingsBtn: { padding: 8, backgroundColor: COLOR_CARD, borderRadius: 12 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 10 },
    headerWrapper: { alignItems: 'center', marginBottom: 25 },
    headerGlow: { position: 'absolute', top: 20, width: '70%', height: 100, backgroundColor: COLOR_PRIMARY, borderRadius: 50, opacity: 0.15 },
    headerCard: { width: '100%', alignItems: 'center', padding: 25, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.2)' },
    avatarContainer: { alignItems: 'center', marginBottom: 15 },
    avatarRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLOR_PRIMARY, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' },
    levelBadge: { position: 'absolute', bottom: -10, backgroundColor: COLOR_PRIMARY, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    levelBadgeText: { color: '#0f172a', fontSize: 11, fontWeight: 'bold' },
    username: { color: '#f1f5f9', fontSize: 24, fontWeight: '900' },
    userTitle: { color: '#06b6d4', fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 15 },
    progressContainer: { width: '100%', marginTop: 10 },
    progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressText: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold' },
    progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: COLOR_PRIMARY, borderRadius: 4 },
    statsMainContainer: { marginBottom: 25, gap: 12 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: COLOR_CARD, padding: 16, borderRadius: 20, alignItems: 'center', borderWidth: 1.5 },
    iconWrapper: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    statValue: { color: '#f1f5f9', fontSize: 22, fontWeight: '900' },
    statLabel: { color: '#94a3b8', fontSize: 9, fontWeight: 'bold', marginTop: 4 },
    linkIcon: { position: 'absolute', top: 10, right: 10, opacity: 0.5 },
    premiumContainer: { marginBottom: 25, borderRadius: 20, overflow: 'hidden', shadowColor: '#d946ef', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    premiumGradient: { flexDirection: 'row', alignItems: 'center', padding: 20 },
    premiumIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    premiumTextContainer: { flex: 1, marginLeft: 15 },
    premiumTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    premiumSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }
});