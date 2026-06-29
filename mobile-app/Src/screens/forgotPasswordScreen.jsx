import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import authService from '../services/authService';
import { CustomAlert } from '../components/CustomAlert';


const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function GamifiedForgotPasswordScreen({ navigateToReset, navigateToLogin }) {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const buttonScale = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => {
        return { transform: [{ scale: buttonScale.value }] };
    });

    const handleSendPin = async () => {
        if (!email.trim() || !email.includes('@')) {
            CustomAlert.alert('Αποτυχία Συστήματος ⚠️', 'Δώσε ένα έγκυρο email για να στείλουμε το σήμα.');
            return;
        }

        setIsLoading(true);
        buttonScale.value = withSpring(0.9, { damping: 2 }, () => {
            buttonScale.value = withSpring(1);
        });

        try {
            const formattedEmail = email.trim().toLowerCase();
            const response = await authService.forgotPassword(formattedEmail);
            
            CustomAlert.alert('Ping Στάλθηκε! 📡', `Dev Mode (Το PIN σου): ${response.token}\n\nΣτην κανονική λειτουργία αυτό πάει στο email.`, [
                // Στέλνουμε το email πίσω στο App.js!
                { text: 'ΟΚ (Εισαγωγή PIN)', onPress: () => navigateToReset(formattedEmail) }
            ]);
        } catch (error) {
            CustomAlert.alert('System Error 👾', error.message || 'Δεν βρέθηκε παίκτης με αυτό το email.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center' }}>
                <Animated.View entering={FadeInUp.delay(200).duration(1000)} style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>20</Text>
                        <Text style={styles.logoTextSubCyan}>E</Text>
                    </View>
                    <Text style={styles.subtitleCyan}>System Override</Text>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(400).duration(1000)} style={styles.form}>
                    <Text style={styles.stepTitle}>Χάθηκε το κλειδί σου;</Text>
                    <Text style={styles.stepSubtitle}>Βάλε το email σου για να σου στείλουμε το 6ψήφιο PIN ανάκτησης.</Text>
                    
                    <View style={styles.inputContainer}>
                        <Icon name="envelope" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Το Email σου" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                    </View>

                    <AnimatedTouchableOpacity style={[styles.actionButton, animatedButtonStyle]} onPress={handleSendPin} disabled={isLoading}>
                        <LinearGradient colors={['#06b6d4', '#0891b2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                            <Text style={styles.buttonText}>{isLoading ? 'ΑΝΑΖΗΤΗΣΗ...' : 'ΑΠΟΣΤΟΛΗ PIN'}</Text>
                            {!isLoading && <Icon name="satellite-dish" size={18} color="#fff" style={styles.buttonIcon} />}
                        </LinearGradient>
                    </AnimatedTouchableOpacity>

                    <TouchableOpacity onPress={navigateToLogin} style={styles.switchContainer}>
                        <Icon name="arrow-left" size={14} color="#06b6d4" style={{ marginRight: 8, marginTop: 2 }} />
                        <Text style={styles.switchText}>Επιστροφή στη Βάση</Text>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { alignItems: 'center', marginBottom: 40, marginTop: 20 },
    logoContainer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 5 },
    logoTextMain: { fontSize: 60, fontWeight: '900', color: '#F1F5F9', letterSpacing: -2, textShadowColor: 'rgba(14, 165, 233, 0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    logoTextSubCyan: { fontSize: 28, fontWeight: 'bold', color: '#0EA5E9', marginLeft: 2, textShadowColor: 'rgba(14, 165, 233, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },
    subtitleCyan: { fontSize: 14, color: '#0EA5E9', textTransform: 'uppercase', letterSpacing: 4, fontWeight: '600' },
    form: { 
        backgroundColor: '#1E293B', 
        padding: 30, 
        borderRadius: 24, 
        borderWidth: 1, 
        borderColor: '#334155',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10 
    },
    stepTitle: { fontSize: 24, fontWeight: '700', color: '#F8FAFC', marginBottom: 8, textAlign: 'center', fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    stepSubtitle: { fontSize: 15, color: '#94A3B8', marginBottom: 24, textAlign: 'center', lineHeight: 22 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 16, color: '#94A3B8' },
    input: { flex: 1, color: '#F8FAFC', paddingVertical: 16, paddingRight: 16, fontSize: 16, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    actionButton: { height: 56, borderRadius: 12, shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    buttonGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10 },
    switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
    switchText: { color: '#0EA5E9', fontSize: 15, fontWeight: '600' }
});