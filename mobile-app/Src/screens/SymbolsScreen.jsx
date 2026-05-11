import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableWithoutFeedback, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Animated, {
    FadeInRight,
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate
} from 'react-native-reanimated';

// ─── Local Data: AOTH Formulas ──────────────────────────────────────────────
const SYMBOLS_DATA = [
    {
        id: '1',
        chapter: 'Κεφ 1',
        symbol: 'MC',
        name: 'Οριακό Κόστος',
        formula: 'ΔTC / ΔQ',
        description: 'Δείχνει το πρόσθετο κόστος που προκύπτει από την παραγωγή μιας επιπλέον μονάδας προϊόντος.',
    },
    {
        id: '2',
        chapter: 'Κεφ 1',
        symbol: 'MP',
        name: 'Οριακό Προϊόν',
        formula: 'ΔQ / ΔL',
        description: 'Η μεταβολή της συνολικής παραγωγής που προκύπτει από την προσθήκη μίας επιπλέον μονάδας εργασίας.',
    },
    {
        id: '3',
        chapter: 'Κεφ 2',
        symbol: 'TC',
        name: 'Συνολικό Κόστος',
        formula: 'FC + VC',
        description: 'Το άθροισμα του σταθερού (FC) και του μεταβλητού (VC) κόστους παραγωγής.',
    },
    {
        id: '4',
        chapter: 'Κεφ 2',
        symbol: 'Ed',
        name: 'Ελαστικότητα Ζήτησης',
        formula: '(ΔQ / ΔP) * (P1 / Q1)',
        description: 'Μετράει την ποσοστιαία μεταβολή της ζητούμενης ποσότητας ως προς την ποσοστιαία μεταβολή της τιμής.',
    },
];

const CHAPTERS = ['Όλα', 'Κεφ 1', 'Κεφ 2', 'Κεφ 3', 'Κεφ 4'];

// ─── Filter Chip Component (Memoized) ────────────────────────────────────────
const FilterChip = memo(({ chapter, isSelected, onPress }) => (
    <TouchableOpacity
        onPress={() => onPress(chapter)}
        style={[styles.filterChip, isSelected && styles.filterChipActive]}
        activeOpacity={0.7}
    >
        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
            {chapter}
        </Text>
    </TouchableOpacity>
));

// ─── 3D Flashcard Component (Memoized) ───────────────────────────────────────
const SymbolCard = memo(({ item, index }) => {
    // 0 = front, 1 = back
    const flipValue = useSharedValue(0);

    const handleFlip = useCallback(() => {
        flipValue.value = withSpring(flipValue.value ? 0 : 1, {
            damping: 15,
            stiffness: 120, // Slightly stiffer for a snappier feel
            mass: 0.8,      // Lighter mass for quicker acceleration
        });
    }, [flipValue]);

    // Front Animation: 0deg to 180deg
    const frontAnimatedStyle = useAnimatedStyle(() => {
        const rotateY = interpolate(flipValue.value, [0, 1], [0, 180]);
        return {
            transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
            zIndex: flipValue.value < 0.5 ? 1 : 0, // Helps with touch overlap on some Android versions
        };
    });

    // Back Animation: 180deg to 360deg (so it appears the right way around when flipped)
    const backAnimatedStyle = useAnimatedStyle(() => {
        const rotateY = interpolate(flipValue.value, [0, 1], [180, 360]);
        return {
            transform: [{ perspective: 1000 }, { rotateY: `${rotateY}deg` }],
            zIndex: flipValue.value > 0.5 ? 1 : 0,
        };
    });

    const delay = index * 100;

    return (
        <Animated.View entering={FadeInRight.delay(delay).duration(500)} style={styles.cardContainer}>
            <TouchableWithoutFeedback onPress={handleFlip}>
                <View style={styles.cardWrapper}>
                    {/* ─── FRONT of the card ─── */}
                    <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
                        <View style={styles.cardContentContainer}>
                            <View style={styles.cardContent}>
                                {/* Glowing Symbol Badge */}
                                <View style={styles.badgeContainer}>
                                    <View style={styles.badgeGlow} />
                                    <Text style={styles.symbolText}>{item.symbol}</Text>
                                </View>

                                {/* Texts */}
                                <View style={styles.textContainer}>
                                    <Text style={styles.nameText}>{item.name}</Text>
                                    <View style={styles.formulaBadge}>
                                        <Text style={styles.formulaText}>{item.formula}</Text>
                                    </View>
                                    <Text style={styles.descriptionText}>{item.description}</Text>
                                </View>
                            </View>

                            {/* Hint Icon */}
                            <View style={styles.flipHint}>
                                <Icon name="exchange-alt" size={14} color="#06b6d4" />
                                <Text style={styles.flipHintText}>Tap to flip</Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* ─── BACK of the card ─── */}
                    <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
                        <View style={[styles.cardContentContainer, styles.backAligner]}>
                            <View style={styles.backHeader}>
                                <Text style={styles.backTitle}>Διάγραμμα: {item.name}</Text>
                            </View>

                            {/* Placeholder for the diagram */}
                            <View style={styles.diagramPlaceholder}>
                                <Icon name="chart-line" size={40} color="#64748b" />
                                <Text style={styles.diagramText}>No chart available yet</Text>
                            </View>

                            {/* Hint Icon */}
                            <View style={styles.flipHint}>
                                <Icon name="undo-alt" size={14} color="#06b6d4" />
                                <Text style={styles.flipHintText}>Flip back</Text>
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </TouchableWithoutFeedback>
        </Animated.View>
    );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function SymbolsScreen() {
    const navigation = useNavigation();
    const [selectedChapter, setSelectedChapter] = useState('Όλα');

    // Filter Logic - Memoized to prevent recalculation on unrelated re-renders
    const filteredData = useMemo(() => {
        return SYMBOLS_DATA.filter(item =>
            selectedChapter === 'Όλα' ? true : item.chapter === selectedChapter
        );
    }, [selectedChapter]);

    const handleFilterPress = useCallback((chapter) => {
        setSelectedChapter(chapter);
    }, []);

    const handleGoBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const renderItem = useCallback(({ item, index }) => {
        return <SymbolCard item={item} index={index} />;
    }, []);

    const keyExtractor = useCallback((item) => item.id, []);

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
                    <Icon name="chevron-left" size={20} color="#06b6d4" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Σύμβολα & Τύποι</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Filter Chips Layer - CORRECTED ScrollView styling */}
            <View>
                <ScrollView
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScrollContent}
                    style={styles.filterScrollView}
                >
                    {CHAPTERS.map((chapter) => (
                        <FilterChip
                            key={chapter}
                            chapter={chapter}
                            isSelected={selectedChapter === chapter}
                            onPress={handleFilterPress}
                        />
                    ))}
                </ScrollView>
            </View>

            {/* List */}
            <FlatList
                data={filteredData}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                initialNumToRender={5}
                maxToRenderPerBatch={5}
                windowSize={5}
                removeClippedSubviews={true}
            
            />
        </SafeAreaView>
    );
}

