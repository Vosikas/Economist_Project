import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

// ─── Gamified Premium Palette ────────────────────────────────────────────────
const COLOR_PRIMARY   = '#06b6d4'; // Cyan 500
const COLOR_SUCCESS   = '#10b981'; // Emerald 500
const COLOR_ERROR     = '#ef4444'; // Red 500
const COLOR_WARNING   = '#f59e0b'; // Amber 500
const COLOR_TEXT      = '#f8fafc'; // Slate 50
const COLOR_MUTED     = '#64748b'; // Slate 500
const COLOR_BORDER    = '#334155'; // Slate 700

export default function FillIn({ question, isAnswered, onAnswer }) {
    const [inputValue, setInputValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [wasCorrect, setWasCorrect] = useState(null);

    useEffect(() => {
        setInputValue('');
        setWasCorrect(null);
    }, [question.id]);

    const handleSubmit = () => {
        if (isAnswered || inputValue.trim() === '') return;
        
        Keyboard.dismiss(); 
        const normalizedInput = inputValue.trim().toLowerCase();
        
        const isCorrect = question.correct_answers.some(
            answer => answer.toLowerCase() === normalizedInput
        );

        setWasCorrect(isCorrect);
        onAnswer(isCorrect);
    };

    // ─── Minimalist Dynamic Styling ───
    let inputStyle = [styles.input];
    let iconName = null;
    let iconColor = null;

    if (isAnswered) {
        if (wasCorrect) {
            inputStyle.push(styles.inputCorrect);
            iconName = "check";
            iconColor = COLOR_SUCCESS;
        } else {
            inputStyle.push(styles.inputWrong);
            iconName = "times";
            iconColor = COLOR_ERROR;
        }
    } else if (isFocused) {
        inputStyle.push(styles.inputFocused);
    }

    const isInputEmpty = inputValue.trim() === '';

    return (
        // Το εξωτερικό container ανάβει σταθερά όταν έρχεται η ερώτηση
        <Animated.View key={question.id} entering={FadeIn.duration(300)} style={styles.container}>
            
            {/* ─── Typography-Driven Question ─── */}
            <View style={styles.questionContainer}>
                <Text style={styles.questionText}>{question.question}</Text>
            </View>
            
            {/* ─── Massive Centered Input (Ελαφρύ delay, χωρίς κίνηση) ─── */}
            <Animated.View entering={FadeIn.delay(100).duration(300)} style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                    <TextInput
                        style={inputStyle}
                        placeholder="Πληκτρολόγησε..."
                        placeholderTextColor={COLOR_MUTED}
                        value={inputValue}
                        onChangeText={setInputValue}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        editable={!isAnswered}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onSubmitEditing={handleSubmit}
                        returnKeyType="done"
                        textAlign="center" 
                    />
                    
                    {/* Floating Icon μέσα στο Input (Σταθερό Fade In) */}
                    {isAnswered && (
                        <Animated.View entering={FadeIn.duration(300)} style={styles.statusIcon}>
                            <Icon name={iconName} size={28} color={iconColor} solid />
                        </Animated.View>
                    )}
                </View>
            </Animated.View>

            {/* ─── Pill-Shaped Submit Button (Ελαφρύ delay, χωρίς κίνηση) ─── */}
            {!isAnswered && (
                <Animated.View entering={FadeIn.delay(200).duration(300)} style={styles.buttonContainer}>
                    <TouchableOpacity 
                        style={[
                            styles.submitButton, 
                            isInputEmpty ? styles.submitButtonDisabled : styles.submitButtonActive
                        ]} 
                        onPress={handleSubmit}
                        disabled={isInputEmpty || isAnswered}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.submitButtonText, isInputEmpty && { color: COLOR_MUTED }]}>
                            Επιβεβαίωση
                        </Text>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* ─── Floating Toast Για τη Σωστή Απάντηση (Σταθερό Fade In αντί για SlideInDown) ─── */}
            {isAnswered && !wasCorrect && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.floatingToast}>
                    <View style={styles.toastHeader}>
                        <Icon name="lightbulb" size={16} color={COLOR_WARNING} solid />
                        <Text style={styles.toastLabel}>Η σωστή απάντηση είναι</Text>
                    </View>
                    <Text style={styles.toastAnswerText}>
                        {question.correct_answers[0]}
                    </Text>
                </Animated.View>
            )}
            
        </Animated.View>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { 
        flex: 1,
        paddingTop: 30,
        position: 'relative', 
    },
    
    // --- Typography Question ---
    questionContainer: {
        marginBottom: 50,
        paddingHorizontal: 10,
    },
    questionText: { 
        color: COLOR_TEXT, 
        fontSize: 26, 
        fontWeight: '300', 
        lineHeight: 38,
        textAlign: 'center',
    },

    // --- Minimalist Input ---
    inputContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    inputWrapper: {
        width: '100%',
        position: 'relative',
        justifyContent: 'center',
    },
    input: {
        width: '100%',
        color: COLOR_TEXT,
        fontSize: 32, 
        fontWeight: 'bold',
        paddingVertical: 15,
        borderBottomWidth: 4, 
        borderBottomColor: COLOR_BORDER,
        letterSpacing: 1,
    },
    inputFocused: { 
        borderBottomColor: COLOR_PRIMARY,
        shadowColor: COLOR_PRIMARY,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    inputCorrect: { 
        borderBottomColor: COLOR_SUCCESS, 
        color: COLOR_SUCCESS,
    },
    inputWrong: { 
        borderBottomColor: COLOR_ERROR, 
        color: COLOR_ERROR,
        textDecorationLine: 'line-through', 
        opacity: 0.7,
    },
    statusIcon: {
        position: 'absolute',
        right: 10, 
        bottom: 20,
    },

    // --- Pill Button ---
    buttonContainer: {
        alignItems: 'center',
    },
    submitButton: {
        paddingVertical: 18,
        paddingHorizontal: 40,
        borderRadius: 50, 
        minWidth: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitButtonActive: {
        backgroundColor: COLOR_PRIMARY,
        shadowColor: COLOR_PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    submitButtonDisabled: { 
        backgroundColor: 'transparent', 
        borderWidth: 2,
        borderColor: COLOR_BORDER,
    },
    submitButtonText: { 
        color: '#0f172a', 
        fontSize: 18, 
        fontWeight: '900',
        letterSpacing: 1,
    },

    // --- Floating Toast (Answer Reveal) ---
    floatingToast: { 
        position: 'absolute',
        bottom: 20, 
        left: 0,
        right: 0,
        backgroundColor: '#1e293b', 
        paddingVertical: 20, 
        paddingHorizontal: 25,
        borderRadius: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    toastHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 10,
    },
    toastLabel: { 
        color: COLOR_MUTED, 
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    toastAnswerText: { 
        color: COLOR_WARNING, 
        fontSize: 26, 
        fontWeight: '900',
        letterSpacing: 1,
    },
});