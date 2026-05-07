import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { Audio } from 'expo-av'; // 🔥 ΝΕΟ IMPORT ΓΙΑ ΗΧΟΓΡΑΦΗΣΗ
import Animated, {
    FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
    withSpring, withDelay, withRepeat, withSequence
} from 'react-native-reanimated';
import api from '../services/apiClient';
import { CustomAlert } from '../components/CustomAlert';


const COLOR_BG = '#0f172a';
const COLOR_CARD = '#1e293b';
const COLOR_PRIMARY = '#8b5cf6';
const COLOR_CORRECT = '#10b981';
const COLOR_WARNING = '#f59e0b';
const COLOR_ERROR = '#ef4444';

const LOADING_MESSAGES = [
    'Ο AI Καθηγητής διαβάζει το γραπτό σου...',
    'Αναλύω τις λέξεις-κλειδιά...',
    'Συγκρίνω με το σχολικό βιβλίο...',
    'Ετοιμάζω το feedback σου...',
];

function ScoreCircle({ score, color }) {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 300 });
        scale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 120 }));
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    return (
        <Animated.View style={[styles.scoreCircle, { borderColor: color }, animStyle]}>
            <Text style={[styles.scoreText, { color }]}>{score}%</Text>
            <Text style={styles.scoreLabel}>βαθμός</Text>
        </Animated.View>
    );
}

function PulsingDot({ delay }) {
    const opacity = useSharedValue(0.3);
    useEffect(() => {
        opacity.value = withDelay(delay, withRepeat(
            withSequence(withTiming(1, { duration: 500 }), withTiming(0.3, { duration: 500 })),
            -1, false
        ));
    }, []);
    const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
    return <Animated.View style={[styles.dot, style]} />;
}

