import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import authService from '../services/authService';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function GamifiedResetPasswordScreen({ navigateToLogin }) {
    const [token, setToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const buttonScale = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => {
        return { transform: [{ scale: buttonScale.value }] };
    });

    const handleReset = async () => {
        if (!token || !newPassword) {
            Alert.alert('Προσοχή', 'Βάλε το Token και τον νέο κωδικό σου!');
            return;
        }

        setIsLoading(true);
        buttonScale.value = withSpring(0.9, { damping: 2 }, () => {
            buttonScale.value = withSpring(1);
        });

        try {
            await authService.resetPassword(token, newPassword);
            Alert.alert('Επιτυχία!', 'Ο κωδικός σου αναβαθμίστηκε. Έτοιμος για login!');
            navigateToLogin();
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
                    <Icon name="shield-alt" size={60} color="#10b981" style={styles.logoIcon} />
                    <Text style={styles.title}>Νέα Θωράκιση</Text>
                    <Text style={styles.subtitle}>Αναβάθμισε τον κωδικό σου</Text>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(400).duration(1000)} style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Icon name="ticket-alt" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Επικόλληση Token" placeholderTextColor="#64748b" value={token} onChangeText={setToken} autoCapitalize="none" />
                    </View>

                    <View style={styles.inputContainer}>
                        <Icon name="lock" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Νέος Κωδικός" placeholderTextColor="#64748b" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
                    </View>

                    <AnimatedTouchableOpacity style={[styles.actionButton, animatedButtonStyle]} onPress={handleReset} disabled={isLoading}>
                        <LinearGradient colors={['#10b981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                            <Text style={styles.buttonText}>{isLoading ? 'ΑΠΟΘΗΚΕΥΣΗ...' : 'ΕΝΕΡΓΟΠΟΙΗΣΗ'}</Text>
                            {!isLoading && <Icon name="check-circle" size={18} color="#fff" style={styles.buttonIcon} />}
                        </LinearGradient>
                    </AnimatedTouchableOpacity>

                    <TouchableOpacity onPress={navigateToLogin} style={styles.switchContainer}>
                        <Text style={styles.switchText}>Άκυρο, πάμε πίσω στο Login</Text>
                    </TouchableOpacity>
                </Animated.View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { alignItems: 'center', marginBottom: 40 },
    logoIcon: { marginBottom: 15, textShadowColor: '#10b981', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    title: { fontSize: 32, fontWeight: 'bold', color: '#f1f5f9', letterSpacing: 1 },
    subtitle: { fontSize: 16, color: '#94a3b8', marginTop: 5 },
    form: { backgroundColor: 'rgba(30, 41, 59, 0.7)', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#334155' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 15 },
    input: { flex: 1, color: '#f1f5f9', padding: 15, fontSize: 16 },
    actionButton: { height: 55, borderRadius: 15, marginTop: 10, elevation: 5 },
    buttonGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 15 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10 },
    switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 },
    switchText: { color: '#64748b', fontSize: 15 }
});