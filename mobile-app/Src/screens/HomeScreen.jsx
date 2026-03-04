// src/screens/GamifiedHomeScreen.jsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons'; // ΣΩΣΤΟ ΓΙΑ EXPO
import Animated, { FadeInUp, FadeInLeft } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// Placeholder δεδομένα για το design
const quizCategories = [
    { id: 1, title: 'Βασικές Ένοιες', icon: 'coins', powerScore: '50' },
    { id: 2, title: 'Ζήτηση & Προσφορά', icon: 'chart-line', powerScore: '120' },
    { id: 3, title: 'Ελαστικότητες', icon: 'expand-arrows-alt', powerScore: '180' },
    { id: 4, title: 'Κόστος Παραγωγής', icon: 'industry', powerScore: '250' },
];

export default function GamifiedHomeScreen({ onLogout, username }) {

    const currentLevel = 3;
    const currentXP = 750;
    const nextLevelXP = 1000;
    const progress = (currentXP / nextLevelXP) * 100;

    return (
        <View style={styles.container}>
            {/* 1. Gamified Header */}
            <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.header}>
                <Animated.View entering={FadeInUp.delay(100)} style={styles.headerTop}>
                    <View style={styles.avatarContainer}>
                        <Icon name="user-ninja" size={30} color="#f1f5f9" style={styles.avatar} />
                        <View style={styles.levelBadge}>
                            <Text style={styles.levelText}>{currentLevel}</Text>
                        </View>
                    </View>
                    <View style={styles.scoreContainer}>
                        <Text style={styles.welcomeText}>Καλωσήρθες,</Text>
                        <Text style={styles.usernameText}>{username || 'Player 1'}</Text>
                    </View>
                    <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
                        <Icon name="power-off" size={20} color="#ef4444" />
                    </TouchableOpacity>
                </Animated.View>

                {/* 2. Progress Bar (Experience) */}
                <Animated.View entering={FadeInUp.delay(300)} style={styles.progressContainer}>
                    <Text style={styles.xpText}>{currentXP} / {nextLevelXP} XP</Text>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                    </View>
                </Animated.View>
            </LinearGradient>

            {/* 3. Main Content (Αποστολές) */}
            <ScrollView style={styles.content}>
                <Animated.Text entering={FadeInLeft.delay(500)} style={styles.sectionTitle}>Οι Αποστολές σου</Animated.Text>
                
                {quizCategories.map((category, index) => (
                    <Animated.View 
                        entering={FadeInUp.delay(600 + index * 100).duration(800)} 
                        key={category.id}
                        style={styles.categoryCard}
                    >
                        <TouchableOpacity style={styles.categoryButton}>
                            <View style={styles.cardIconBg}>
                                <Icon name={category.icon} size={25} color="#06b6d4" />
                            </View>
                            <View style={styles.cardTextContainer}>
                                <Text style={styles.cardTitle}>{category.title}</Text>
                                <View style={styles.powerScoreContainer}>
                                    <Icon name="bolt" size={12} color="#f59e0b" />
                                    <Text style={styles.powerScoreText}>{category.powerScore} Power XP</Text>
                                </View>
                            </View>
                            <View style={styles.cardAction}>
                                <Icon name="play-circle" size={30} color="rgba(241, 245, 249, 0.5)" />
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    // Header
    header: { padding: 25, paddingTop: 50, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 10 },
    headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    avatarContainer: { position: 'relative' },
    avatar: { backgroundColor: '#334155', padding: 10, borderRadius: 25 },
    levelBadge: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#06b6d4', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
    levelText: { color: '#0f172a', fontWeight: 'bold', fontSize: 12 },
    scoreContainer: { flex: 1, marginLeft: 15 },
    welcomeText: { color: '#94a3b8', fontSize: 14 },
    usernameText: { color: '#f1f5f9', fontSize: 20, fontWeight: 'bold' },
    logoutButton: { padding: 10 },
    // Progress
    progressContainer: { marginTop: 10 },
    xpText: { color: '#94a3b8', fontSize: 12, textAlign: 'right', marginBottom: 5 },
    progressBarBg: { height: 10, backgroundColor: '#334155', borderRadius: 5 },
    progressBarFill: { height: 10, backgroundColor: '#06b6d4', borderRadius: 5 },
    // Content
    content: { flex: 1, padding: 20, paddingTop: 30 },
    sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },
    categoryCard: { backgroundColor: '#fff', borderRadius: 20, marginBottom: 15, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0' },
    categoryButton: { flexDirection: 'row', alignItems: 'center', padding: 15 },
    cardIconBg: { backgroundColor: '#e0f7fa', padding: 15, borderRadius: 15 },
    cardTextContainer: { flex: 1, marginLeft: 15 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    powerScoreContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
    powerScoreText: { color: '#f59e0b', fontSize: 12, marginLeft: 5, fontWeight: 'bold' },
    cardAction: { marginLeft: 10 },
});