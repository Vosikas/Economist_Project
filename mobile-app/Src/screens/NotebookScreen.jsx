import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import useAppStore from '../store/useAppStore';
import { CustomAlert } from '../components/CustomAlert';


const COLOR_BG = '#0f172a';
const QUIZ_COST = 25; 

export default function NotebookScreen() {
    const navigation = useNavigation();
    
    const { user, activeMistakes, fetchActiveMistakes } = useAppStore(); 

    useEffect(() => {
        if (fetchActiveMistakes) {
            fetchActiveMistakes();
        }
    }, []);

    const currentCoins = user?.coins || 0;
    const canAfford = currentCoins >= QUIZ_COST;
    const hasMistakes = activeMistakes && activeMistakes.length > 0;

    const getThreatLevel = (count) => {
        if (count >= 3) return { color: '#ef4444', label: 'ΑΠΕΙΛΗ ΣΥΣΤΗΜΑΤΟΣ', icon: 'skull', bg: 'rgba(239, 68, 68, 0.1)' };
        if (count === 2) return { color: '#f97316', label: 'ΚΡΙΣΙΜΟ ΣΦΑΛΜΑ', icon: 'exclamation-triangle', bg: 'rgba(249, 115, 22, 0.1)' };
        return { color: '#f59e0b', label: 'ΠΡΟΕΙΔΟΠΟΙΗΣΗ', icon: 'exclamation-circle', bg: 'rgba(245, 158, 11, 0.1)' };
    };

    const handleStartProtocol = () => {
        if (!hasMistakes) {
            CustomAlert.alert("Σύστημα Καθαρό", "Δεν βρέθηκαν σφάλματα για εκκαθάριση.");
            return;
        }
        if (!canAfford) {
            CustomAlert.alert("Ανεπαρκή Νομίσματα", `Χρειάζεσαι ${QUIZ_COST} νομίσματα για να εκκινήσεις το Πρωτόκολλο Ανάκτησης.`);
            return;
        }
        
        // Αν φτάσαμε εδώ, πηγαίνουμε στο quiz screen
        navigation.navigate('RedemptionQuiz');
    };

    // 🕵️‍♂️ ΜΟΝΟ ΜΙΑ ΦΟΡΑ ΔΗΛΩΜΕΝΟ ΤΟ renderMistakeItem
    const renderMistakeItem = ({ item, index }) => {
        const threat = getThreatLevel(item.mistakes_count || 1);

        // 👉 Προσθέσαμε το item.question?.question εδώ
        const displayQuestion = item.question?.question 
                             || item.question?.question_text 
                             || item.question_text 
                             || item.text 
                             || `Ερώτηση Αναφοράς: ${item.question_id || 'Άγνωστο ID'}`;

        return (
            <Animated.View entering={FadeInUp.delay(index * 100).duration(500)}>
                <View style={[styles.mistakeCard, { borderColor: threat.color, backgroundColor: threat.bg }]}>
                    <View style={[styles.threatBadge, { backgroundColor: threat.color }]}>
                        <Icon name={threat.icon} size={10} color="#fff" />
                        <Text style={styles.threatText}>{threat.label}</Text>
                    </View>
                    
                    <Text style={styles.questionText}>{displayQuestion}</Text>
                    
                    <View style={styles.mistakeFooter}>
                        <Text style={styles.countText}>
                            Αποτυχίες: <Text style={{ color: threat.color, fontWeight: 'bold' }}>{item.mistakes_count || 1}</Text>
                        </Text>
                    </View>
                </View>
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.headerContainer}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Icon name="chevron-left" size={20} color="#06b6d4" />
                </TouchableOpacity>

                <View style={styles.titleWrapper}>
                    <Animated.Text entering={FadeInDown.delay(100)} style={styles.headerSubtitle}>
                        ΚΕΝΤΡΟ ΑΝΑΛΥΣΗΣ
                    </Animated.Text>
                    <Animated.Text entering={FadeInDown.delay(200)} style={styles.headerTitle}>
                        ΣΦΑΛΜΑΤΑ
                    </Animated.Text>
                </View>

                <View style={styles.walletBadge}>
                    <Icon name="coins" size={14} color="#eab308" />
                    <Text style={styles.walletText}>{currentCoins}</Text>
                </View>
            </View>

            <FlatList
                data={activeMistakes || []}
                keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
                renderItem={renderMistakeItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="check-circle" size={60} color="#10b981" style={{ marginBottom: 20 }} />
                        <Text style={styles.emptyTextPrimary}>ΣΥΣΤΗΜΑ ΚΑΘΑΡΟ</Text>
                        <Text style={styles.emptyTextSecondary}>Δεν υπάρχουν εκκρεμή σφάλματα προς επίλυση.</Text>
                    </View>
                }
            />

            <Animated.View entering={FadeInDown.delay(400)} style={styles.actionBar}>
                <TouchableOpacity 
                    style={[styles.actionButton, (!canAfford || !hasMistakes) && styles.actionButtonDisabled]}
                    activeOpacity={0.8}
                    onPress={handleStartProtocol}
                >
                    <LinearGradient
                        colors={canAfford && hasMistakes ? ['#0ea5e9', '#0284c7'] : ['#334155', '#1e293b']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.actionGradient}
                    >
                        <View style={styles.actionContent}>
                            <Icon name="bolt" size={18} color={canAfford && hasMistakes ? "#fff" : "#94a3b8"} />
                            <Text style={[styles.actionText, (!canAfford || !hasMistakes) && { color: '#94a3b8' }]}>
                                ΠΡΩΤΟΚΟΛΛΟ ΑΝΑΚΤΗΣΗΣ
                            </Text>
                        </View>
                        <View style={styles.costBadge}>
                            <Text style={styles.costText}>-{QUIZ_COST}</Text>
                            <Icon name="coins" size={12} color="#fbbf24" />
                        </View>
                    </LinearGradient>
                </TouchableOpacity>
                {!canAfford && hasMistakes && (
                    <Text style={styles.warningText}>Απαιτούνται {QUIZ_COST} νομίσματα.</Text>
                )}
            </Animated.View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
    backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(6, 182, 212, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.3)' },
    titleWrapper: { alignItems: 'center' },
    headerSubtitle: { color: '#06b6d4', fontSize: 10, fontWeight: 'bold', letterSpacing: 2 },
    headerTitle: { color: '#f1f5f9', fontSize: 24, fontWeight: '900', letterSpacing: 2, textShadowColor: 'rgba(6, 182, 212, 0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    walletBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(234, 179, 8, 0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#eab308' },
    walletText: { color: '#eab308', fontWeight: '900', marginLeft: 6, fontSize: 14 },
    listContent: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 10 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyTextPrimary: { color: '#10b981', fontSize: 22, fontWeight: '900', letterSpacing: 2, marginBottom: 10, textShadowColor: 'rgba(16, 185, 129, 0.5)', textShadowRadius: 10 },
    emptyTextSecondary: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
    mistakeCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
    threatBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 12 },
    threatText: { color: '#fff', fontSize: 10, fontWeight: '900', marginLeft: 6, letterSpacing: 1 },
    questionText: { color: '#f1f5f9', fontSize: 15, lineHeight: 22, marginBottom: 16 },
    mistakeFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 10 },
    countText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
    actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#0f172a', borderTopWidth: 1, borderTopColor: '#1e293b' },
    actionButton: { borderRadius: 16, overflow: 'hidden', shadowColor: '#0ea5e9', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10 },
    actionButtonDisabled: { shadowOpacity: 0, elevation: 0 },
    actionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
    actionContent: { flexDirection: 'row', alignItems: 'center' },
    actionText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1, marginLeft: 10 },
    costBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    costText: { color: '#fbbf24', fontWeight: 'bold', fontSize: 14, marginRight: 5 },
    warningText: { color: '#ef4444', textAlign: 'center', marginTop: 10, fontSize: 12, fontWeight: 'bold' }
});