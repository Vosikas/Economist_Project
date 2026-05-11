import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import useAppStore from '../store/useAppStore';

// Κάνουμε import το custom Axios instance σου
import api from '../services/apiClient'; 
import { CustomAlert } from '../components/CustomAlert';

const COLOR_BG = '#0f172a';
const COLOR_CARD = 'rgba(30, 41, 59, 0.5)'; 
const COLOR_PRIMARY = '#06b6d4'; 

export default function ChangeEmailScreen({ navigation }) {
    // Κρατάμε μόνο τα απαραίτητα (το token αφαιρέθηκε)
    const { user, updateUserLocal } = useAppStore(); 
    
    const [currentEmail] = useState(user?.email || '');
    const [newEmail, setNewEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleUpdate = async () => {
        if (!newEmail.includes('@') || !newEmail.includes('.')) {
            CustomAlert.alert("Σφάλμα", "Παρακαλώ εισάγετε ένα έγκυρο email.");
            return;
        }

        if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
            CustomAlert.alert("Ενημέρωση", "Αυτό είναι ήδη το email σας.");
            return;
        }

        setIsLoading(true);

        try {
            await api.post('/change-email', {
                new_email: newEmail.toLowerCase().trim()
            });

            // Ενημερώνουμε το τοπικό Store για να φανεί η αλλαγή κατευθείαν
            if (updateUserLocal) {
                updateUserLocal({ email: newEmail.toLowerCase().trim() });
            }

            CustomAlert.alert("Επιτυχία", "Το email σας ενημερώθηκε επιτυχώς!");
            navigation.goBack();

        } catch (error) {
            const errorMsg = error.response?.data?.detail || "Αποτυχία ενημέρωσης email.";
            CustomAlert.alert("Σφάλμα", errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} disabled={isLoading}>
                    <Icon name="arrow-left" size={20} color="#f1f5f9" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Email Λογαριασμού</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <View style={styles.content}>
                    <Text style={styles.label}>Τρέχον Email</Text>
                    <View style={styles.inputContainer}>
                        <Icon name="envelope" size={16} color="#64748b" style={styles.inputIcon} />
                        <TextInput
                            style={[styles.input, { color: '#94a3b8' }]}
                            value={currentEmail}
                            editable={false}
                        />
                    </View>

                    <Text style={[styles.label, { marginTop: 25 }]}>Νέο Email</Text>
                    <View style={styles.inputContainer}>
                        <Icon name="envelope-open" size={16} color={COLOR_PRIMARY} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Εισάγετε το νέο σας email"
                            placeholderTextColor="#475569"
                            value={newEmail}
                            onChangeText={setNewEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!isLoading}
                        />
                    </View>

                    <TouchableOpacity 
                        style={[styles.saveButton, isLoading && { opacity: 0.7 }]} 
                        onPress={handleUpdate}
                        disabled={isLoading}
                    >
                        <LinearGradient colors={[COLOR_PRIMARY, '#3b82f6']} style={styles.saveGradient}>
                            {isLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveText}>ΑΠΟΘΗΚΕΥΣΗ</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    backBtn: { padding: 10, marginLeft: -10 },
    headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold' },
    content: { padding: 25, paddingTop: 40 },
    label: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', marginBottom: 10, marginLeft: 5 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR_CARD, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 15 },
    inputIcon: { marginRight: 15 },
    input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 16 },
    saveButton: { borderRadius: 16, overflow: 'hidden', marginTop: 40 },
    saveGradient: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
    saveText: { color: '#fff', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 }
});