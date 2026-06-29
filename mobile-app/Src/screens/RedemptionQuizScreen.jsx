import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';

import useAppStore from '../store/useAppStore';

// Εισαγωγή των Components
import MultipleChoice from '../components/MultipleChoice';
import FillIn from '../components/Fill_in';
import Match from '../components/Match';
import { CustomAlert } from '../components/CustomAlert';


// ─── Premium Palette ─────────────────────────────────────────────────────────
const COLOR_BG        = '#0f172a'; 
const COLOR_CARD      = '#1e293b'; 
const COLOR_PRIMARY   = '#06b6d4'; 
const COLOR_SUCCESS   = '#10b981'; 
const COLOR_GOLD      = '#fbbf24'; 
const COLOR_TEXT      = '#f8fafc'; 
const COLOR_MUTED     = '#64748b'; 
const COLOR_BORDER    = 'rgba(255, 255, 255, 0.05)'; 

export default function RedemptionQuizScreen({ navigation }) {
    const { fetchRedemptionQuiz, resolveMistake } = useAppStore();
    
    const [mistakes, setMistakes] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isAnswered, setIsAnswered] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [earnedCoins, setEarnedCoins] = useState(0);
    const [earnedBadges, setEarnedBadges] = useState([]); // Συλλέγουμε τα badges!

    useEffect(() => {
        loadQuiz();
    }, []);

    const loadQuiz = async () => {
        try {
            const data = await fetchRedemptionQuiz();
            const formatted = data.map(m => {
                const safeOptions = m.question.options || [];
                return {
                    ...m,
                    question: {
                        ...m.question,
                        id: m.question_id,
                        type: m.question.type?.toLowerCase() || 'multiple_choice',
                        question: m.question.question, 
                        options: safeOptions,
                        correctIndex: safeOptions.findIndex(opt => opt === m.question.correct_answer)
                    }
                };
            });
            setMistakes(formatted);
        } catch (err) {
            console.error(err);
            CustomAlert.alert("Καθαρό Μητρώο!", "Δεν υπάρχουν ενεργά σφάλματα για εξάσκηση.");
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleAnswer = async (isCorrect) => {
        if (isAnswered || isSubmitting) return;
        setIsAnswered(true);
        
        const currentMistake = mistakes[currentIndex];
        
        let coinsFromThisQuestion = 0;
        let badgesFromThisQuestion = [];

        // Αν το βρήκε σωστά, κάνουμε resolve στο backend
        if (isCorrect) {
            setIsSubmitting(true);
            try {
                const res = await resolveMistake(currentMistake.question_id);
                // Παίρνουμε τα δεδομένα από το API
                coinsFromThisQuestion = res.coins_earned || 5; 
                badgesFromThisQuestion = res.badges_earned || [];
            } catch (err) {
                console.error("Resolve error", err);
                coinsFromThisQuestion = 5; // Fallback σε περίπτωση σφάλματος δικτύου
            }
            setIsSubmitting(false);
        }

        // Υπολογίζουμε τα ΝΕΑ σύνολα για να τα περάσουμε με ασφάλεια στο Summary
        const finalTotalCoins = earnedCoins + coinsFromThisQuestion;
        const finalTotalBadges = [...earnedBadges, ...badgesFromThisQuestion];

        setEarnedCoins(finalTotalCoins);
        setEarnedBadges(finalTotalBadges);

        const delay = isCorrect ? 800 : 3000;

        setTimeout(() => {
            if (currentIndex < mistakes.length - 1) {
                setCurrentIndex(prev => prev + 1);
                setIsAnswered(false);
            } else {
                // ΤΕΛΟΣ ΚΟΥΙΖ -> Πάμε στο Summary
                navigation.replace('RedemptionSummary', {
                    earnedCoins: finalTotalCoins,
                    newlyUnlockedBadges: finalTotalBadges,
                    totalQuestions: mistakes.length
                });
            }
        }, delay);
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
                return <Text style={{color: 'white', textAlign: 'center'}}>Άγνωστος τύπος ερώτησης</Text>;
        }
    };

    if (loading) return <View style={[styles.container, {justifyContent: 'center'}]}><ActivityIndicator color={COLOR_PRIMARY} size="large" /></View>;
    if (mistakes.length === 0) return null;

    const currentMistake = mistakes[currentIndex];
    const progressPercentage = ((currentIndex + 1) / mistakes.length) * 100;

    return (
        <SafeAreaView style={styles.container}>
            {/* ─── PREMIUM HUD HEADER ─── */}
            <View style={styles.hudHeader}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
                    <Icon name="times" size={18} color={COLOR_MUTED} />
                </TouchableOpacity>
                
                <View style={styles.progressPill}>
                    <Text style={styles.progressText}>
                        {currentIndex + 1} <Text style={{color: COLOR_MUTED, fontWeight: '400'}}>/</Text> {mistakes.length}
                    </Text>
                </View>
                
                {/* Δείχνουμε τα νομίσματα που μαζεύει LIVE! */}
                <View style={styles.scorePill}>
                    <Icon name="coins" size={12} color={COLOR_GOLD} solid />
                    <Text style={styles.scoreText}>{earnedCoins}</Text>
                </View>
            </View>

            {/* ─── THIN NEON PROGRESS BAR ─── */}
            <View style={styles.progressBarBg}>
                <Animated.View 
                    style={[styles.progressBarFill, { width: `${progressPercentage}%` }]} 
                    layout={Layout.springify().damping(20)} 
                />
            </View>

            {/* ─── QUESTION COMPONENT ─── */}
            <Animated.View key={currentIndex} entering={FadeIn.duration(300)} style={{flex: 1}}>
                {renderQuestionComponent(currentMistake.question)}
            </Animated.View>
            
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLOR_BG, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 25 },
    
    hudHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 },
    iconBtn: { 
        width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.03)', 
        justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLOR_BORDER 
    },
    progressPill: {
        backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 6, paddingHorizontal: 16,
        borderRadius: 20, borderWidth: 1, borderColor: COLOR_BORDER,
    },
    progressText: { color: COLOR_TEXT, fontWeight: '700', fontSize: 15, letterSpacing: 1 },
    scorePill: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.1)', 
        paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.3)', gap: 6,
    },
    scoreText: { color: COLOR_GOLD, fontSize: 15, fontWeight: '800' },

    progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, marginBottom: 30, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: COLOR_SUCCESS, borderRadius: 3, shadowColor: COLOR_SUCCESS, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 5 },
});