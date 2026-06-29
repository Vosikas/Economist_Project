import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

const COLOR_BG = '#0f172a';

export default function TermsScreen({ navigation }) {
    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Icon name="arrow-left" size={20} color="#f1f5f9" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Όροι Χρήσης & Απορρήτου</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.lastUpdated}>Τελευταία Ενημέρωση: Απρίλιος 2026</Text>

                <Text style={styles.title}>1. Αποδοχή των Όρων</Text>
                <Text style={styles.paragraph}>
                    Με τη χρήση της εφαρμογής 20_E, συμφωνείτε να δεσμεύεστε από τους παρόντες όρους. 
                    Αν δεν συμφωνείτε, παρακαλούμε να μην χρησιμοποιήσετε την εφαρμογή.
                </Text>

                <Text style={styles.title}>2. Πνευματικά Δικαιώματα</Text>
                <Text style={styles.paragraph}>
                    Όλο το εκπαιδευτικό υλικό, οι ερωτήσεις και ο σχεδιασμός της εφαρμογής (Gamification) 
                    αποτελούν πνευματική ιδιοκτησία του 20_E. Απαγορεύεται η αντιγραφή ή αναδημοσίευση χωρίς άδεια.
                </Text>

                <Text style={styles.title}>3. Λογαριασμοί Χρηστών</Text>
                <Text style={styles.paragraph}>
                    Είστε υπεύθυνοι για τη διατήρηση της εμπιστευτικότητας του κωδικού σας. Το 20_E 
                    δεν φέρει ευθύνη για οποιαδήποτε απώλεια δεδομένων λόγω μη εξουσιοδοτημένης πρόσβασης.
                </Text>

                <Text style={styles.title}>4. Προστασία Δεδομένων (GDPR)</Text>
                <Text style={styles.paragraph}>
                    Συλλέγουμε μόνο τα απαραίτητα δεδομένα (email) για τη λειτουργία της εφαρμογής. 
                    Σεβόμαστε την ιδιωτικότητά σας και δεν μοιραζόμαστε τα δεδομένα σας με τρίτους για διαφημιστικούς σκοπούς.
                </Text>

                <View style={styles.footer}>
                    <Icon name="shield-alt" size={24} color="#64748b" style={{ marginBottom: 10 }} />
                    <Text style={styles.footerText}>Η ομάδα του 20_E</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    backBtn: { padding: 10, marginLeft: -10 },
    headerTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold' },
    content: { padding: 25, paddingBottom: 50 },
    lastUpdated: { color: '#64748b', fontSize: 12, marginBottom: 30, textAlign: 'center', fontStyle: 'italic' },
    title: { color: '#06b6d4', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
    paragraph: { color: '#94a3b8', fontSize: 14, lineHeight: 22, marginBottom: 25 },
    footer: { alignItems: 'center', marginTop: 40, opacity: 0.5 },
    footerText: { color: '#94a3b8', fontSize: 12 }
});