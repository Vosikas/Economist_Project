import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, ZoomIn, SlideInUp } from 'react-native-reanimated';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

import BadgeUnlockCelebration from '../components/BadgeUnlockCelebration';
import { CustomAlert } from '../components/CustomAlert';
import SmartBannerAd from '../components/SmartBannerAd';
import { useRewardedAd, TestIds } from 'react-native-google-mobile-ads';
import useAppStore from '../store/useAppStore';


export default function LevelSummaryScreen({ route, navigation }) {
    const { 
        xpGained, 
        accuracy, 
        passed, 
        levelId, 
        chapterId, 
        nextLevelId,
        newlyUnlockedBadges 
    } = route.params || {};

    const [showBadge, setShowBadge] = useState(false);
    
    // ─── Gamification: Multiplier State ───
    const [isDoubled, setIsDoubled] = useState(false);
    const isPremium = useAppStore((state) => state.user?.is_premium);

    // ─── Rewarded Ad Setup ───
    const { isLoaded, isClosed, load, show, isEarnedReward } = useRewardedAd(TestIds.REWARDED, {
        requestNonPersonalizedAdsOnly: true,
    });

    useEffect(() => {
        // Preload the rewarded ad if the user is not premium
        if (!isPremium) {
            load();
        }
    }, [load, isPremium, isClosed]);

    useEffect(() => {
        if (isEarnedReward) {
            // API call to backend would go here
            setIsDoubled(true);
        }
    }, [isEarnedReward]);

    useEffect(() => {
        // Ελέγχουμε αν μας ήρθαν ΑΛΗΘΙΝΑ badges από το API
        if (newlyUnlockedBadges && newlyUnlockedBadges.length > 0) {
            const timer = setTimeout(() => {
                setShowBadge(true);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [newlyUnlockedBadges]);

    // ─── Ad Handler ───
    const handleWatchAd = () => {
        if (isPremium) {
            // Premium users get it for free immediately
            setIsDoubled(true);
            return;
        }

        if (isLoaded) {
            show();
        } else {
            CustomAlert.alert(
                "Διαφήμιση μη διαθέσιμη", 
                "Δεν βρέθηκε διαφήμιση αυτή τη στιγμή. Το διπλασιάζουμε δωρεάν!", 
                [{ 
                    text: "Τέλεια!", 
                    onPress: () => setIsDoubled(true) 
                }]
            );
        }
    };

    const displayXp = isDoubled ? (xpGained || 0) * 2 : (xpGained || 0);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                
                <Animated.View entering={ZoomIn.duration(400).springify()} style={styles.iconWrapper}>
                    <Icon name={passed ? "trophy" : "times-circle"} size={80} color={passed ? "#f59e0b" : "#ef4444"} solid />
                </Animated.View>

                <Animated.View entering={SlideInUp.duration(400).delay(100)}>
                    <Text style={styles.title}>{passed ? "Επίπεδο Ολοκληρώθηκε!" : "Προσπάθησε Ξανά!"}</Text>
                    <Text style={styles.subtitle}>Ακρίβεια: {accuracy}%</Text>
                </Animated.View>

                {/* ─── XP Badge (Δυναμικό) ─── */}
                <Animated.View entering={FadeIn.duration(500).delay(300)} style={[styles.xpBadge, isDoubled && styles.xpBadgeDoubled]}>
                    <Text style={[styles.xpText, isDoubled && styles.xpTextDoubled]}>
                        +{displayXp} XP {isDoubled && '🔥'}
                    </Text>
                </Animated.View>

                <Animated.View entering={FadeIn.duration(400).delay(500)} style={styles.buttonContainer}>
                    
                    {/* ─── Ad Button (Μόνο αν πέρασε και δεν το έχει πατήσει) ─── */}
                    {passed && !isDoubled && displayXp > 0 && (
                        <TouchableOpacity style={[styles.button, styles.adButton]} onPress={handleWatchAd}>
                            <Icon name="video" size={18} color="#fff" style={{ marginRight: 10 }} />
                            <Text style={styles.adButtonText}>Διπλασιασμός XP! 📺</Text>
                        </TouchableOpacity>
                    )}

                    {passed ? (
                        <TouchableOpacity 
                            style={[styles.button, styles.primaryButton]} 
                            onPress={() => {
                                if (nextLevelId) {
                                    navigation.replace('Quiz', { levelId: nextLevelId });
                                } else {
                                    navigation.navigate('Levels', { chapterId: chapterId });
                                }
                            }}
                        >
                            <Text style={styles.primaryButtonText}>
                                {nextLevelId ? "Επόμενο Level" : "Συνέχεια στο Χάρτη"}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity 
                            style={[styles.button, styles.primaryButton, { backgroundColor: '#ef4444' }]} 
                            onPress={() => navigation.replace('Quiz', { levelId: levelId })}
                        >
                            <Text style={styles.primaryButtonText}>Επανάληψη Κουίζ</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity 
                        style={[styles.button, styles.secondaryButton]} 
                        onPress={() => {
                            if (chapterId) {
                                navigation.navigate('Levels', { chapterId: chapterId });
                            } else {
                                navigation.navigate('HomeTabs', { screen: 'Roadmap' });
                            }
                        }}
                    >
                        <Text style={styles.secondaryButtonText}>Επιστροφή</Text>
                    </TouchableOpacity>
                </Animated.View>

            </View>

            <BadgeUnlockCelebration 
                visible={showBadge} 
                badges={newlyUnlockedBadges} 
                onClose={() => setShowBadge(false)} 
            />

            {/* ─── Smart Banner Ad at the Bottom ─── */}
            <SmartBannerAd />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    iconWrapper: { marginBottom: 30 },
    title: { fontSize: 28, fontWeight: '900', color: '#f1f5f9', textAlign: 'center', marginBottom: 10 },
    subtitle: { fontSize: 18, color: '#94a3b8', textAlign: 'center', marginBottom: 30 },
    
    // XP Badge Base
    xpBadge: { backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 20, borderWidth: 2, borderColor: '#f59e0b', marginBottom: 40 },
    xpText: { fontSize: 32, fontWeight: '900', color: '#f59e0b' },
    
    // XP Badge Doubled (Γίνεται Μωβ/Ροζ όταν διπλασιαστεί)
    xpBadgeDoubled: { backgroundColor: 'rgba(139, 92, 246, 0.15)', borderColor: '#8b5cf6', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 15, elevation: 10 },
    xpTextDoubled: { color: '#c4b5fd' }, // Ανοιχτό μωβ

    buttonContainer: { width: '100%', gap: 15 },
    button: { paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    
    // Ad Button
    adButton: { 
        backgroundColor: '#8b5cf6', // Violet 500
        flexDirection: 'row', 
        justifyContent: 'center', 
        shadowColor: '#8b5cf6', 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.4, 
        shadowRadius: 8, 
        elevation: 5 
    },
    adButtonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

    primaryButton: { backgroundColor: '#06b6d4' },
    primaryButtonText: { color: '#0f172a', fontSize: 18, fontWeight: 'bold' },
    secondaryButton: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#334155' },
    secondaryButtonText: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold' }
});