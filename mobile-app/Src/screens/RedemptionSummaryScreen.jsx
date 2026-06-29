import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, ZoomIn, SlideInUp } from 'react-native-reanimated';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

import BadgeUnlockCelebration from '../components/BadgeUnlockCelebration';

export default function RedemptionSummaryScreen({ route, navigation }) {
    const { 
        earnedCoins, 
        totalQuestions, 
        newlyUnlockedBadges 
    } = route.params || {};

    const [showBadge, setShowBadge] = useState(false);

    useEffect(() => {
        if (newlyUnlockedBadges && newlyUnlockedBadges.length > 0) {
            const timer = setTimeout(() => {
                setShowBadge(true);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [newlyUnlockedBadges]);

    // Αν έλυσε έστω και ένα σωστά, παίρνει νομίσματα άρα πέτυχε
    const isSuccess = earnedCoins > 0;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                
                {/* ─── Εικονίδιο Νίκης / Ήττας ─── */}
                <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.iconWrapper}>
                    <View style={styles.iconGlow}>
                        <Icon 
                            name={isSuccess ? "broom" : "times-circle"} 
                            size={70} 
                            color={isSuccess ? "#06b6d4" : "#ef4444"} 
                            solid 
                        />
                    </View>
                </Animated.View>

                {/* ─── Κείμενα ─── */}
                <Animated.View entering={SlideInUp.duration(400).delay(100)} style={styles.textContainer}>
                    <Text style={styles.title}>
                        {isSuccess ? "Σφάλματα Καθαρίστηκαν!" : "Καμία Διόρθωση"}
                    </Text>
                    <Text style={styles.subtitle}>
                        Προσπάθησες να διορθώσεις {totalQuestions} {totalQuestions === 1 ? 'λάθος' : 'λάθη'}.
                    </Text>
                </Animated.View>

                {/* ─── Εντυπωσιακό Coin Badge ─── */}
                {isSuccess && (
                    <Animated.View entering={FadeIn.duration(500).delay(300)} style={styles.coinBadge}>
                        <Icon name="coins" size={24} color="#fbbf24" solid style={{ marginRight: 10 }} />
                        <Text style={styles.coinText}>+{earnedCoins} Νομίσματα</Text>
                    </Animated.View>
                )}

                {/* ─── Κουμπί Επιστροφής ─── */}
                <Animated.View entering={FadeIn.duration(400).delay(500)} style={styles.buttonContainer}>
                    <TouchableOpacity 
                        style={[styles.button, styles.primaryButton]} 
                        onPress={() => navigation.goBack()} // Επιστροφή στο Notebook
                        activeOpacity={0.8}
                    >
                        <Text style={styles.primaryButtonText}>Τέλεια!</Text>
                    </TouchableOpacity>
                </Animated.View>

            </View>

            {/* ─── Badge Animation Queue ─── */}
            <BadgeUnlockCelebration 
                visible={showBadge} 
                badges={newlyUnlockedBadges} 
                onClose={() => setShowBadge(false)} 
            />

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    
    iconWrapper: { marginBottom: 30 },
    iconGlow: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(6, 182, 212, 0.3)',
    },

    textContainer: { alignItems: 'center', marginBottom: 40 },
    title: { fontSize: 28, fontWeight: '900', color: '#f8fafc', textAlign: 'center', marginBottom: 10 },
    subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center' },
    
    coinBadge: { 
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(251, 191, 36, 0.15)', 
        paddingHorizontal: 30, 
        paddingVertical: 18, 
        borderRadius: 20, 
        borderWidth: 2, 
        borderColor: 'rgba(251, 191, 36, 0.4)', 
        marginBottom: 50,
        shadowColor: '#fbbf24',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 8,
    },
    coinText: { fontSize: 28, fontWeight: '900', color: '#fbbf24' },
    
    buttonContainer: { width: '100%', alignItems: 'center' },
    button: { paddingVertical: 18, borderRadius: 50, width: '90%', alignItems: 'center' },
    primaryButton: { 
        backgroundColor: '#06b6d4',
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10,
    },
    primaryButtonText: { color: '#0f172a', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});