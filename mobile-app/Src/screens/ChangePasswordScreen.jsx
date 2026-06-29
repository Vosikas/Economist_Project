import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Κάνουμε import το custom Axios instance σου
import api from '../services/apiClient';  
import { CustomAlert } from '../components/CustomAlert';


const COLOR_BG = '#0f172a';
const COLOR_CARD = 'rgba(30, 41, 59, 0.5)'; 
const COLOR_PRIMARY = '#06b6d4'; 

export default function ChangePasswordScreen({ navigation }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleUpdate = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            CustomAlert.alert("Σφάλμα", "Παρακαλώ συμπληρώστε όλα τα πεδία.");
            return;
        }
        if (newPassword !== confirmPassword) {
            CustomAlert.alert("Σφάλμα", "Ο νέος κωδικός και η επιβεβαίωση δεν ταιριάζουν.");
            return;
        }
        if (newPassword.length < 6) {
            CustomAlert.alert("Σφάλμα", "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.");
            return;
        }

        setIsLoading(true);

        try {
            // Το Axios interceptor θα βάλει αυτόματα το Bearer Token!
            await api.post('/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            });

            CustomAlert.alert("Επιτυχία", "Ο κωδικός σας άλλαξε επιτυχώς!");
            navigation.goBack();
            
        } catch (error) {
            // Το Axios βάζει το HTTP response error μέσα στο error.response
            const errorMsg = error.response?.data?.detail || "Κάτι πήγε στραβά κατά την αλλαγή.";
            CustomAlert.alert("Αποτυχία", errorMsg);
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
                <Text style={styles.headerTitle}>Αλλαγή Κωδικού</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>
                    
                    <Text style={styles.label}>Τρέχων Κωδικός</Text>
                    <View style={styles.inputContainer}>
                        <Icon name="lock" size={16} color="#64748b" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="••••••••"
                            placeholderTextColor="#475569"
                            secureTextEntry={!showPassword}
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            editable={!isLoading}
                        />
                    </View>

                    <Text style={[styles.label, { marginTop: 25 }]}>Νέος Κωδικός</Text>
                    <View style={styles.inputContainer}>
                        <Icon name="key" size={16} color={COLOR_PRIMARY} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Τουλάχιστον 6 χαρακτήρες"
                            placeholderTextColor="#475569"
                            secureTextEntry={!showPassword}
                            value={newPassword}
                            onChangeText={setNewPassword}
                            editable={!isLoading}
                        />
                    </View>

                    <Text style={[styles.label, { marginTop: 20 }]}>Επιβεβαίωση Κωδικού</Text>
                    <View style={styles.inputContainer}>
                        <Icon name="check-circle" size={16} color={COLOR_PRIMARY} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Ξαναγράψτε τον νέο κωδικό"
                            placeholderTextColor="#475569"
                            secureTextEntry={!showPassword}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            editable={!isLoading}
                        />
                    </View>

                    <TouchableOpacity 
                        style={styles.toggleVisibility} 
                        onPress={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                    >
                        <Icon name={showPassword ? "eye-slash" : "eye"} size={14} color="#94a3b8" />
                        <Text style={styles.toggleText}>{showPassword ? "Απόκρυψη" : "Εμφάνιση"} κωδικών</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.saveButton, isLoading && { opacity: 0.7 }]} 
                        onPress={handleUpdate}
                        disabled={isLoading}
                    >
                        <LinearGradient colors={[COLOR_PRIMARY, '#3b82f6']} style={styles.saveGradient}>
                            {isLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.saveText}>ΑΛΛΑΓΗ ΚΩΔΙΚΟΥ</Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    backBtn: { padding: 10, marginLeft: -10 },
    headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold' },
    content: { padding: 25, paddingTop: 30, paddingBottom: 50 },
    label: { color: '#f1f5f9', fontSize: 14, fontWeight: '600', marginBottom: 10, marginLeft: 5 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR_CARD, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 15 },
    inputIcon: { marginRight: 15 },
    input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 16 },
    toggleVisibility: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 15, marginRight: 5 },
    toggleText: { color: '#94a3b8', fontSize: 13, marginLeft: 8 },
    saveButton: { borderRadius: 16, overflow: 'hidden', marginTop: 40 },
    saveGradient: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
    saveText: { color: '#fff', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 }
});