import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeIn,FadeInDown, SlideInRight, ZoomIn } from 'react-native-reanimated';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

// ─── Gamified Premium Palette ────────────────────────────────────────────────
const COLOR_PRIMARY   = '#06b6d4'; // Cyan 500
const COLOR_SUCCESS   = '#10b981'; // Emerald 500
const COLOR_ERROR     = '#ef4444'; // Red 500
const COLOR_TEXT      = '#f8fafc'; // Slate 50
const COLOR_MUTED     = '#64748b'; // Slate 500
const COLOR_BORDER    = '#334155'; // Slate 700

// Βοηθητική συνάρτηση για ανακάτεμα των στηλών
const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

export default function Match({ question, isAnswered, onAnswer }) {
    const [leftItems, setLeftItems] = useState([]);
    const [rightItems, setRightItems] = useState([]);
    
    const [selectedLeftId, setSelectedLeftId] = useState(null);
    const [matchedIds, setMatchedIds] = useState([]); 
    const [wrongPair, setWrongPair] = useState(null); 

    useEffect(() => {
        if (!question.pairs) return;

        const formattedPairs = question.pairs.map((p, index) => ({ ...p, id: index.toString() }));
        
        setLeftItems(shuffleArray(formattedPairs.map(p => ({ id: p.id, text: p.left }))));
        setRightItems(shuffleArray(formattedPairs.map(p => ({ id: p.id, text: p.right }))));
        
        setMatchedIds([]);
        setSelectedLeftId(null);
        setWrongPair(null);
    }, [question.id]);

    const handleLeftTap = (id) => {
        if (isAnswered || matchedIds.includes(id)) return;
        setSelectedLeftId(id === selectedLeftId ? null : id);
    };

    const handleRightTap = (id) => {
        if (isAnswered || matchedIds.includes(id) || !selectedLeftId) return;

        if (id === selectedLeftId) {
            const newMatched = [...matchedIds, id];
            setMatchedIds(newMatched);
            setSelectedLeftId(null); 

            if (newMatched.length === leftItems.length) {
                onAnswer(true);
            }
        } else {
            setWrongPair({ left: selectedLeftId, right: id });
            onAnswer(false);
        }
    };

    // ─── Minimalist Node Renderer ───
    const renderNodeItem = (item, isLeftColumn, index) => {
        const isMatched = matchedIds.includes(item.id);
        const isSelected = isLeftColumn ? (selectedLeftId === item.id) : false;
        const isWrong = isLeftColumn ? (wrongPair?.left === item.id) : (wrongPair?.right === item.id);
        const isWaitingForRight = !isLeftColumn && selectedLeftId && !isMatched && !isAnswered;

        // Styling Logic
        let containerStyle = [styles.nodeContainer, isLeftColumn ? styles.nodeLeft : styles.nodeRight];
        let textStyle = [styles.nodeText, isLeftColumn ? styles.textLeft : styles.textRight];
        let dotStyle = [styles.dot];

        if (isMatched) {
            textStyle.push(styles.textMatched);
            dotStyle.push(styles.dotMatched);
            containerStyle.push(styles.containerMatched);
        } else if (isWrong) {
            textStyle.push(styles.textWrong);
            dotStyle.push(styles.dotWrong);
        } else if (isSelected) {
            textStyle.push(styles.textSelected);
            dotStyle.push(styles.dotSelected);
            containerStyle.push(styles.containerSelected);
        } else if (isWaitingForRight) {
            // Όταν έχει επιλέξει κάτι αριστερά, τα δεξιά "ανάβουν" ελαφρώς για να τα πατήσει
            dotStyle.push(styles.dotWaiting);
        } else if (isAnswered) {
            containerStyle.push(styles.containerDisabled);
        }

        const isDisabled = isAnswered || isMatched || (!isLeftColumn && !selectedLeftId);

        // Το delay βοηθάει να πέφτουν ένα-ένα τα στοιχεία σαν καταρράκτης (Staggering)
        const animationDelay = (isLeftColumn ? index * 100 : (index * 100) + 50) + 200;

        return (
            <Animated.View key={`${isLeftColumn ? 'l' : 'r'}-${item.id}`} entering={FadeInDown.delay(animationDelay).springify()}>
                <TouchableOpacity 
                    disabled={isDisabled}
                    activeOpacity={0.6}
                    onPress={() => isLeftColumn ? handleLeftTap(item.id) : handleRightTap(item.id)}
                    style={containerStyle}
                >
                    {/* Αν είναι αριστερή στήλη: Κείμενο -> Τελεία */}
                    {isLeftColumn && <Text style={textStyle}>{item.text}</Text>}
                    
                    <View style={styles.dotWrapper}>
                        {isMatched ? (
                            <Animated.View entering={ZoomIn}>
                                <Icon name="check" size={12} color={COLOR_SUCCESS} solid />
                            </Animated.View>
                        ) : isWrong ? (
                            <Animated.View entering={ZoomIn}>
                                <Icon name="times" size={12} color={COLOR_ERROR} solid />
                            </Animated.View>
                        ) : (
                            <View style={dotStyle} />
                        )}
                    </View>

                    {/* Αν είναι δεξιά στήλη: Τελεία -> Κείμενο */}
                    {!isLeftColumn && <Text style={textStyle}>{item.text}</Text>}
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            
            {/* ─── Typography-Driven Question ─── */}
            <Animated.View entering={FadeIn.duration(300)} style={styles.questionContainer}>
                <Text style={styles.questionText}>{question.question}</Text>
                <Text style={styles.helperText}>Ένωσε τα αντίστοιχα ζευγάρια</Text>
            </Animated.View>

            {/* ─── "Connect the Nodes" Layout ─── */}
            <View style={styles.columnsContainer}>
                
                {/* ΑΡΙΣΤΕΡΗ ΣΤΗΛΗ */}
                <View style={styles.column}>
                    {leftItems.map((item, index) => renderNodeItem(item, true, index))}
                </View>

                {/* Κεντρική διαχωριστική γραμμή (Αισθητική) */}
                <View style={styles.centerDivider} />

                {/* ΔΕΞΙΑ ΣΤΗΛΗ */}
                <View style={styles.column}>
                    {rightItems.map((item, index) => renderNodeItem(item, false, index))}
                </View>

            </View>

        </View>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        paddingTop: 20,
    },
    
    // --- Typography Question ---
    questionContainer: {
        marginBottom: 40,
        paddingHorizontal: 10,
    },
    questionText: { 
        color: COLOR_TEXT, 
        fontSize: 26, 
        fontWeight: '300', 
        lineHeight: 36,
        textAlign: 'center',
        marginBottom: 8,
    },
    helperText: { 
        color: COLOR_MUTED, 
        fontSize: 14, 
        textTransform: 'uppercase',
        letterSpacing: 2,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    
    // --- Layout Στηλών ---
    columnsContainer: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flex: 1,
        position: 'relative',
    },
    centerDivider: {
        position: 'absolute',
        left: '50%',
        top: 0,
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.05)', // Μια εξαιρετικά αχνή γραμμή στη μέση
        transform: [{ translateX: -0.5 }],
    },
    column: { 
        width: '45%', 
        gap: 25, // Περισσότερος χώρος να αναπνέουν
        paddingVertical: 10,
    },
    
    // --- Nodes (Τα στοιχεία) ---
    nodeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 16,
    },
    nodeLeft: {
        justifyContent: 'flex-end', // Σπρώχνει το κείμενο δεξιά, προς τη μέση
        paddingRight: 10,
    },
    nodeRight: {
        justifyContent: 'flex-start', // Σπρώχνει το κείμενο αριστερά, προς τη μέση
        paddingLeft: 10,
    },
    
    nodeText: { 
        color: '#cbd5e1', 
        fontSize: 18, 
        fontWeight: '600', 
        flexShrink: 1, 
    },
    textLeft: { textAlign: 'right', marginRight: 15 },
    textRight: { textAlign: 'left', marginLeft: 15 },

    // --- Dots (Οι κόμβοι) ---
    dotWrapper: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLOR_BORDER,
    },

    // --- Dynamic States ---
    textSelected: { color: COLOR_PRIMARY, fontWeight: '900', textShadowColor: COLOR_PRIMARY, textShadowOffset: {width: 0, height: 0}, textShadowRadius: 10 },
    dotSelected: { backgroundColor: COLOR_PRIMARY, transform: [{ scale: 1.4 }], shadowColor: COLOR_PRIMARY, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 5 },
    
    textMatched: { color: COLOR_SUCCESS, textDecorationLine: 'line-through' },
    dotMatched: { backgroundColor: COLOR_SUCCESS },
    containerMatched: { opacity: 0.4 }, // Χαμηλώνουμε το opacity για να ξεχωρίζουν αυτά που μένουν

    textWrong: { color: COLOR_ERROR },
    dotWrong: { backgroundColor: COLOR_ERROR },

    dotWaiting: { backgroundColor: 'rgba(6, 182, 212, 0.4)', transform: [{ scale: 1.2 }] }, // Αχνό μπλε για να δείξει ότι μπορεί να πατηθεί
    
    containerDisabled: { opacity: 0.5 },
});