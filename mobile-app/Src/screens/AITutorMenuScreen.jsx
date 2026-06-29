import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Dimensions, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, {
    FadeInRight, FadeIn,
    useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing
} from 'react-native-reanimated';
import useAppStore from '../store/useAppStore';

const { width } = Dimensions.get('window');
const COLOR_BG = '#0f172a';
const COLOR_CARD = '#1e293b';
const COLOR_PREMIUM = '#8b5cf6';

function SkeletonCard() {
    const opacity = useSharedValue(0.4);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            false
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View style={[styles.skeletonCard, animStyle]}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonTextContainer}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: '60%', marginTop: 8 }]} />
            </View>
        </Animated.View>
    );
}

export default function AITutorMenuScreen({ navigation }) {
    const chapters = useAppStore((state) => state.chapters);
    const fetchTheoryQuestionsForChapter = useAppStore((state) => state.fetchTheoryQuestionsForChapter);
    const invalidateTheoryCache = useAppStore((state) => state.invalidateTheoryCache);

    const [selectedChapterId, setSelectedChapterId] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [loadState, setLoadState] = useState('idle'); 
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        if (chapters?.length > 0 && !selectedChapterId) {
            setSelectedChapterId(chapters[0].id);
        }
    }, [chapters, selectedChapterId]);

    const loadQuestions = useCallback(async (chapterId, opts = {}) => {
        if (!chapterId) return;
        setLoadState('loading');
        try {
            const data = await fetchTheoryQuestionsForChapter(chapterId, opts);
            setQuestions(data ?? []);
            setLoadState('idle');
        } catch {
            setQuestions([]);
            setLoadState('error');
        }
    }, [fetchTheoryQuestionsForChapter]);

    useEffect(() => {
        loadQuestions(selectedChapterId);
    }, [selectedChapterId, loadQuestions]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        if (invalidateTheoryCache) {
            invalidateTheoryCache(selectedChapterId);
        }
        await loadQuestions(selectedChapterId, { forceRefresh: true });
        setIsRefreshing(false);
    }, [selectedChapterId, invalidateTheoryCache, loadQuestions]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <LinearGradient colors={[COLOR_PREMIUM, '#6d28d9']} style={styles.headerIconBg}>
                    <Icon name="robot" size={24} color="#fff" />
                </LinearGradient>
                <View style={styles.headerTextContainer}>
                    <Text style={styles.headerTitle}>AI Tutor</Text>
                    <Text style={styles.headerSubtitle}>Επίλεξε ερώτηση ανάπτυξης</Text>
                </View>
            </View>

            <View style={styles.chaptersContainer}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={chapters}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                    renderItem={({ item }) => {
                        const isActive = item.id === selectedChapterId;
                        return (
                            <TouchableOpacity
                                style={[styles.chapterTab, isActive && styles.chapterTabActive]}
                                onPress={() => setSelectedChapterId(item.id)}
                                activeOpacity={0.75}
                            >
                                <Text
                                    style={[styles.chapterTabText, isActive && styles.chapterTabTextActive]}
                                    numberOfLines={1}
                                >
                                    {item.title}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>

            <View style={styles.questionsContainer}>
                {loadState === 'loading' ? (
                    <Animated.View entering={FadeIn.duration(200)}>
                        {[...Array(4)].map((_, i) => (
                            <SkeletonCard key={i} />
                        ))}
                    </Animated.View>
                ) : loadState === 'error' ? (
                    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
                        <Icon name="wifi" size={36} color="#334155" />
                        <Text style={styles.emptyStateTitle}>Πρόβλημα σύνδεσης</Text>
                        <Text style={styles.emptyStateText}>Δεν φορτώθηκαν οι ερωτήσεις. Έλεγξε τη σύνδεσή σου.</Text>
                        <TouchableOpacity style={styles.retryBtn} onPress={() => loadQuestions(selectedChapterId, { forceRefresh: true })}>
                            <Text style={styles.retryBtnText}>Δοκίμασε ξανά</Text>
                        </TouchableOpacity>
                    </Animated.View>
                ) : questions.length === 0 ? (
                    <Animated.View entering={FadeIn.duration(300)} style={styles.emptyState}>
                        <Icon name="book-open" size={40} color="#334155" />
                        <Text style={styles.emptyStateTitle}>Έρχονται σύντομα</Text>
                        <Text style={styles.emptyStateText}>Δεν υπάρχουν ακόμα ερωτήσεις για αυτό το κεφάλαιο.</Text>
                    </Animated.View>
                ) : (
                    <FlatList
                        data={questions}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={COLOR_PREMIUM} colors={[COLOR_PREMIUM]} />}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={FadeInRight.delay(index * 80).duration(350)}>
                                <TouchableOpacity
                                    style={styles.questionCard}
                                    // 🔥 ΔΙΟΡΘΩΣΗ: Πάμε στο "AITutor_active"
                                    onPress={() => 
                                                    navigation.getParent()?.navigate('AITutor_active', { 
                                                                question_id: item.id, 
                                                                question_text: item.question_text 
                                                    }) 
                                                    ||    navigation.navigate('AITutor_active', { 
                                                                     question_id: item.id, 
                                                                     question_text: item.question_text 
                                                                                             })
                                                }       
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.questionCardIcon}>
                                        <Icon name="pen-nib" size={16} color={COLOR_PREMIUM} />
                                    </View>
                                    <Text style={styles.questionCardText} numberOfLines={2}>{item.question_text}</Text>
                                    <Icon name="chevron-right" size={14} color="#64748b" />
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 10 },
    headerIconBg: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 15, shadowColor: COLOR_PREMIUM, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    headerTextContainer: { flex: 1 },
    headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
    headerSubtitle: { color: '#94a3b8', fontSize: 14, marginTop: 2 },
    chaptersContainer: { height: 60, marginTop: 10 },
    chapterTab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: COLOR_CARD, marginRight: 10, borderWidth: 1, borderColor: '#334155', justifyContent: 'center' },
    chapterTabActive: { backgroundColor: 'rgba(139, 92, 246, 0.15)', borderColor: COLOR_PREMIUM },
    chapterTabText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
    chapterTabTextActive: { color: COLOR_PREMIUM, fontWeight: 'bold' },
    questionsContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
    questionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR_CARD, padding: 18, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
    questionCardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(139, 92, 246, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    questionCardText: { flex: 1, color: '#f1f5f9', fontSize: 15, lineHeight: 22, paddingRight: 10 },
    skeletonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR_CARD, padding: 18, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
    skeletonIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#334155', marginRight: 15 },
    skeletonTextContainer: { flex: 1 },
    skeletonLine: { height: 14, borderRadius: 7, backgroundColor: '#334155', width: '85%' },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyStateTitle: { color: '#94a3b8', fontSize: 16, fontWeight: 'bold', marginTop: 16 },
    emptyStateText: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },
    retryBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: COLOR_CARD, borderWidth: 1, borderColor: COLOR_PREMIUM },
    retryBtnText: { color: COLOR_PREMIUM, fontWeight: 'bold', fontSize: 14 }
});