export default function AITutorScreen({ route, navigation }) {
    const { question_id, question_text } = route.params || {};

    const [answer, setAnswer] = useState('');
    const [status, setStatus] = useState('idle'); 
    const [result, setResult] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

    // 🔥 States για το Whisper Audio
    const [recording, setRecording] = useState(null);
    const [isProcessingAudio, setIsProcessingAudio] = useState(false);
    const isSubmitting = useRef(false);

    useEffect(() => {
        if (status !== 'loading') return;
        const interval = setInterval(() => {
            setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [status]);

    // ─── Native Audio Recording (Whisper) ─────────────────────────────────
    useEffect(() => {
        // Ζητάμε άδεια με το που ανοίγει η οθόνη
        Audio.requestPermissionsAsync();
        
        return () => {
            // Καθαρισμός αν κλείσει η οθόνη ενώ γράφει
            if (recording) {
                recording.stopAndUnloadAsync();
            }
        };
    }, []);

const startRecording = async () => {
    try {
        // ΦΡΟΥΡΟΣ: Αν ήδη ηχογραφεί ή το πατήσαμε διπλά, σταμάτα!
        if (recording) return;

        const { status } = await Audio.getPermissionsAsync();
        if (status !== 'granted') {
            CustomAlert.alert('Άδεια', 'Χρειαζόμαστε το μικρόφωνο για να σε ακούσει ο AI Tutor.');
            return;
        }

        // Καθαρίζουμε το Audio Mode του κινητού για να είναι σίγουρα "άδειο"
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
        });

        const { recording: newRecording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        
        setRecording(newRecording);
    } catch (e) {
        console.error("Start Recording Error:", e);
        // Σε περίπτωση που κολλήσει κάποιο παλιό object, το καθαρίζουμε
        setRecording(undefined); 
    }
};

    const stopRecordingAndTranscribe = async () => {
        if (!recording) return;

        setRecording(undefined);
        setIsProcessingAudio(true);

        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();

            // Στέλνουμε το αρχείο στο FastAPI (Whisper)
            const formData = new FormData();
            formData.append('file', {
                uri: uri,
                name: 'audio.m4a',
                type: 'audio/m4a',
            });

            // Προσοχή: Βάλε το σωστό endpoint σου (π.χ. /transcribe ή /ai-tutor/transcribe)
           // ΑΛΛΑΞΕ ΑΥΤΟ:
    const response = await api.post('/ai-tutor/transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
});

            // Προσθέτουμε το κείμενο στην υπάρχουσα απάντηση
            setAnswer(prev => prev + (prev ? " " : "") + response.data.text);
        } catch (error) {
            console.error("Transcription Error:", error);
            CustomAlert.alert("Σφάλμα", "Δεν μπορέσαμε να αναγνωρίσουμε τη φωνή σου. Δοκίμασε ξανά.");
        } finally {
            setIsProcessingAudio(false);
        }
    };

    // ─── Υποβολή για Βαθμολόγηση ─────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!answer.trim() || isSubmitting.current || isProcessingAudio) return;

        isSubmitting.current = true;
        setStatus('loading');
        setResult(null);
        setErrorMessage('');

        try {
            const response = await api.post('/ai-tutor/grade', {
                question_id,
                student_answer: answer.trim(),
            });
            setResult(response.data);
            setStatus('success');
        } catch (error) {
            const msg = error.response?.status === 429 ? "Πολλές προσπάθειες. Περίμενε λίγο." : "Κάτι πήγε στραβά. Δοκίμασε ξανά.";
            setErrorMessage(msg);
            setStatus('error');
        } finally { isSubmitting.current = false; }
    }, [answer, question_id, isProcessingAudio]);

    const scoreColor = result ? (result.score >= 80 ? COLOR_CORRECT : result.score >= 50 ? COLOR_WARNING : COLOR_ERROR) : COLOR_PRIMARY;

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Icon name="chevron-left" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Icon name="robot" size={18} color={COLOR_PRIMARY} style={{ marginRight: 8 }} />
                        <Text style={styles.headerTitle}>AI Tutor</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    <Animated.View entering={FadeInUp.duration(400)} style={styles.questionBox}>
                        <View style={styles.badgePremium}>
                            <Icon name="star" size={10} color="#fff" solid />
                            <Text style={styles.badgeText}>ΕΡΩΤΗΣΗ ΑΝΑΠΤΥΞΗΣ</Text>
                        </View>
                        <Text style={styles.questionText}>{question_text}</Text>
                    </Animated.View>

                    {(status === 'idle' || status === 'error') && (
                        <Animated.View entering={FadeInUp.delay(150).duration(400)}>
                            <Text style={styles.inputLabel}>Η Απάντησή σου:</Text>
                            <View style={[styles.inputContainer, status === 'error' && styles.inputContainerError]}>
                                <TextInput
                                    style={[styles.textInput, recording && styles.textInputListening]}
                                    multiline
                                    placeholder="Πληκτρολόγησε ή κράτα πατημένο το μικρόφωνο..."
                                    placeholderTextColor="#475569"
                                    value={answer}
                                    onChangeText={setAnswer}
                                    textAlignVertical="top"
                                    editable={!isProcessingAudio}
                                />
                                <View style={styles.inputFooter}>
                                    <View style={styles.micWrapper}>
                                        {isProcessingAudio ? (
                                            <View style={styles.processingContainer}>
                                                <ActivityIndicator size="small" color={COLOR_PRIMARY} />
                                                <Text style={styles.processingText}>Μεταγραφή...</Text>
                                            </View>
                                        ) : (
                                            <TouchableOpacity 
                                                style={[styles.micButton, recording && styles.micButtonActive]} 
                                                onPressIn={startRecording}
                                                onPressOut={stopRecordingAndTranscribe}
                                                activeOpacity={0.7}
                                            >
                                                <Icon name="microphone" size={16} color={recording ? "#fff" : COLOR_PRIMARY} />
                                                {recording && <Text style={styles.micActiveText}>Σε ακούω...</Text>}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <Text style={styles.charCount}>{answer.length}/3000</Text>
                                </View>
                            </View>

                            {status === 'error' && <Text style={styles.errorText}>{errorMessage}</Text>}

                            <TouchableOpacity 
                                style={[styles.submitButton, isProcessingAudio && { opacity: 0.5 }]} 
                                onPress={handleSubmit} 
                                disabled={!answer.trim() || isProcessingAudio}
                            >
                                <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={styles.submitGradient}>
                                    <Icon name="magic" size={18} color="#fff" style={{ marginRight: 10 }} />
                                    <Text style={styles.submitText}>Βαθμολόγησέ με</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {status === 'loading' && (
                        <View style={styles.loadingSection}>
                            <View style={styles.loadingIconRing}><Icon name="robot" size={32} color={COLOR_PRIMARY} /></View>
                            <Text style={styles.loadingText}>{LOADING_MESSAGES[loadingMsgIndex]}</Text>
                            <View style={styles.loadingDots}>{[0,1,2].map(i => <PulsingDot key={i} delay={i*200} />)}</View>
                        </View>
                    )}

                    {status === 'success' && result && (
                        <Animated.View entering={FadeInUp.duration(500)} style={styles.resultsSection}>
                            <View style={styles.scoreContainer}>
                                <ScoreCircle score={result.score} color={scoreColor} />
                                <Text style={[styles.scoreVerdict, { color: scoreColor }]}>{result.score >= 80 ? '🎉 Τέλεια!' : '👍 Πολύ καλά!'}</Text>
                            </View>
                            <View style={styles.feedbackBox}><Text style={styles.feedbackText}>{result.feedback}</Text></View>
                            {result.missing_points?.length > 0 && (
                                <View>
                                    <Text style={styles.missingTitle}>Τι παρέλειψες:</Text>
                                    {result.missing_points.map((p, i) => (
                                        <View key={i} style={styles.missingRow}><Icon name="times" size={10} color={COLOR_ERROR} /><Text style={styles.missingText}>{p}</Text></View>
                                    ))}
                                </View>
                            )}
                            <TouchableOpacity style={styles.retryButton} onPress={() => setStatus('idle')}><Text style={styles.retryText}>Διόρθωση</Text></TouchableOpacity>
                        </Animated.View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLOR_CARD, justifyContent: 'center', alignItems: 'center' },
    headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
    questionBox: { backgroundColor: COLOR_CARD, padding: 20, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
    badgePremium: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139, 92, 246, 0.2)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
    badgeText: { color: COLOR_PRIMARY, fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
    questionText: { color: '#fff', fontSize: 17, fontWeight: 'bold', lineHeight: 24 },
    inputLabel: { color: '#94a3b8', fontSize: 13, marginBottom: 10 },
    inputContainer: { backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: '#334155', minHeight: 180 },
    inputContainerError: { borderColor: COLOR_ERROR },
    textInput: { flex: 1, color: '#fff', fontSize: 16, padding: 16, minHeight: 140 },
    textInputListening: { color: '#a78bfa' },
    inputFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
    micWrapper: { flexDirection: 'row', alignItems: 'center' },
    micButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: 8, paddingHorizontal: 12, borderRadius: 20 },
    micButtonActive: { backgroundColor: COLOR_ERROR, transform: [{ scale: 1.05 }] },
    micActiveText: { color: '#fff', fontSize: 12, marginLeft: 6, fontWeight: 'bold' },
    processingContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: 8, paddingHorizontal: 12, borderRadius: 20 },
    processingText: { color: COLOR_PRIMARY, fontSize: 12, marginLeft: 6, fontWeight: 'bold' },
    charCount: { color: '#475569', fontSize: 12 },
    submitButton: { marginTop: 15, borderRadius: 16, overflow: 'hidden' },
    submitGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    loadingSection: { alignItems: 'center', marginTop: 40 },
    loadingIconRing: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(139, 92, 246, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    loadingText: { color: '#94a3b8', fontSize: 15, marginBottom: 20 },
    loadingDots: { flexDirection: 'row', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR_PRIMARY },
    resultsSection: { backgroundColor: COLOR_CARD, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#334155' },
    scoreContainer: { alignItems: 'center', marginBottom: 20 },
    scoreCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    scoreText: { fontSize: 28, fontWeight: 'bold' },
    scoreLabel: { color: '#64748b', fontSize: 11 },
    scoreVerdict: { fontSize: 18, fontWeight: 'bold' },
    feedbackBox: { backgroundColor: 'rgba(139, 92, 246, 0.05)', padding: 15, borderRadius: 15, marginBottom: 20 },
    feedbackText: { color: '#e2e8f0', lineHeight: 22 },
    missingTitle: { color: '#94a3b8', fontSize: 12, marginBottom: 10, textTransform: 'uppercase' },
    missingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    missingText: { color: '#cbd5e1', fontSize: 14, marginLeft: 8 },
    retryButton: { backgroundColor: '#334155', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
    retryText: { color: '#fff', fontWeight: 'bold' },
    errorText: { color: COLOR_ERROR, marginTop: 10 }
});