// ─── Styles ───
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(6, 182, 212, 0.2)',
    },
    backButton: {
        padding: 10,
        marginLeft: -10,
    },
    headerTitle: {
        color: '#f1f5f9',
        fontSize: 20,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },

    // Filter Chips - NEW PIXEL-PERFECT STYLES
    filterScrollView: {
        backgroundColor: 'transparent',
        marginBottom: 10,
    },
    filterScrollContent: {
        paddingHorizontal: 20, // Breathing room from screen edges
        paddingVertical: 15,
    },
    filterChip: {
        backgroundColor: '#1e293b', // Match card background
        borderWidth: 1,
        borderColor: '#334155', // Subtle border
        borderRadius: 25, // Pill shape
        paddingVertical: 10,
        paddingHorizontal: 20,
        marginRight: 12, // Spacing between chips
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterChipActive: {
        backgroundColor: '#06b6d4', // Vibrant Cyan active
        borderColor: '#22d3ee', // Lighter Cyan border
        // Glow effect
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 6, // Android shadow
    },
    filterChipText: {
        color: '#94a3b8', // Subtle slate text
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
    filterChipTextActive: {
        color: '#0f172a', // High contrast dark text on Cyan
        fontWeight: 'bold',
    },

    // List
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 0, // Spacing already from filterScrollView marginBottom
        paddingBottom: 40,
    },

    // Card Layout
    cardContainer: {
        marginBottom: 20,
    },
    cardWrapper: {
        // Needs an explicit height so absolute absolute back/front stack correctly without collapsing bounds
        minHeight: 160,
    },
    card: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backfaceVisibility: 'hidden',
    },
    cardContentContainer: {
        flex: 1,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(6, 182, 212, 0.3)', // Cyan glow border
        elevation: 5,
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
    },
    cardFront: {
        zIndex: 2,
    },
    cardBack: {
        zIndex: 1,
    },
    backAligner: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0, // Reset padding for custom layout inside back card
    },

    // Front Content
    cardContent: {
        flexDirection: 'row',
        flex: 1, // Take up available space above flip hint
    },
    // Badge
    badgeContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(6, 182, 212, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        alignSelf: 'flex-start',
    },
    badgeGlow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 30,
        shadowColor: '#06b6d4',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 8,
        backgroundColor: 'transparent',
    },
    symbolText: {
        color: '#ffffff',
        fontSize: 22,
        fontWeight: '900',
        textShadowColor: 'rgba(255, 255, 255, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
        fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    },
    // Texts
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    nameText: {
        color: '#f8fafc',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 6,
    },
    formulaBadge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(16, 185, 129, 0.15)', // Emerald
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.4)',
    },
    formulaText: {
        color: '#10b981',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    descriptionText: {
        color: '#94a3b8',
        fontSize: 13,
        lineHeight: 18,
    },

    // Front/Back Shared Hint Layout
    flipHint: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginTop: 10,
        opacity: 0.8,
    },
    flipHintText: {
        color: '#06b6d4',
        fontSize: 12,
        marginLeft: 6,
        fontWeight: '600',
    },

    // Back Content specific
    backHeader: {
        position: 'absolute',
        top: 15,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    backTitle: {
        color: '#f1f5f9',
        fontSize: 16,
        fontWeight: 'bold',
    },
    diagramPlaceholder: {
        marginTop: 20,
        backgroundColor: 'rgba(100, 116, 139, 0.1)',
        width: '85%',
        height: 80,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(100, 116, 139, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    diagramText: {
        color: '#64748b',
        fontSize: 12,
        marginTop: 8,
        fontStyle: 'italic',
    },
});