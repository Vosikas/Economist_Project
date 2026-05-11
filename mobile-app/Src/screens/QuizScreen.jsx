import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeIn, Layout, ZoomIn, FadeOut } from 'react-native-reanimated';

import useAppStore from '../store/useAppStore';
import MultipleChoice from '../components/MultipleChoice';
import Match from '../components/Match';
import FillIn from '../components/Fill_in';
import { CustomAlert } from '../components/CustomAlert';


// ─── Gamified Premium Palette ────────────────────────────────────────────────
const COLOR_BG        = '#0f172a'; // Slate 900
const COLOR_CARD      = '#1e293b'; // Slate 800
const COLOR_PRIMARY   = '#06b6d4'; // Cyan 500
const COLOR_SUCCESS   = '#10b981'; // Emerald 500
const COLOR_WARNING   = '#f59e0b'; // Amber 500
const COLOR_GOLD      = '#fbbf24'; // Gold
const COLOR_ERROR     = '#ef4444'; // Red 500
const COLOR_TEXT      = '#f8fafc'; // Slate 50
const COLOR_MUTED     = '#64748b'; // Slate 500
const COLOR_BORDER    = '#334155'; // Slate 700

// ─── Shield Modal Component ──────────────────────────────────────────────────
const ShieldRechargeModal = ({ visible, onClose, onWatchAd, onUseCoins }) => {
    if (!visible) return null;

    return (
        <Modal transparent animationType="fade" visible={visible}>
            <View style={modalStyles.overlay}>
                <Animated.View entering={ZoomIn.springify()} exiting={FadeOut} style={modalStyles.content}>
                    <View style={modalStyles.iconContainer}>
                        <Icon name="shield-alt" size={50} color={COLOR_ERROR} solid />
                        <Icon name="bolt" size={24} color="#fff" style={modalStyles.boltIcon} />
                    </View>
                    
                    <Text style={modalStyles.title}>Η Θωράκιση Έπεσε!</Text>
                    <Text style={modalStyles.desc}>
                        Δεν έχεις άλλες ασπίδες για να συνεχίσεις. Αναπλήρωσε τη θωράκισή σου για να επιστρέψεις στο παιχνίδι.
                    </Text>

                    {/* Κουμπί Διαφήμισης (Ad Placeholder) */}
                    <TouchableOpacity style={modalStyles.adButton} onPress={onWatchAd} activeOpacity={0.8}>
                        <Icon name="video" size={16} color="#fff" />
                        <Text style={modalStyles.adButtonText}>Δες βίντεο (+1 🛡️)</Text>
                    </TouchableOpacity>

                    {/* Κουμπί Νομισμάτων */}
                    <TouchableOpacity style={modalStyles.coinButton} onPress={onUseCoins} activeOpacity={0.8}>
                        <Icon name="coins" size={16} color={COLOR_GOLD} />
                        <Text style={modalStyles.coinButtonText}>Χρήση 50 Νομισμάτων (Full 🛡️)</Text>
                    </TouchableOpacity>

                    {/* Κουμπί Διαφυγής (Επιστροφή στο Μενού) */}
                    <TouchableOpacity style={modalStyles.closeButton} onPress={onClose}>
                        <Text style={modalStyles.closeText}>Εγκατάλειψη Προσπάθειας</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
};

export default function QuizScreen() {
    const route = useRoute();
    const navigation = useNavigation();
    
    // ─── STORE ACTIONS ───
    const { 
        completeLevel, 
        fetchQuestionsForLevel, 
        shields, 
        decreaseShield, 
        user // Χρειαζόμαστε το user για να δούμε τα coins
    } = useAppStore();

    const { levelId } = route.params || {};

    const [questions, setQuestions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [isAnswered, setIsAnswered] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [score, setScore] = useState(0);
    const [wrongQuestionIds, setWrongQuestionIds] = useState([]);
    
    // ─── ΝΕΟ: Έλεγχος εμφάνισης του Modal Ασπίδων ───
    const [showShieldModal, setShowShieldModal] = useState(false);

    useEffect(() => {
        // Αν ο χρήστης μπαίνει στο Quiz χωρίς Ασπίδες, τον πετάμε έξω με μήνυμα!
        if (shields <= 0) {
            CustomAlert.alert(
                "Αδυναμία Συμμετοχής 🛡️", 
                "Δεν έχεις αρκετές ασπίδες για να ξεκινήσεις το Quiz.",
                [{ text: "Επιστροφή", onPress: () => navigation.goBack() }]
            );
            return;
        }

        const fetchQuestions = async () => {
            try {
                const fetchedData = await fetchQuestionsForLevel(levelId);
                if (!fetchedData || fetchedData.length === 0) throw new Error('Empty questions');

                const formattedQuestions = fetchedData.map(q => {
                    let cIndex = -1;
                    if (q.options && Array.isArray(q.options)) {
                        cIndex = q.options.findIndex(opt => opt === q.correct_answer);
                    }
                    return {
                        id: q.id,
                        type: q.type || 'multiple_choice',
                        question: q.question || q.question_text,
                        options: q.options || [],
                        correctIndex: cIndex,
                        explanation: q.explanation,
                        correct_answers: q.correct_answers || [],
                        pairs: q.pairs || []
                    };
                });

                const shuffled = formattedQuestions.sort(() => Math.random() - 0.5);
                const selectedQuestions = shuffled.slice(0, 7);

                setQuestions(selectedQuestions);
            } catch (error) {
                console.error("Fetch Questions Error:", error);
                CustomAlert.alert('Σφάλμα', 'Αδυναμία φόρτωσης ερωτήσεων.');
                navigation.goBack();
            } finally {
                setIsLoading(false);
            }
        };
        fetchQuestions();
    }, [levelId, shields, navigation]);

    const handleAnswer = (isCorrect) => {
        if (isAnswered || isSubmitting) return;

        setIsAnswered(true);
        const question = questions[currentQuestionIndex];

        if (isCorrect) {
            setScore(prev => prev + 1);
        } else {
            // 1. Καταγράφουμε το λάθος
            setWrongQuestionIds(prev => [...prev, question.id]);
            
            // 2. Αφαιρούμε 1 Ασπίδα (κλήση στο Store)
            decreaseShield();
            
            // 3. Ελέγχουμε αν ξεμείναμε! (Προσοχή: το state 'shields' αργεί λίγο, γι' αυτό τσεκάρουμε αν ήταν <= 1)
            if (shields <= 1) {
                // Περιμένουμε λίγο να δει το λάθος του και πετάμε το Modal
                setTimeout(() => {
                    setShowShieldModal(true);
                }, 1000); 
                return; // Δεν προχωράμε στην επόμενη ερώτηση
            }
        }

        const nextStepDelay = isCorrect ? 800 : 3500;

        setTimeout(async () => {
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                setIsAnswered(false);
            } else {
                submitQuiz(isCorrect, question.id);
            }
        }, nextStepDelay);
    };

    const submitQuiz = async (lastWasCorrect, lastQuestionId) => {
        setIsSubmitting(true);
        try {
            const finalScore = lastWasCorrect ? score + 1 : score;
            const finalWrongIds = lastWasCorrect ? wrongQuestionIds : [...wrongQuestionIds, lastQuestionId];

            const result = await completeLevel(levelId, finalScore, finalWrongIds, questions.length);
            
            const { chapters } = useAppStore.getState();
            let resolvedChapterId = null;
            let nextLevelId = null;

            const parentChapter = chapters.find(c => c.levels.some(l => l.id === levelId));

            if (parentChapter) {
                resolvedChapterId = parentChapter.id;
                const currentLevelIndex = parentChapter.levels.findIndex(l => l.id === levelId);
                
                if (currentLevelIndex !== -1 && currentLevelIndex < parentChapter.levels.length - 1) {
                    nextLevelId = parentChapter.levels[currentLevelIndex + 1].id;
                }
            }

            navigation.replace('LevelSummary', {
                xpGained: result.xp_gained,
                accuracy: result.accuracy,
                passed: result.passed,
                levelId: levelId,
                chapterId: resolvedChapterId,
                nextLevelId: nextLevelId,
                newlyUnlockedBadges: result.badges_earned 
            });
        } catch (err) {
            console.error("Sync Error:", err);
            CustomAlert.alert('Σφάλμα', 'Αποτυχία συγχρονισμού προόδου.');
            navigation.goBack();
        } finally {
            setIsSubmitting(false); 
        }
    };

    // ─── Modal Handlers ───
    const handleWatchAd = () => {
        // ΕΔΩ ΘΑ ΜΠΕΙ Η ΛΟΓΙΚΗ ΓΙΑ ΤΙΣ ΔΙΑΦΗΜΙΣΕΙΣ (π.χ. react-native-google-mobile-ads)
        CustomAlert.alert("Προσεχώς! 📺", "Το σύστημα διαφημίσεων δεν έχει ενεργοποιηθεί ακόμα.", [
            { 
                text: "ΟΚ", 
                onPress: () => {
                    // ΠΡΟΣΩΡΙΝΑ: Του δίνουμε μια ασπίδα τσάμπα για να δοκιμάζεις το app
                    useAppStore.getState().addShields(1); 
                    setShowShieldModal(false);
                    
                    // Αφού πήρε την ασπίδα, τον προχωράμε!
                    if (currentQuestionIndex < questions.length - 1) {
                        setCurrentQuestionIndex(prev => prev + 1);
                        setIsAnswered(false);
                    } else {
                        submitQuiz(false, questions[currentQuestionIndex].id);
                    }
                }
            }
        ]);
    };

    const handleUseCoins = () => {
        const currentUserCoins = user?.coins || 0;
        
        if (currentUserCoins < 50) {
            CustomAlert.alert("Ανεπαρκή Νομίσματα", "Χρειάζεσαι 50 νομίσματα για να γεμίσεις τις ασπίδες σου.");
            return;
        }

        CustomAlert.alert("Ανάκτηση 🛡️", "Πλήρωσες 50 Νομίσματα και η θωράκισή σου γέμισε!", [
            {
                text: "Συνέχεια",
                onPress: () => {
                    // Εδώ ιδανικά πρέπει να κάνεις και ένα API Call στο backend για να αφαιρέσεις τα coins.
                    // Προς το παρόν ενημερώνουμε το Store:
                    useAppStore.getState().addShields(5); 
                    setShowShieldModal(false);
                    
                    if (currentQuestionIndex < questions.length - 1) {
                        setCurrentQuestionIndex(prev => prev + 1);
                        setIsAnswered(false);
                    } else {
                        submitQuiz(false, questions[currentQuestionIndex].id);
                    }
                }
            }
        ]);
    };

    const handleAbortQuiz = () => {
        setShowShieldModal(false);
        navigation.goBack();
    };


    const renderQuestionComponent = (currentQuestion) => {
        switch (currentQuestion.type) {
            case 'multiple_choice':
                return <MultipleChoice question={currentQuestion} isAnswered={isAnswered} onAnswer={handleAnswer} />;
            case 'fill_in':
                return <FillIn question={currentQuestion} isAnswered={isAnswered} onAnswer={handleAnswer} />;
            case 'match':
                return <Match question={currentQuestion} isAnswered={isAnswered} onAnswer={handleAnswer} />;
            default:
                return <Text style={styles.errorText}>Άγνωστος τύπος ερώτησης!</Text>;
        }
    };

    if (isLoading || shields <= 0 && !showShieldModal) return (
        <View style={[styles.safeArea, styles.center]}>
            <ActivityIndicator size="large" color={COLOR_PRIMARY} />
        </View>
    );

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return null;

    const wasWrong = isAnswered && wrongQuestionIds.includes(currentQuestion.id);
    const progressPercentage = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                
                {/* ─── HUD HEADER ─── */}
                <View style={styles.hudHeader}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
                        <Icon name="times" size={18} color={COLOR_MUTED} />
                    </TouchableOpacity>
                    
                    <View style={styles.progressPill}>
                        <Text style={styles.progressText}>
                            {currentQuestionIndex + 1} <Text style={{color: COLOR_MUTED, fontWeight: '400'}}>/</Text> {questions.length}
                        </Text>
                    </View>
                    
                    <View style={styles.scorePill}>
                        <Icon name="shield-alt" size={12} color={shields > 0 ? COLOR_PRIMARY : COLOR_ERROR} solid />
                        <Text style={[styles.scoreText, {color: shields > 0 ? COLOR_PRIMARY : COLOR_ERROR}]}>{shields}</Text>
                    </View>
                </View>

                {/* ─── THIN NEON PROGRESS BAR ─── */}
                <View style={styles.progressBarBg}>
                    <Animated.View 
                        style={[styles.progressBarFill, { width: `${progressPercentage}%` }]} 
                        layout={Layout.springify().damping(20)} 
                    />
                </View>

                {/* ─── DYNAMIC QUESTION CONTENT ─── */}
                <Animated.View 
                    key={currentQuestion.id} 
                    entering={FadeIn.duration(300)} 
                    style={styles.contentContainer}
                >
                    {renderQuestionComponent(currentQuestion)}
                </Animated.View>

                {/* ─── MINIMAL EXPLANATION TOAST ─── */}
                {wasWrong && currentQuestion.explanation && (
                    <Animated.View entering={FadeIn.duration(300)} style={styles.explanationToast}>
                        <View style={styles.explanationHeader}>
                            <Icon name="lightbulb" size={16} color={COLOR_WARNING} solid />
                            <Text style={styles.explanationTitle}>Επεξήγηση</Text>
                        </View>
                        <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
                    </Animated.View>
                )}

                {/* ─── SHIELD MODAL ─── */}
                <ShieldRechargeModal 
                    visible={showShieldModal} 
                    onClose={handleAbortQuiz} 
                    onWatchAd={handleWatchAd}
                    onUseCoins={handleUseCoins}
                />

            </View>
        </SafeAreaView>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safeArea: { 
        flex: 1, 
        backgroundColor: COLOR_BG 
    },
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 25,
    },
    center: { 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    
    // --- HUD Header ---
    hudHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: 25,
    },
    iconBtn: { 
        width: 40, 
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.03)', 
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    progressPill: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    progressText: { 
        color: COLOR_TEXT, 
        fontWeight: '700', 
        fontSize: 15,
        letterSpacing: 1,
    },
    scorePill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(6, 182, 212, 0.1)', // Αλλάξαμε σε Cyan
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)',
        gap: 6,
    },
    scoreText: {
        fontSize: 15,
        fontWeight: '800',
    },

    // --- Thin Neon Progress Bar ---
    progressBarBg: { 
        height: 6, 
        backgroundColor: 'rgba(255,255,255,0.05)', 
        borderRadius: 3, 
        marginBottom: 30, 
        overflow: 'hidden',
    },
    progressBarFill: { 
        height: '100%', 
        backgroundColor: COLOR_PRIMARY, 
        borderRadius: 3,
        shadowColor: COLOR_PRIMARY,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 5,
    },

    contentContainer: {
        flex: 1,
    },
    errorText: { 
        color: COLOR_TEXT, 
        textAlign: 'center', 
        marginTop: 50,
        fontSize: 18,
    },

    // --- Minimal Explanation Toast ---
    explanationToast: { 
        position: 'absolute', 
        bottom: 20, 
        left: 20, 
        right: 20, 
        backgroundColor: COLOR_CARD, 
        paddingVertical: 20, 
        paddingHorizontal: 25, 
        borderRadius: 20, 
        borderWidth: 1, 
        borderColor: 'rgba(245, 158, 11, 0.3)', 
        elevation: 15, 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 10 }, 
        shadowOpacity: 0.6, 
        shadowRadius: 20,
        zIndex: 100, 
    },
    explanationHeader: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        marginBottom: 10,
        gap: 8,
    },
    explanationTitle: { 
        color: COLOR_WARNING, 
        fontWeight: 'bold', 
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: 1, 
    },
    explanationText: { 
        color: '#cbd5e1', 
        fontSize: 15, 
        lineHeight: 24,
    },
});

const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.9)', // Σκούρο μπλε ημιδιάφανο
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    content: {
        width: '100%',
        backgroundColor: COLOR_CARD,
        borderRadius: 24,
        padding: 30,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)', // Κόκκινο border
        elevation: 20,
        shadowColor: COLOR_ERROR,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    boltIcon: {
        position: 'absolute',
    },
    title: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '900',
        marginBottom: 10,
        textAlign: 'center',
    },
    desc: {
        color: COLOR_MUTED,
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 30,
    },
    adButton: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLOR_PRIMARY,
        paddingVertical: 16,
        borderRadius: 14,
        marginBottom: 12,
        gap: 10,
    },
    adButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    coinButton: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        paddingVertical: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLOR_GOLD,
        marginBottom: 20,
        gap: 10,
    },
    coinButtonText: {
        color: COLOR_GOLD,
        fontSize: 16,
        fontWeight: 'bold',
    },
    closeButton: {
        paddingVertical: 10,
    },
    closeText: {
        color: COLOR_MUTED,
        fontSize: 14,
        fontWeight: '600',
        textDecorationLine: 'underline',
    }
});