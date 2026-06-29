import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInUp, Layout, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

// ─── Local Data: AOTH Theory Highlights ─────────────────────────────────────
const THEORY_DATA = [
    {
        id: '1',
        chapter: 'Κεφ 1',
        type: 'Ορισμός',
        title: 'Το Οικονομικό Πρόβλημα',
        content: 'Το κύριο οικονομικό πρόβλημα προέκυπτει από τη διαφορά μεταξύ των απεριόριστων αναγκών των ανθρώπων και των περιορισμένων πόρων (στενότητα πόρων) που υπάρχουν για την ικανοποίησή τους.',
    },
    {
        id: '2',
        chapter: 'Κεφ 1',
        type: 'SOS',
        title: 'Καμπύλη Παραγωγικών Δυνατοτήτων (ΚΠΔ)',
        content: 'Δείχνει τις μεγαλύτερες ποσότητες ενός προϊόντος που είναι δυνατόν να παραχθούν για κάθε δεδομένη ποσότητα του άλλου προϊόντος.\n\nΠροϋποθέσεις:\n1. Η τεχνολογία είναι δεδομένη.\n2. Η οικονομία παράγει μόνο 2 αγαθά.\n3. Όλοι οι παραγωγικοί συντελεστές απασχολούνται πλήρως και αποδοτικά.',
    },
    {
        id: '3',
        chapter: 'Κεφ 2',
        type: 'SOS',
        title: 'Νόμος της Ζήτησης',
        content: 'Όταν η τιμή (P) ενός αγαθού αυξάνεται, η ζητούμενη ποσότητα (Qd) μειώνεται, και όταν η τιμή μειώνεται, η ζητούμενη ποσότητα αυξάνεται, ceteris paribus (όταν όλοι οι άλλοι παράγοντες παραμένουν σταθεροί).\n\nΗ σχέση είναι αρνητική (αντίστροφη).',
    },
    {
        id: '4',
        chapter: 'Κεφ 2',
        type: 'Προσοχή',
        title: 'Μεταβολή Ζήτησης vs Μεταβολή Ζητούμενης Ποσότητας',
        content: '• Μεταβολή της Ζητούμενης Ποσότητας: Προκαλείται ΜΟΝΟ από αλλαγή της Τιμής του ίδιου του αγαθού (Μετακίνηση ΠΑΝΩ στην ίδια καμπύλη).\n\n• Μεταβολή της Ζήτησης: Προκαλείται από τους προσδιοριστικούς παράγοντες (εισόδημα, προτιμήσεις κλπ). Έχουμε ΜΕΤΑΤΟΠΙΣΗ ολόκληρης της καμπύλης (δεξιά ή αριστερά).',
    },
];

const CHAPTERS = ['Όλα', 'Κεφ 1', 'Κεφ 2', 'Κεφ 3', 'Κεφ 4'];

// ─── Filter Chip Component ───────────────────────────────────────────────────
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

