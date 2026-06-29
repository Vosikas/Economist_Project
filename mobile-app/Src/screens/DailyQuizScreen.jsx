import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeInRight, FadeInUp, ZoomIn } from 'react-native-reanimated';
import api from '../services/apiClient';
import useAppStore from '../store/useAppStore';
import { CustomAlert } from '../components/CustomAlert';


const COLOR_BG = '#0f172a';
const COLOR_CARD = '#1e293b';
const COLOR_PRIMARY = '#f59e0b'; // Amber για το Daily Quiz
const COLOR_CORRECT = '#10b981';

export default function DailyQuizScreen({ navigation }) {
    const { fetchDashboardData } = useAppStore();

    // States
    const [status, setStatus] = useState('loading'); // loading, error, playing, submitting, results
    const [errorMessage, setErrorMessage] = useState('');
    const [quizData, setQuizData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0);
    
    // Timer States
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const startTimeRef = useRef(0);
    const timerIntervalRef = useRef(null);

    // Results State
    const [results, setResults] = useState(null);

    // 1. Fetch Quiz on Mount
    useEffect(() => {
        const loadQuiz = async () => {
            try {
                const response = await api.get('/daily-quiz/today');
                setQuizData(response.data);
                setStatus('playing');
                
                // Ξεκινάμε το χρονόμετρο
                startTimeRef.current = Date.now();
                timerIntervalRef.current = setInterval(() => {
                    setElapsedSeconds(prev => prev + 1);
                }, 1000);

            } catch (error) {
                setStatus('error');
                setErrorMessage(error.response?.data?.detail || "Αποτυχία φόρτωσης του Quiz.");
            }
        };

        loadQuiz();

        // Κλείδωμα του Back Button στο Android για να μην φύγει κατά λάθος
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (status === 'playing') {
                CustomAlert.alert('Προσοχή!', 'Αν φύγεις τώρα, θα χάσεις την προσπάθειά σου για σήμερα. Είσαι σίγουρος;', [
                    { text: 'Ακύρωση', style: 'cancel' },
                    { text: 'Έξοδος', style: 'destructive', onPress: () => navigation.goBack() }
                ]);
                return true;
            }
            return false;
        });

        return () => {
            clearInterval(timerIntervalRef.current);
            backHandler.remove();
        };
    }, []);

    // 2. Handle Answer
    const handleAnswer = async (selectedIndex) => {
        const currentQuestion = quizData.questions[currentQuestionIndex];
        let newScore = score;

        if (selectedIndex === currentQuestion.correct_index) {
            newScore = score + 1;
            setScore(newScore);
        }

        // Αν υπάρχει επόμενη ερώτηση
        if (currentQuestionIndex < quizData.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            // ΤΕΛΟΣ ΚΟΥΙΖ
            clearInterval(timerIntervalRef.current);
            setStatus('submitting');
            
            const totalTimeMs = Date.now() - startTimeRef.current;

            try {
                const response = await api.post('/daily-quiz/submit', {
                    quiz_id: quizData.quiz_id,
                    score: newScore,
                    total_time_ms: totalTimeMs
                });
                
                setResults(response.data);
                setStatus('results');
                
                // Ανανεώνουμε τα XP στο Store αθόρυβα
                fetchDashboardData();

            } catch (error) {
                setStatus('error');
                setErrorMessage(error.response?.data?.detail || "Σφάλμα κατά την υποβολή του σκορ.");
            }
        }
    };

    // ─── RENDERS ─────────────────────────────────────────────────────────────

    if (status === 'loading') {
        return (
            <SafeAreaView style={[styles.safeArea, styles.centered]}>
                <ActivityIndicator size="large" color={COLOR_PRIMARY} />
                <Text style={styles.loadingText}>Προετοιμασία πρόκλησης...</Text>
            </SafeAreaView>
        );
    }

    if (status === 'error') {
        return (
            <SafeAreaView style={[styles.safeArea, styles.centered]}>
                <Icon name="exclamation-triangle" size={50} color="#ef4444" style={{ marginBottom: 20 }} />
                <Text style={styles.errorTitle}>Ωχ, κάτι πήγε στραβά</Text>
                <Text style={styles.errorDesc}>{errorMessage}</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>Επιστροφή στον Χάρτη</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (status === 'submitting') {
        return (
            <SafeAreaView style={[styles.safeArea, styles.centered]}>
                <ActivityIndicator size="large" color={COLOR_PRIMARY} />
                <Text style={styles.loadingText}>Υπολογισμός αποτελεσμάτων...</Text>
            </SafeAreaView>
        );
    }

    if (status === 'results' && results) {
        return (
            <SafeAreaView style={[styles.safeArea, styles.centered]}>
                <Animated.View entering={ZoomIn.duration(800)} style={{ alignItems: 'center' }}>
                    <Icon name="trophy" size={80} color={COLOR_PRIMARY} />
                    <Text style={styles.resultsTitle}>Ολοκληρώθηκε!</Text>
                    
                    <View style={styles.statsContainer}>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{results.score}/{quizData?.questions.length}</Text>
                            <Text style={styles.statLabel}>Σωστές</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(results.time_ms / 1000).toFixed(1)}s</Text>
                            <Text style={styles.statLabel}>Χρόνος</Text>
                        </View>
                    </View>

                    <LinearGradient colors={['rgba(16, 185, 129, 0.2)', 'rgba(16, 185, 129, 0.05)']} style={styles.xpBox}>
                        <Icon name="star" size={24} color={COLOR_CORRECT} solid />
                        <Text style={styles.xpText}>+{results.xp_earned} XP</Text>
                    </LinearGradient>

                    <TouchableOpacity style={styles.finishButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.finishButtonText}>Συνέχεια</Text>
                    </TouchableOpacity>
                </Animated.View>
            </SafeAreaView>
        );
    }

    // ─── PLAYING UI ───
    const currentQuestion = quizData.questions[currentQuestionIndex];
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <View style={styles.progressPill}>
                    <Text style={styles.progressText}>Ερώτηση {currentQuestionIndex + 1}/{quizData.questions.length}</Text>
                </View>
                <View style={styles.timerPill}>
                    <Icon name="clock" size={14} color="#fcd34d" solid />
                    <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
                </View>
            </View>

            {/* PROGRESS BAR */}
            <View style={styles.progressBarBg}>
                <Animated.View 
                    style={[styles.progressBarFill, { width: `${((currentQuestionIndex) / quizData.questions.length) * 100}%` }]} 
                />
            </View>

            <View style={styles.content}>
                <Animated.Text key={`q-${currentQuestionIndex}`} entering={FadeInRight.duration(400)} style={styles.questionText}>
                    {currentQuestion.text}
                </Animated.Text>

                <View style={styles.optionsContainer}>
                    {currentQuestion.options.map((option, index) => (
                        <Animated.View key={`opt-${currentQuestionIndex}-${index}`} entering={FadeInUp.delay(index * 100).duration(400)}>
                            <TouchableOpacity 
                                style={styles.optionButton} 
                                activeOpacity={0.7}
                                onPress={() => handleAnswer(index)}
                            >
                                <View style={styles.optionLetterBox}>
                                    <Text style={styles.optionLetter}>{String.fromCharCode(65 + index)}</Text>
                                </View>
                                <Text style={styles.optionText}>{option}</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    centered: { justifyContent: 'center', alignItems: 'center', padding: 20 },
    
    // Loading & Error
    loadingText: { color: '#94a3b8', marginTop: 15, fontSize: 16 },
    errorTitle: { color: '#f1f5f9', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
    errorDesc: { color: '#94a3b8', fontSize: 16, textAlign: 'center', marginBottom: 30 },
    backButton: { backgroundColor: '#334155', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 12 },
    backButtonText: { color: '#fff', fontWeight: 'bold' },

    // Playing UI
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
    progressPill: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20 },
    progressText: { color: '#cbd5e1', fontWeight: 'bold', fontSize: 14 },
    timerPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
    timerText: { color: '#fcd34d', fontWeight: 'bold', fontSize: 16, marginLeft: 6, fontVariant: ['tabular-nums'] },
    
    progressBarBg: { height: 4, backgroundColor: '#334155', marginHorizontal: 20, borderRadius: 2 },
    progressBarFill: { height: 4, backgroundColor: COLOR_PRIMARY, borderRadius: 2 },

    content: { flex: 1, padding: 20 },
    questionText: { color: '#f8fafc', fontSize: 24, fontWeight: 'bold', lineHeight: 34, marginBottom: 40, marginTop: 20 },
    
    optionsContainer: { gap: 15 },
    optionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR_CARD, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
    optionLetterBox: { width: 35, height: 35, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    optionLetter: { color: '#94a3b8', fontWeight: 'bold', fontSize: 16 },
    optionText: { flex: 1, color: '#f1f5f9', fontSize: 16, lineHeight: 24 },

    // Results UI
    resultsTitle: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 20, marginBottom: 30 },
    statsContainer: { flexDirection: 'row', gap: 20, marginBottom: 30 },
    statBox: { backgroundColor: COLOR_CARD, padding: 20, borderRadius: 20, alignItems: 'center', minWidth: 120, borderWidth: 1, borderColor: '#334155' },
    statValue: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 5 },
    statLabel: { color: '#94a3b8', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
    
    xpBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', marginBottom: 50 },
    xpText: { color: COLOR_CORRECT, fontSize: 24, fontWeight: 'bold', marginLeft: 10 },
    
    finishButton: { backgroundColor: COLOR_PRIMARY, width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    finishButtonText: { color: '#0f172a', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});