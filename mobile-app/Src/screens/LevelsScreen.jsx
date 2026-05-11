import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence,
    FadeInUp,
} from 'react-native-reanimated';

import useAppStore from '../store/useAppStore';

// ─── Colors ──────────────────────────────────────────────────────────────────
const COLOR_COMPLETED = '#10b981'; // Green
const COLOR_ACTIVE    = '#06b6d4'; // Cyan
const COLOR_LOCKED    = '#475569'; // Slate
const COLOR_BG        = '#0f172a'; // Navy
const COLOR_LINE      = '#334155'; // Dark Line

// Helper για το χρώμα του δαχτυλιδιού βάσει score
const getRingColor = (score) => {
    if (!score || score === 0) return 'transparent';
    if (score <= 30) return '#ef4444'; // Κόκκινο
    if (score <= 79) return '#f59e0b'; // Πορτοκαλί
    return '#10b981'; // Πράσινο
};

// ─── Individual Level Node Component ─────────────────────────────────────────
const LevelNode = ({ level, index, isCompleted, isLocked, isActive, isLast, onPress }) => {
    const pulseOpacity = useSharedValue(isActive ? 0.4 : 1);
    
    useEffect(() => {
        if (isActive) {
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.3, { duration: 800 }),
                    withTiming(1.0, { duration: 800 })
                ),
                -1, false
            );
        }
    }, [isActive]);

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
        transform: [{ scale: 1 + (1 - pulseOpacity.value) * 0.1 }],
    }));

    const bgColor  = isCompleted ? COLOR_COMPLETED : isLocked ? COLOR_LOCKED  : COLOR_ACTIVE;
    const iconName = isCompleted ? 'check'         : isLocked ? 'lock'        : 'play';
    const ringColor = getRingColor(level.score);

    const isEven = index % 2 === 0;
    const horizontalOffset = isEven ? -30 : 30;

    return (
        <Animated.View entering={FadeInUp.delay(index * 150).springify()} style={styles.nodeContainer}>
            <View style={{ transform: [{ translateX: horizontalOffset }], alignItems: 'center' }}>
                
                {/* Visual Connector Line */}
                {!isLast && (
                    <View style={[
                        styles.connectorLine,
                        {
                            backgroundColor: isCompleted ? COLOR_COMPLETED : COLOR_LINE,
                            transform: [
                                { translateY: 45 },
                                { rotate: isEven ? '20deg' : '-20deg' },
                                { translateX: isEven ? 18 : -18 }
                            ],
                        }
                    ]} />
                )}

                {/* Progress Ring Wrapper */}
                <View style={[
                    styles.progressRing, 
                    { 
                        borderColor: ringColor,
                        borderWidth: level.score > 0 ? 4 : 0,
                        padding: level.score > 0 ? 4 : 0 
                    }
                ]}>
                    <TouchableOpacity 
                        activeOpacity={isLocked ? 1 : 0.8}
                        style={styles.nodeTouchable}
                        onPress={() => {
                            if (isLocked) return;
                            onPress(level);
                        }}
                    >
                        {isActive && (
                            <Animated.View style={[StyleSheet.absoluteFill, styles.activePulseRing, pulseStyle, { borderColor: bgColor }]} />
                        )}

                        <View style={[styles.circle, { backgroundColor: bgColor }]}>
                            <View style={[styles.circleInner, { borderBottomColor: isCompleted ? '#059669' : isLocked ? '#334155' : '#0891b2' }]}>
                                <Icon name={iconName} size={24} color="#ffffff" style={isActive && { marginLeft: 3 }} />
                            </View>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Level Title & Score Tag */}
                <View style={styles.nodeLabelContainer}>
                    <Text style={styles.nodeLabelText} numberOfLines={1}>
                        {level.title}
                    </Text>
                    {level.score > 0 && (
                        <Text style={[styles.scoreText, { color: ringColor }]}>
                            {level.score}% Ακρίβεια
                        </Text>
                    )}
                </View>

            </View>
        </Animated.View>
    );
};

// ─── Main Screen Component ───────────────────────────────────────────────────
export default function LevelsScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    const { chapters, progress } = useAppStore();

    const chapterId = route.params?.chapterId;
    const chapter = chapters?.find(ch => ch.id === chapterId);
    
    if (!chapter) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <Text style={{color: 'white', textAlign: 'center', marginTop: 50}}>Chapter not found.</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{marginTop: 20}}>
                    <Text style={{color: COLOR_ACTIVE, textAlign: 'center'}}>Επιστροφή</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    const levels = chapter.levels || [];

    // Pre-calculate completed status & scores
    const enrichedLevels = levels.map((lvl, index) => {
        const userProgress = progress?.find(p => p.level_id === lvl.id);
        const isCompleted = userProgress?.is_completed || false;
        const score = userProgress?.score || 0; // Τραβάμε το σκορ!
        
        let isLocked = false;
        if (index > 0) {
            const prevLvl = levels[index - 1];
            const prevCompleted = progress?.some(p => p.level_id === prevLvl.id && p.is_completed) || false;
            if (!prevCompleted) {
                isLocked = true;
            }
        }
        
        const isActive = !isCompleted && !isLocked;

        return { ...lvl, isCompleted, isLocked, isActive, score };
    });

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.replace('Tabs', { screen: 'Roadmap' })} style={styles.backButton}><Icon name="arrow-left" size={20} color="#f1f5f9" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{chapter.title}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {enrichedLevels.length === 0 ? (
                    <Text style={{color: '#94a3b8', textAlign: 'center', marginTop: 40}}>
                        Δεν υπάρχουν διαθέσιμα επίπεδα.
                    </Text>
                ) : null}

                <View style={styles.pathContainer}>
                    {enrichedLevels.map((lvl, index) => (
                        <LevelNode 
                            key={lvl.id}
                            level={lvl}
                            index={index}
                            isCompleted={lvl.isCompleted}
                            isLocked={lvl.isLocked}
                            isActive={lvl.isActive}
                            isLast={index === enrichedLevels.length - 1}
                            onPress={(level) => navigation.navigate('Quiz', { 
                                levelId: level.id, 
                                chapterId: chapter.id, 
                                title: level.title 
                            })}
                        />
                    ))}
                </View>
                <View style={{height: 60}} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, backgroundColor: '#111827', borderBottomWidth: 1, borderBottomColor: '#1e293b', elevation: 10, zIndex: 10 },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { flex: 1, color: '#f1f5f9', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
    scrollContent: { paddingTop: 50, paddingBottom: 100, alignItems: 'center' },
    pathContainer: { width: '100%', alignItems: 'center' },
    nodeContainer: { marginBottom: 50, width: '100%', alignItems: 'center', position: 'relative', zIndex: 2 },
    
    // Νέο Style για το δαχτυλίδι
    progressRing: { borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
    
    nodeTouchable: { width: 70, height: 70, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    circle: { width: 70, height: 70, borderRadius: 35, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
    circleInner: { flex: 1, borderRadius: 35, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 4 },
    activePulseRing: { borderRadius: 50, borderWidth: 3, width: 76, height: 76, top: -3, left: -3 },
    connectorLine: { position: 'absolute', width: 8, height: 80, borderRadius: 4, top: 40, zIndex: -1 },
    nodeLabelContainer: { marginTop: 12, backgroundColor: 'rgba(30, 41, 59, 0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#334155', alignItems: 'center', minWidth: 100 },
    nodeLabelText: { color: '#f1f5f9', fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
    scoreText: { marginTop: 4, fontSize: 11, fontWeight: '900', textAlign: 'center' }
});