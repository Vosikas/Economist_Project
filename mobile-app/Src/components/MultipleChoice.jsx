import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

// ─── Gamified Premium Palette ────────────────────────────────────────────────
const COLOR_PRIMARY   = '#06b6d4'; // Cyan 500
const COLOR_SUCCESS   = '#10b981'; // Emerald 500
const COLOR_ERROR     = '#ef4444'; // Red 500
const COLOR_TEXT      = '#f8fafc'; // Slate 50
const COLOR_MUTED     = '#64748b'; // Slate 500 (Πιο σκούρο για μινιμαλισμό)
const COLOR_BORDER    = 'rgba(255, 255, 255, 0.1)'; // Εξαιρετικά αχνό border

export default function MultipleChoice({ question, isAnswered, onAnswer }) {
    const [selectedIndex, setSelectedIndex] = useState(null);

    useEffect(() => {
        setSelectedIndex(null);
    }, [question.id]);

    const handlePress = (index) => {
        if (isAnswered) return;
        setSelectedIndex(index);
        
        const isCorrect = index === question.correctIndex;
        onAnswer(isCorrect);
    };

    return (
        <Animated.View key={question.id} entering={FadeIn.duration(300)} style={styles.container}>
            {/* ─── Typography-Driven Question ─── */}
            <View style={styles.questionContainer}>
                <Text style={styles.questionText}>{question.question}</Text>
            </View>
            
            {/* ─── Ghost Options List ─── */}
            <View style={styles.optionsContainer}>
                {question.options.map((option, index) => {
                    const isSelected = selectedIndex === index;
                    const isCorrect = question.correctIndex === index;
                    
                    // Γράμμα Επιλογής (A, B, C, D)
                    const letter = String.fromCharCode(65 + index);

                    // --- Dynamic Styling Setup ---
                    let buttonStyle = [styles.optionButton];
                    let letterCircleStyle = [styles.letterCircle];
                    let letterTextStyle = [styles.letterText];
                    let optionTextStyle = [styles.optionText];
                    let iconElement = null;

                    if (isAnswered) {
                        // Αν απαντήθηκε, δείχνουμε ΠΑΝΤΑ τη σωστή απάντηση (πράσινη)
                        if (isCorrect) {
                            buttonStyle.push(styles.optionCorrect);
                            letterCircleStyle.push(styles.circleCorrect);
                            letterTextStyle.push({ color: '#fff' });
                            optionTextStyle.push(styles.textCorrect);
                            iconElement = <Icon name="check" size={16} color={COLOR_SUCCESS} solid />;
                        } 
                        // Και αν ο χρήστης διάλεξε λάθος, τη δείχνουμε κόκκινη
                        else if (isSelected) {
                            buttonStyle.push(styles.optionWrong);
                            letterCircleStyle.push(styles.circleWrong);
                            letterTextStyle.push({ color: '#fff' });
                            optionTextStyle.push(styles.textWrong);
                            iconElement = <Icon name="times" size={16} color={COLOR_ERROR} solid />;
                        } 
                        // Οι υπόλοιπες επιλογές γίνονται αχνές
                        else {
                            buttonStyle.push(styles.optionDisabled);
                        }
                    } else if (isSelected) {
                        // Focus State (Πριν τον έλεγχο)
                        buttonStyle.push(styles.optionSelected);
                        letterCircleStyle.push(styles.circleSelected);
                        letterTextStyle.push({ color: '#fff' });
                        optionTextStyle.push(styles.textSelected);
                    }

                    // Ελαφρύ delay για να ανάβουν το ένα μετά το άλλο, αλλά ΧΩΡΙΣ κίνηση
                    const animationDelay = index * 100;

                    return (
                        <Animated.View key={index} entering={FadeIn.delay(animationDelay).duration(300)}>
                            <TouchableOpacity 
                                disabled={isAnswered}
                                activeOpacity={0.7}
                                onPress={() => handlePress(index)}
                                style={buttonStyle}
                            >
                                <View style={letterCircleStyle}>
                                    <Text style={letterTextStyle}>{letter}</Text>
                                </View>
                                
                                <Text style={optionTextStyle}>{option}</Text>
                                
                                {/* Άλλαξα το ZoomIn σε FadeIn για το εικονίδιο επιβεβαίωσης */}
                                {isAnswered && iconElement && (
                                    <Animated.View entering={FadeIn.duration(300)} style={styles.statusIcon}>
                                        {iconElement}
                                    </Animated.View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>
                    );
                })}
            </View>
        </Animated.View>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { 
        paddingTop: 20,
        flex: 1,
    },
    
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

    optionsContainer: {
        paddingHorizontal: 10,
        gap: 16, 
    },

    optionButton: { 
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent', 
        padding: 18, 
        borderRadius: 24, 
        borderWidth: 1.5, 
        borderColor: COLOR_BORDER,
    },
    optionText: { 
        flex: 1,
        color: '#cbd5e1', 
        fontSize: 18, 
        fontWeight: '500',
        lineHeight: 26,
    },

    letterCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1.5,
        borderColor: COLOR_MUTED,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 18,
    },
    letterText: {
        color: COLOR_MUTED,
        fontSize: 16,
        fontWeight: '800',
    },

    // --- Dynamic States ---
    optionSelected: { 
        borderColor: COLOR_PRIMARY,
        backgroundColor: 'rgba(6, 182, 212, 0.05)',
        shadowColor: COLOR_PRIMARY,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
    },
    circleSelected: {
        backgroundColor: COLOR_PRIMARY,
        borderColor: COLOR_PRIMARY,
    },
    textSelected: {
        color: COLOR_PRIMARY,
        fontWeight: '700',
    },

    optionCorrect: { 
        borderColor: COLOR_SUCCESS, 
        backgroundColor: 'rgba(16, 185, 129, 0.05)' 
    },
    circleCorrect: {
        backgroundColor: COLOR_SUCCESS,
        borderColor: COLOR_SUCCESS,
    },
    textCorrect: {
        color: COLOR_SUCCESS,
        fontWeight: '700',
    },

    optionWrong: { 
        borderColor: COLOR_ERROR, 
        backgroundColor: 'rgba(239, 68, 68, 0.05)' 
    },
    circleWrong: {
        backgroundColor: COLOR_ERROR,
        borderColor: COLOR_ERROR,
    },
    textWrong: {
        color: COLOR_ERROR,
        textDecorationLine: 'line-through', 
        opacity: 0.8,
    },

    optionDisabled: { 
        opacity: 0.3 
    },
    
    statusIcon: {
        marginLeft: 12,
    }
});