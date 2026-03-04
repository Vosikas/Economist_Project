import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons'; // ΣΩΣΤΟ ΓΙΑ EXPO
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import authService from '../services/authService';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity); // ΣΩΣΤΟ
export default function GamifiedForgotPasswordScreen({ navigateToReset, navigateToLogin }) {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const buttonScale = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => {
        return { transform: [{ scale: buttonScale.value }] };
    });

    const handleSendPin = async () => {
        setIsLoading(true);
        buttonScale.value = withSpring(0.9, { damping: 2 }, () => {
            buttonScale.value = withSpring(1);
        });

        try {
            const response = await authService.forgotPassword(email);
            Alert.alert('Dev Mode: Το Token σου', response.token, [
                { text: 'ΟΚ (Πάμε για Αλλαγή)', onPress: () => navigateToReset() }
            ]);
        } catch (error) {
            Alert.alert('Σφάλμα', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center' }}>
                <Animated.View entering={FadeInUp.delay(200).duration(1000)} style={styles.header}>
                    <Icon name="key" size={60} color="#f59e0b" style={styles.logoIcon} />
                    <Text style={styles.title}>Ανάκτηση</Text>
                    <Text style={styles.subtitle}>Χάθηκε το κλειδί σου;</Text>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(400).duration(1000)} style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Icon name="envelope" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Το Email σου" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                    </View>

                    <AnimatedTouchableOpacity style={[styles.actionButton, animatedButtonStyle]} onPress={handleSendPin} disabled={isLoading}>
                        <LinearGradient colors={['#f59e0b', '#d97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                            <Text style={styles.buttonText}>{isLoading ? 'ΑΝΑΖΗΤΗΣΗ...' : 'ΑΠΟΣΤΟΛΗ TOKEN'}</Text>
                            {!isLoading && <Icon name="paper-plane" size={18} color="#fff" style={styles.buttonIcon} />}
                        </LinearGradient>
                    </AnimatedTouchableOpacity>

                    <TouchableOpacity onPress={navigateToLogin} style={styles.switchContainer}>
                        <Icon name="arrow-left" size={14} color="#06b6d4" style={{ marginRight: 8, marginTop: 2 }} />
                        <Text style={styles.switchText}>Επιστροφή στη Βάση (Login)</Text>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { alignItems: 'center', marginBottom: 40 },
    logoIcon: { marginBottom: 15, textShadowColor: '#f59e0b', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    title: { fontSize: 32, fontWeight: 'bold', color: '#f1f5f9', letterSpacing: 2 },
    subtitle: { fontSize: 16, color: '#94a3b8', marginTop: 5 },
    form: { backgroundColor: 'rgba(30, 41, 59, 0.7)', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#334155' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 15, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 15 },
    input: { flex: 1, color: '#f1f5f9', padding: 15, fontSize: 16 },
    actionButton: { height: 55, borderRadius: 15, elevation: 5 },
    buttonGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 15 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10 },
    switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 },
    switchText: { color: '#06b6d4', fontSize: 15, fontWeight: 'bold' }
});