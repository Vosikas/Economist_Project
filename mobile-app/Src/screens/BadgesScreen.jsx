import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';

// Κάνουμε import το custom API client μας
import api from '../services/apiClient'; 

const COLOR_BG = '#0f172a';
const COLOR_CARD = '#1e293b';
const COLOR_PRIMARY = '#06b6d4';

// ─── Χρώματα ανάλογα με το Tier που επιστρέφει το Backend ───
const TIER_COLORS = {
    gold: '#fbbf24',   // Amber 400
    silver: '#94a3b8', // Slate 400
    bronze: '#d97706', // Amber 600
    default: '#06b6d4' // Cyan (Fallback)
};

const BadgeCard = ({ item, index }) => {
    const badgeColor = TIER_COLORS[item.tier?.toLowerCase()] || TIER_COLORS.default;

    return (
        <Animated.View 
            entering={FadeInUp.delay(index * 100).springify()}
            style={[styles.badgeCard, !item.earned && styles.badgeLocked]}
        >
            <View style={[styles.iconContainer, { borderColor: item.earned ? badgeColor : '#334155' }]}>
                {item.earned && (
                    <View style={[styles.glow, { backgroundColor: badgeColor }]} />
                )}
                <Icon 
                    name={item.icon || 'award'} 
                    size={28} 
                    color={item.earned ? badgeColor : '#475569'} 
                    solid={item.earned}
                />
            </View>
            
            <Text style={[styles.badgeTitle, !item.earned && { color: '#64748b' }]}>
                {item.name}
            </Text>
            <Text style={styles.badgeDesc}>{item.description}</Text>
            
            {!item.earned && (
                <View style={styles.lockOverlay}>
                    <Icon name="lock" size={10} color="#94a3b8" />
                </View>
            )}
        </Animated.View>
    );
};

export default function BadgesScreen({ navigation }) {
    const [badges, setBadges] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 🚀 Έφυγε το useAppStore token! Το αναλαμβάνει το api interceptor

    useEffect(() => {
        const fetchBadges = async () => {
            try {
                setIsLoading(true);
                
                // Πολύ πιο καθαρό request! Το api ξέρει ήδη το BASE_URL και βάζει το Token
                const response = await api.get('/badges/definitions');
                
                // Το Axios βάζει το JSON response μέσα στο property .data
                setBadges(response.data);
                
            } catch (error) {
                console.error("Error fetching badges:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchBadges();
    }, []); // 🚀 Έφυγε το token από τα dependencies του useEffect

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Icon name="arrow-left" size={20} color={COLOR_PRIMARY} />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerSubtitle}>ACCOMPLISHMENTS</Text>
                    <Text style={styles.headerTitle}>ΕΠΙΤΕΥΓΜΑΤΑ</Text>
                </View>
            </View>

            <LinearGradient
                colors={['transparent', 'rgba(6, 182, 212, 0.1)', 'transparent']}
                style={styles.divider}
            />

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLOR_PRIMARY} />
                    <Text style={styles.loadingText}>Φόρτωση επιτευγμάτων...</Text>
                </View>
            ) : (
                <FlatList
                    data={badges}
                    keyExtractor={(item) => item.badge_key} 
                    numColumns={2}
                    renderItem={({ item, index }) => <BadgeCard item={item} index={index} />}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingHorizontal: 25, 
        paddingTop: 15, 
        gap: 20 
    },
    backButton: { 
        width: 45, 
        height: 45, 
        borderRadius: 15, 
        backgroundColor: 'rgba(6, 182, 212, 0.1)', 
        justifyContent: 'center', 
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.2)'
    },
    headerSubtitle: { color: COLOR_PRIMARY, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
    headerTitle: { color: '#f1f5f9', fontSize: 26, fontWeight: '900', letterSpacing: 1 },
    divider: { height: 2, width: '100%', marginVertical: 20 },
    
    listContent: { paddingHorizontal: 15, paddingBottom: 40 },
    
    badgeCard: { 
        flex: 1, 
        backgroundColor: COLOR_CARD, 
        margin: 8, 
        borderRadius: 24, 
        padding: 20, 
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    badgeLocked: { 
        opacity: 0.6,
        backgroundColor: 'rgba(30, 41, 59, 0.3)',
    },
    iconContainer: {
        width: 70,
        height: 70,
        borderRadius: 35,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
        position: 'relative',
    },
    glow: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 35,
        opacity: 0.2,
    },
    badgeTitle: { 
        color: '#f1f5f9', 
        fontSize: 14, 
        fontWeight: 'bold', 
        textAlign: 'center',
        marginBottom: 6
    },
    badgeDesc: { 
        color: '#94a3b8', 
        fontSize: 11, 
        textAlign: 'center', 
        lineHeight: 16 
    },
    lockOverlay: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: '#0f172a',
        padding: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#334155'
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    loadingText: {
        color: '#94a3b8',
        marginTop: 15,
        fontSize: 16
    }
});