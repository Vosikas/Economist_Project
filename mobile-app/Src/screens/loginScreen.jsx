// src/screens/GamifiedLoginScreen.jsx
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import tokenStorage from '../services/tokenstorage';
import useAppStore from '../store/useAppStore';
import api from '../services/apiClient';
import { CustomAlert } from '../components/CustomAlert';

if (__DEV__) {
    console.log('🔍 Google Web Client ID:', process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ? '✅ Set' : '❌ Missing');
}

GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
});
WebBrowser.maybeCompleteAuthSession();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function GamifiedLoginScreen({ onLoginSuccess, navigateToSignup, navigateToForgot }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const buttonScale = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }]
    }));

    // ─── Google Auth ───────────────────────────────────────────────────────────
    const promptGoogleAsync = async () => {
        try {
            await GoogleSignin.hasPlayServices();
            try { await GoogleSignin.signOut(); } catch (e) { /* ignore */ }

            const userInfo = await GoogleSignin.signIn();
            if (__DEV__) console.log('✅ Google sign-in response received');

            const idToken = userInfo.idToken || userInfo.data?.idToken;

            if (idToken) {
                handleGoogleLogin(idToken);
            } else {
                CustomAlert.alert('Πρόβλημα', 'Η Google δεν έδωσε ID Token. Έλεγξε το WEB Client ID στο .env');
            }
        } catch (error) {
            if (__DEV__) console.error('❌ Google Sign-In Error:', error);
            CustomAlert.alert('Σφάλμα', 'Αποτυχία σύνδεσης με Google.');
        }
    };

    const handleGoogleLogin = async (idToken) => {
        setIsLoading(true);
        try {
            const { data } = await api.post('/auth/google', { id_token: idToken });
            await tokenStorage.saveTokens(data.access_token, data.refresh_token);
            useAppStore.getState().setToken(data.access_token);
            useAppStore.getState().setJustLoggedIn(true);
            if (onLoginSuccess) onLoginSuccess(data.access_token);
        } catch (error) {
            if (__DEV__) console.error('❌ Google login API error:', error);
            CustomAlert.alert('Google Sign-In ❌', 'Αποτυχία επαλήθευσης από τον Server.');
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Apple Auth ────────────────────────────────────────────────────────────
    const handleAppleLogin = async () => {
        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            const fullName = credential.fullName?.givenName
                ? `${credential.fullName.givenName} ${credential.fullName.familyName || ''}`.trim()
                : null;

            setIsLoading(true);
            const { data } = await api.post('/auth/apple', {
                id_token: credential.identityToken,
                full_name: fullName,
            });
            await tokenStorage.saveTokens(data.access_token, data.refresh_token);
            useAppStore.getState().setToken(data.access_token);
            useAppStore.getState().setJustLoggedIn(true);
            if (onLoginSuccess) onLoginSuccess(data.access_token);
        } catch (error) {
            if (error.code !== 'ERR_CANCELED') {
                if (__DEV__) console.error('❌ Apple login error:', error);
                CustomAlert.alert('Apple Sign-In ❌', 'Η σύνδεση με Apple απέτυχε.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Classic Login ─────────────────────────────────────────────────────────
    const handleLogin = async () => {
        const safeUsername = username.trim();
        const safePassword = password.trim();

        if (!safeUsername || !safePassword) {
            CustomAlert.alert('Αποτυχία Σύνδεσης ⚠️', 'Τα πεδία είναι άδεια.');
            return;
        }

        setIsLoading(true);
        buttonScale.value = withSpring(0.9, { damping: 2 }, () => {
            buttonScale.value = withSpring(1);
        });

        try {
            const response = await api.post('/login', {
                username: safeUsername,
                password: safePassword,
            });

            const { access_token, refresh_token } = response.data;
            await tokenStorage.saveTokens(access_token, refresh_token);
            useAppStore.getState().setToken(access_token);
            useAppStore.getState().setJustLoggedIn(true);

            if (onLoginSuccess) onLoginSuccess(access_token);

        } catch (error) {
            if (__DEV__) console.error('❌ Login error:', error);

            let errorMessage = 'Άγνωστο σφάλμα συστήματος.';

            if (error.response?.data?.detail) {
                errorMessage = error.response.data.detail;
                if (errorMessage.toLowerCase().includes('password') || errorMessage.toLowerCase().includes('username')) {
                    errorMessage = 'Τα διαπιστευτήριά σου δεν ταιριάζουν.';
                } else if (errorMessage.toLowerCase().includes('email')) {
                    errorMessage = 'Πρέπει να επιβεβαιώσεις το email σου πρώτα!';
                }
            } else if (error.request) {
                // Network error - no response received
                errorMessage = 'Δεν μπορώ να συνδεθώ στον server. Έλεγξε τη σύνδεσή σου.';
            }

            CustomAlert.alert('Access Denied 🚨', errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1, justifyContent: 'center' }}
            >
                <Animated.View entering={FadeInUp.delay(200).duration(1000)} style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>20</Text>
                        <Text style={styles.logoTextSub}>E</Text>
                    </View>
                    <Text style={styles.subtitle}>Equilibrium Point</Text>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(500).duration(1000)} style={styles.form}>

                    <View style={styles.inputContainer}>
                        <Icon name="user-astronaut" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Όνομα Χρήστη"
                            placeholderTextColor="#64748b"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Icon name="lock" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Κωδικός Ασφαλείας"
                            placeholderTextColor="#64748b"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIconContainer}>
                            <Icon name={showPassword ? 'eye' : 'eye-slash'} size={18} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={navigateToForgot} style={styles.forgotContainer}>
                        <Text style={styles.forgotText}>Ανάκτηση Κωδικού</Text>
                    </TouchableOpacity>

                    <AnimatedTouchableOpacity
                        style={[styles.loginButton, animatedButtonStyle]}
                        onPress={handleLogin}
                        disabled={isLoading}
                    >
                        <LinearGradient
                            colors={['#10b981', '#059669']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.loginGradient}
                        >
                            {isLoading ? (
                                <Text style={styles.loginText}>ΣΥΝΔΕΣΗ...</Text>
                            ) : (
                                <>
                                    <Text style={styles.loginText}>ΕΙΣΟΔΟΣ</Text>
                                    <Icon name="chevron-right" size={16} color="#fff" style={styles.buttonIcon} />
                                </>
                            )}
                        </LinearGradient>
                    </AnimatedTouchableOpacity>

                    <TouchableOpacity onPress={navigateToSignup} style={styles.signupContainer}>
                        <Text style={styles.signupText1}>Νέος χρήστης; </Text>
                        <Text style={styles.signupText2}>Ξεκίνα το Quest</Text>
                    </TouchableOpacity>

                    <View style={styles.dividerContainer}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>ή συνέχισε με</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity
                        style={styles.socialButton}
                        onPress={promptGoogleAsync}
                        disabled={isLoading}
                    >
                        <Icon name="google" size={18} color="#fff" style={{ marginRight: 10 }} />
                        <Text style={styles.socialButtonText}>Σύνδεση με Google</Text>
                    </TouchableOpacity>

                    {Platform.OS === 'ios' && (
                        <AppleAuthentication.AppleAuthenticationButton
                            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                            cornerRadius={12}
                            style={styles.appleButton}
                            onPress={handleAppleLogin}
                        />
                    )}

                </Animated.View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    header: { alignItems: 'center', marginBottom: 50 },
    logoContainer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 5 },
    logoTextMain: { fontSize: 75, fontWeight: '900', color: '#f1f5f9', letterSpacing: -2, textShadowColor: 'rgba(16, 185, 129, 0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    logoTextSub: { fontSize: 35, fontWeight: 'bold', color: '#10b981', marginLeft: 2, textShadowColor: 'rgba(16, 185, 129, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },
    subtitle: { fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 4, marginTop: -5, fontWeight: '600' },
    form: { backgroundColor: '#1E293B', padding: 30, borderRadius: 24, borderWidth: 1, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 16, color: '#94A3B8' },
    input: { flex: 1, color: '#F8FAFC', paddingVertical: 16, paddingRight: 0, fontSize: 16, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    eyeIconContainer: { padding: 16 },
    forgotContainer: { alignItems: 'flex-end', marginBottom: 30 },
    forgotText: { color: '#0EA5E9', fontSize: 14, fontWeight: '600' },
    loginButton: { height: 56, borderRadius: 12, marginBottom: 24, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    loginGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
    loginText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10, marginTop: 2 },
    signupContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
    signupText1: { color: '#94A3B8', fontSize: 15 },
    signupText2: { color: '#10B981', fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase' },
    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 16 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#334155' },
    dividerText: { color: '#64748b', fontSize: 13, marginHorizontal: 12 },
    socialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 12, height: 50, marginBottom: 12 },
    socialButtonText: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
    appleButton: { height: 50, width: '100%' },
});