// ─── Expandable Theory Card ──────────────────────────────────────────────────
const TheoryCard = memo(({ item, index }) => {
    const [expanded, setExpanded] = useState(false);

    const toggleExpand = () => {
        setExpanded(!expanded);
    };

    const iconStyle = useAnimatedStyle(() => {
        return {
            transform: [{ rotate: withTiming(expanded ? '90deg' : '0deg', { duration: 200 }) }],
        };
    });

    const delay = index * 100;

    // Helper: Dynamic colors based on difficulty / type
    const getNeonStyle = (type) => {
        switch (type) {
            case 'SOS': 
                return { 
                    glowColor: '#f43f5e', // Rose
                    borderColor: 'rgba(244, 63, 94, 0.4)',
                    bg: 'rgba(244, 63, 94, 0.15)' 
                };
            case 'Προσοχή': 
                return { 
                    glowColor: '#f59e0b', // Amber
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    bg: 'rgba(245, 158, 11, 0.15)' 
                };
            default: // Ορισμός ή άλλα
                return { 
                    glowColor: '#10b981', // Emerald
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    bg: 'rgba(16, 185, 129, 0.15)' 
                };
        }
    };
    
    const neon = getNeonStyle(item.type);

    return (
        <Animated.View 
            entering={FadeInUp.delay(delay).duration(250)} 
            layout={Layout.duration(200).easing(Easing.out(Easing.ease))} 
            style={[
                styles.card, 
                { borderColor: neon.borderColor }, // Static border matches the type
                // When expanded, apply the strong neon glow effect
                expanded && {
                    borderColor: neon.glowColor,
                    shadowColor: neon.glowColor,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                    elevation: 8,
                }
            ]}
        >
            <TouchableOpacity onPress={toggleExpand} activeOpacity={0.8} style={styles.cardHeader}>
                <View style={styles.headerTextContainer}>
                    {/* Badge using the neon colors */}
                    <View style={[styles.typeBadge, { backgroundColor: neon.bg, borderColor: neon.borderColor }]}>
                        <Text style={[styles.typeBadgeText, { color: neon.glowColor }]}>{item.type}</Text>
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                </View>
                
                <Animated.View style={[styles.iconContainer, iconStyle]}>
                    <Icon name="chevron-right" size={16} color={expanded ? neon.glowColor : "#64748b"} />
                </Animated.View>
            </TouchableOpacity>

            {expanded && (
                <View style={styles.cardBody}>
                    <View style={[styles.separator, { backgroundColor: neon.borderColor }]} />
                    <Text style={styles.contentText}>{item.content}</Text>
                </View>
            )}
        </Animated.View>
    );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function TheoryScreen() {
    const navigation = useNavigation();
    const [selectedChapter, setSelectedChapter] = useState('Όλα');

    const filteredData = useMemo(() => {
        return THEORY_DATA.filter(item =>
            selectedChapter === 'Όλα' ? true : item.chapter === selectedChapter
        );
    }, [selectedChapter]);

    const handleGoBack = () => navigation.goBack();

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
                    <Icon name="chevron-left" size={20} color="#10b981" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>SOS Θεωρία</Text>
                <View style={{ width: 40 }} />
            </View>

            <View>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScrollContent}
                    style={styles.filterScrollView}
                >
                    {CHAPTERS.map((chapter) => (
                        <FilterChip
                            key={chapter}
                            chapter={chapter}
                            isSelected={selectedChapter === chapter}
                            onPress={setSelectedChapter}
                        />
                    ))}
                </ScrollView>
            </View>

            <FlatList
                data={filteredData}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => <TheoryCard item={item} index={index} />}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#0f172a' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20,
        borderBottomWidth: 1, borderBottomColor: 'rgba(16, 185, 129, 0.2)',
    },
    backButton: { padding: 10, marginLeft: -10 },
    headerTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5 },
    
    // Filters (Emerald Theme for consistency in Theory screen)
    filterScrollView: { backgroundColor: 'transparent', marginBottom: 10 },
    filterScrollContent: { paddingHorizontal: 20, paddingVertical: 15 },
    filterChip: {
        backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155',
        borderRadius: 25, paddingVertical: 10, paddingHorizontal: 20, marginRight: 12,
        justifyContent: 'center', alignItems: 'center',
    },
    filterChipActive: {
        backgroundColor: '#10b981', borderColor: '#34d399',
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
    },
    filterChipText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
    filterChipTextActive: { color: '#0f172a', fontWeight: 'bold' },
    
    listContent: { paddingHorizontal: 20, paddingBottom: 40 },
    
    // Cards
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        marginBottom: 16,
        borderWidth: 1,
        // The borderColor and glow are now handled dynamically in the component's style array
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        padding: 18,
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTextContainer: {
        flex: 1,
        paddingRight: 15,
    },
    typeBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        marginBottom: 8,
    },
    typeBadgeText: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardTitle: {
        color: '#f8fafc',
        fontSize: 16,
        fontWeight: 'bold',
        lineHeight: 22,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardBody: {
        paddingHorizontal: 18,
        paddingBottom: 20,
    },
    separator: {
        height: 1,
        marginBottom: 16,
        // backgroundColor is handled dynamically to match the neon theme
    },
    contentText: {
        color: '#cbd5e1',
        fontSize: 15,
        lineHeight: 24,
    },
});