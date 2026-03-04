// src/screens/GamifiedLoginScreen.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons'; // ΣΩΣΤΟ ΓΙΑ EXPO
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, withTiming, withRepeat } from 'react-native-reanimated';
import authService from '../services/authService';

const { width, height } = Dimensions.get('window');

// Δημιουργούμε ένα Animated TouchableOpacity
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity); // ΣΩΣΤΟ
export default function GamifiedLoginScreen({ onLoginSuccess, navigateToSignup, navigateToForgot }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Animations για το κουμπί
    const buttonScale = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: buttonScale.value }],
        };
    });

    const handleLogin = async () => {
        setIsLoading(true);
        // "Μικρή δόνηση" στο κουμπί
        buttonScale.value = withSpring(0.9, { dampling: 2 }, () => {
            buttonScale.value = withSpring(1);
        });

        try {
            await authService.login(username, password);
            onLoginSuccess();
        } catch (error) {
            Alert.alert('Αποτυχία Σύνδεσης', 'Λάθος username ή κωδικός.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center' }}>
                
                {/* Header με Animation */}
                <Animated.View entering={FadeInUp.delay(200).duration(1000)} style={styles.header}>
                    <Icon name="brain" size={70} color="#06b6d4" style={styles.logoIcon} />
                    <Text style={styles.title}>AOTH</Text>
                    <Text style={styles.subtitle}>Academy</Text>
                </Animated.View>

                {/* Φόρμα με Animation */}
                <Animated.View entering={FadeInUp.delay(500).duration(1000)} style={styles.form}>
                    <View style={styles.inputContainer}>
                        <Icon name="user" size={20} color="#64748b" style={styles.inputIcon} />
                        <TextInput 
                            style={styles.input} 
                            placeholder="Όνομα Χρήστη" 
                            placeholderTextColor="#64748b" 
                            value={username} 
                            onChangeText={setUsername} 
                            autoCapitalize="none" 
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Icon name="lock" size={20} color="#64748b" style={styles.inputIcon} />
                        <TextInput 
                            style={styles.input} 
                            placeholder="Κωδικός" 
                            placeholderTextColor="#64748b" 
                            value={password} 
                            onChangeText={setPassword} 
                            secureTextEntry 
                        />
                    </View>

                    <TouchableOpacity onPress={navigateToForgot} style={styles.forgotContainer}>
                        <Text style={styles.forgotText}>Ξέχασες τον κωδικό;</Text>
                    </TouchableOpacity>

                    {/* Το Gamified Κουμπί μας */}
                    <AnimatedTouchableOpacity 
                        style={[styles.loginButton, animatedButtonStyle]} 
                        onPress={handleLogin} 
                        disabled={isLoading}
                    >
                        <LinearGradient colors={['#06b6d4', '#0891b2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginGradient}>
                            {isLoading ? (
                                <Text style={styles.loginText}>Σύνδεση...</Text>
                            ) : (
                                <>
                                    <Text style={styles.loginText}>ΕΙΣΟΔΟΣ</Text>
                                    <Icon name="sign-in-alt" size={20} color="#fff" style={styles.buttonIcon} />
                                </>
                            )}
                        </LinearGradient>
                    </AnimatedTouchableOpacity>

                    <TouchableOpacity onPress={navigateToSignup} style={styles.signupContainer}>
                        <Text style={styles.signupText1}>Δεν έχεις λογαριασμό;</Text>
                        <Text style={styles.signupText2}> Δημιουργία</Text>
                    </TouchableOpacity>

                </Animated.View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { alignItems: 'center', marginBottom: 50 },
    logoIcon: { marginBottom: 15, textShadowColor: '#06b6d4', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },
    title: { fontSize: 42, fontWeight: 'bold', color: '#f1f5f9', letterSpacing: 3 },
    subtitle: { fontSize: 18, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 5 },
    form: { backgroundColor: 'rgba(30, 41, 59, 0.7)', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#334155' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 15 },
    input: { flex: 1, color: '#f1f5f9', padding: 15, fontSize: 16 },
    forgotContainer: { alignItems: 'flex-end', marginBottom: 25 },
    forgotText: { color: '#06b6d4', fontSize: 14 },
    loginButton: { height: 55, borderRadius: 15, marginBottom: 20, elevation: 5 },
    loginGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 15 },
    loginText: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10 },
    signupContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
    signupText1: { color: '#94a3b8', fontSize: 15 },
    signupText2: { color: '#06b6d4', fontSize: 15, fontWeight: 'bold' }
});