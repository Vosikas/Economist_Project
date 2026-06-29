import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import useAppStore from '../store/useAppStore';

const COLOR_BG = '#0f172a';
const COLOR_CARD = '#1e293b';
const COLOR_PRIMARY = '#06b6d4';

const RANK_COLORS = {
    Third: '#b45309',  // Χάλκινο (Δεξιά)
    Second: '#94a3b8', // Ασημένιο (Αριστερά)
    First: '#fbbf24',  // Χρυσό (Μέση)
};

export default function LeaderboardScreen() {
    const { user, leaderboard, isLoadingLeaderboard, fetchLeaderboard } = useAppStore();
    
    // State για το Lazy Loading των χρηστών (ξεκινάμε δείχνοντας 10)
    const [displayCount, setDisplayCount] = useState(10);

    useEffect(() => {
        fetchLeaderboard();
    }, []);

    // Διαχωρισμός Top 3 και Υπολοίπων
    const top3 = leaderboard ? leaderboard.slice(0, 3) : [];
    const remainingUsers = leaderboard ? leaderboard.slice(3) : [];
    
    // Δεδομένα που εμφανίζονται στη λίστα (Pagination logic)
    const visibleData = remainingUsers.slice(0, displayCount);

    // Συνάρτηση που καλείται όταν ο χρήστης φτάσει στο τέλος της λίστας
    const loadMoreUsers = () => {
        if (displayCount < remainingUsers.length) {
            setDisplayCount(prev => prev + 10);
        }
    };

    // ─── Component για τους 3 Πρώτους (Podium) ───
    const PodiumItem = ({ item, rank, height, delay, rank_color_key }) => {
        if (!item) return <View style={styles.podiumPlaceholder} />;
        
        const isFirst = rank === 1;
        const color = RANK_COLORS[rank_color_key];
        const isCurrentUser = user && user.username === item.username;

        return (
            <Animated.View entering={FadeInUp.delay(delay).springify()} style={[styles.podiumWrapper, { height }]}>
                {/* Εικονίδιο / Στέμμα */}
                <View style={[styles.avatarCircle, { borderColor: color, backgroundColor: isCurrentUser ? 'rgba(6, 182, 212, 0.2)' : COLOR_CARD }]}>
                    <Icon name={isFirst ? "crown" : "medal"} size={isFirst ? 28 : 20} color={color} solid />
                </View>
                
                {/* Η κολώνα του βάθρου */}
                <LinearGradient
                    colors={[`${color}40`, 'transparent']} 
                    start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                    style={[styles.podiumPillar, { borderTopColor: color }]}
                >
                    <Text style={[styles.podiumUsername, isCurrentUser && { color: COLOR_PRIMARY }]} numberOfLines={1}>
                        {item.username}
                    </Text>
                    
                    {/* 👇 Αφαιρέθηκε ο αριθμός της θέσης! Δείχνει μόνο το XP κεντραρισμένο */}
                    <View style={styles.podiumStatsWrapper}>
                        <Text style={[styles.podiumXP, { color }]}>{item.total_xp} XP</Text>
                    </View>
                    
                </LinearGradient>
            </Animated.View>
        );
    };

    // ─── Component για την Υπόλοιπη Λίστα (Rank 4+) ───
    const renderItem = ({ item, index }) => {
        const isCurrentUser = user && user.username === item.username;
        const actualRank = index + 4; // Επειδή ξεκινάμε από τον 4ο

        return (
            <Animated.View entering={FadeInUp.duration(400)}>
                <View style={[styles.userCard, isCurrentUser && styles.currentUserCard]}>
                    <View style={styles.rankContainer}>
                        <Text style={styles.rankText}>#{actualRank}</Text>
                    </View>

                    <View style={styles.userInfo}>
                        <Text style={[styles.username, isCurrentUser && { color: COLOR_PRIMARY }]}>
                            {item.username} {isCurrentUser ? "(Εσύ)" : ""}
                        </Text>
                        <View style={styles.statsRow}>
                            <Icon name="fire" size={12} color="#f59e0b" />
                            <Text style={styles.streakText}>{item.streak_days} Ημέρες</Text>
                        </View>
                    </View>

                    <View style={styles.xpContainer}>
                        <Text style={styles.xpText}>{item.total_xp}</Text>
                        <Text style={styles.xpLabel}>XP</Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* ─── Cyberpunk Header ─── */}
            <View style={styles.headerContainer}>
                <Animated.Text entering={FadeInDown.delay(100)} style={styles.headerSubtitle}>
                    GLOBAL NETWORK
                </Animated.Text>
                <Animated.Text entering={FadeInDown.delay(200)} style={styles.headerTitle}>
                    HALL OF FAME
                </Animated.Text>

                <Animated.View entering={FadeInDown.delay(300)} style={styles.circuitDivider}>
                    <LinearGradient colors={['transparent', '#fbbf24', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.circuitLine} />
                    <View style={[styles.circuitNode, { backgroundColor: '#fbbf24' }]} />
                </Animated.View>
            </View>

            {isLoadingLeaderboard ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#fbbf24" />
                </View>
            ) : (
                <FlatList
                    data={visibleData}
                    keyExtractor={(item, index) => `${item.username}-${index}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onEndReached={loadMoreUsers} 
                    onEndReachedThreshold={0.5} 
                    ListHeaderComponent={
                        top3.length > 0 ? (
                            <View style={styles.podiumMainContainer}>
                                {/* 2ος (Αριστερά) */}
                                <PodiumItem item={top3[1]} rank={2} rank_color_key="Second" height={160} delay={500} />
                                {/* 1ος (Μέση - Πιο ψηλός) */}
                                <PodiumItem item={top3[0]} rank={1} rank_color_key="First" height={200} delay={700} />
                                {/* 3ος (Δεξιά) */}
                                <PodiumItem item={top3[2]} rank={3} rank_color_key="Third" height={130} delay={300} />
                            </View>
                        ) : null
                    }
                    ListFooterComponent={
                        displayCount < remainingUsers.length ? (
                            <ActivityIndicator size="small" color={COLOR_PRIMARY} style={{ marginVertical: 20 }} />
                        ) : null
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    
    // Header
    headerContainer: { alignItems: 'center', paddingTop: 15, paddingBottom: 10 },
    headerSubtitle: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', letterSpacing: 3, marginBottom: 5 },
    headerTitle: {
        color: '#f1f5f9', fontSize: 32, fontWeight: '900', letterSpacing: 2,
        textShadowColor: 'rgba(251, 191, 36, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15,
        fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
    },
    circuitDivider: { flexDirection: 'row', alignItems: 'center', width: '70%', height: 10, marginTop: 10, marginBottom: 10 },
    circuitLine: { flex: 1, height: 1, opacity: 0.5 },
    circuitNode: { width: 6, height: 6, transform: [{ rotate: '45deg' }] },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { paddingHorizontal: 20, paddingBottom: 50 },

    // ─── Podium Styles ───
    podiumMainContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', height: 260, marginBottom: 30, marginTop: 10, gap: 10 },
    podiumWrapper: { width: '30%', alignItems: 'center', justifyContent: 'flex-end' },
    podiumPlaceholder: { width: '30%' },
    avatarCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: -28, zIndex: 10, backgroundColor: COLOR_CARD, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 5 },
    podiumPillar: { width: '100%', flex: 1, borderTopWidth: 4, borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', paddingTop: 35, paddingHorizontal: 5, justifyContent: 'space-between', paddingBottom: 10 },
    podiumUsername: { color: '#f1f5f9', fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
    podiumStatsWrapper: { alignItems: 'center', flex: 1, justifyContent: 'center' }, 
    podiumXP: { fontSize: 16, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },

    // ─── List Card Styles (Rank 4+) ───
    userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR_CARD, padding: 16, borderRadius: 16, marginBottom: 10, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5 },
    currentUserCard: { backgroundColor: 'rgba(6, 182, 212, 0.1)', borderColor: COLOR_PRIMARY, borderWidth: 1 },
    rankContainer: { width: 40, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
    rankText: { color: '#64748b', fontSize: 18, fontWeight: '900' },
    userInfo: { flex: 1 },
    username: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    streakText: { color: '#94a3b8', fontSize: 12, marginLeft: 6 },
    xpContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    xpText: { color: '#06b6d4', fontSize: 18, fontWeight: '900' },
    xpLabel: { color: '#64748b', fontSize: 11, fontWeight: 'bold' },
});