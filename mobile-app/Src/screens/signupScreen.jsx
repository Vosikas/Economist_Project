// src/screens/GamifiedSignupScreen.jsx
import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform, Modal, ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, {
    FadeIn, FadeInUp, FadeInRight, SlideInUp,
    useSharedValue, useAnimatedStyle, withSpring
} from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import api from '../services/apiClient';
import tokenStorage from '../services/tokenstorage';
import useAppStore from '../store/useAppStore';
import { CustomAlert } from '../components/CustomAlert';

GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
});
WebBrowser.maybeCompleteAuthSession();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function GamifiedSignupScreen({ navigateToLogin, onLoginSuccess }) {
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);

    const buttonScale = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }]
    }));

    const animateButton = () => {
        buttonScale.value = withSpring(0.9, { damping: 2 }, () => {
            buttonScale.value = withSpring(1);
        });
    };

    // ─── Google Auth ───────────────────────────────────────────────────────────
    const promptGoogleAsync = async () => {
        try {
            await GoogleSignin.hasPlayServices();
            try { await GoogleSignin.signOut(); } catch (e) { /* ignore */ }

            if (__DEV__) console.log('⏳ Waiting for Google response...');
            const userInfo = await GoogleSignin.signIn();
            if (__DEV__) console.log('✅ Google response received');

            const idToken = userInfo.idToken || userInfo.data?.idToken;

            if (idToken) {
                if (__DEV__) console.log('🚀 Got token, sending to server...');
                handleGoogleSignup(idToken); // FIXED: Was calling wrong function
            } else {
                CustomAlert.alert('Πρόβλημα', 'Η Google δεν έδωσε ID Token. Έλεγξε το WEB Client ID στο .env');
            }
        } catch (error) {
            if (__DEV__) console.error('❌ Google Sign-In Error:', error);
            CustomAlert.alert('Σφάλμα', 'Αποτυχία σύνδεσης με Google.');
        }
    };

    const handleGoogleSignup = async (idToken) => {
        setIsLoading(true);
        try {
            const { data } = await api.post('/auth/google', { id_token: idToken });
            await tokenStorage.saveTokens(data.access_token, data.refresh_token);
            useAppStore.getState().setToken(data.access_token);
            useAppStore.getState().setJustLoggedIn(true); // FIXED: Was direct mutation

            if (onLoginSuccess) {
                onLoginSuccess(data.access_token);
            } else {
                CustomAlert.alert(
                    'Level Unlocked! 🏆',
                    'Το 20E Account σου δημιουργήθηκε με Google!',
                    [{ text: 'Πάμε στο Login', onPress: navigateToLogin }]
                );
            }
        } catch (error) {
            if (__DEV__) console.error('❌ Google signup API error:', error);
            CustomAlert.alert('Google Sign-In ❌', 'Η σύνδεση με Google απέτυχε.');
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Apple Auth ────────────────────────────────────────────────────────────
    const handleAppleSignup = async () => {
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
            useAppStore.getState().setJustLoggedIn(true); // FIXED: Was direct mutation

            if (onLoginSuccess) {
                onLoginSuccess(data.access_token);
            } else {
                CustomAlert.alert(
                    'Level Unlocked! 🏆',
                    'Το 20E Account σου δημιουργήθηκε με Apple!',
                    [{ text: 'Πάμε στο Login', onPress: navigateToLogin }]
                );
            }
        } catch (error) {
            if (error.code !== 'ERR_CANCELED') {
                if (__DEV__) console.error('❌ Apple signup error:', error);
                CustomAlert.alert('Apple Sign-In ❌', 'Η σύνδεση με Apple απέτυχε.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Classic Signup ────────────────────────────────────────────────────────
    const handleNext = () => {
        animateButton();
        if (step === 1) {
            if (!email.trim() || !email.includes('@')) {
                CustomAlert.alert('Αποτυχία ⚠️', 'Χρειαζόμαστε ένα έγκυρο email!');
                return;
            }
            setStep(2);
        } else if (step === 2) {
            if (!username.trim() || username.length < 3) {
                CustomAlert.alert('Αδύναμο Avatar ⚠️', 'Το username πρέπει να έχει τουλάχιστον 3 χαρακτήρες.');
                return;
            }
            setStep(3);
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(step - 1);
        } else {
            navigateToLogin();
        }
    };

    const handleSignup = async () => {
        animateButton();

        if (!password.trim() || password.length < 6) {
            CustomAlert.alert('Αδύναμη Θωράκιση 🛡️', 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
            return;
        }
        if (password !== confirmPassword) {
            CustomAlert.alert('Σφάλμα ⚠️', 'Οι κωδικοί δεν ταιριάζουν!');
            return;
        }
        if (!acceptedTerms) {
            CustomAlert.alert('Συμφωνία 📜', 'Πρέπει να αποδεχτείς τους Όρους Χρήσης.');
            return;
        }

        setIsLoading(true);
        try {
            await api.post('/signup', {
                username: username.trim(),
                email: email.trim().toLowerCase(),
                password: password.trim(),
            });
            CustomAlert.alert(
                'Level Unlocked! 🏆',
                'Το Account σου δημιουργήθηκε! Έλεγξε το email σου για επιβεβαίωση.',
                [{ text: 'Πάμε στο Login', onPress: navigateToLogin }]
            );
        } catch (error) {
            if (__DEV__) console.error('❌ Signup error:', error);

            let errorMessage = 'Υπήρξε ένα σφάλμα. Δοκίμασε ξανά.';

            if (error.response?.data?.detail) {
                errorMessage = error.response.data.detail;
                if (errorMessage.toLowerCase().includes('email')) {
                    errorMessage = 'Αυτό το email υπάρχει ήδη. Μήπως έχεις ήδη λογαριασμό;';
                } else if (errorMessage.toLowerCase().includes('username')) {
                    errorMessage = 'Αυτό το username είναι πιασμένο!';
                }
            } else if (error.request) {
                errorMessage = 'Δεν μπορώ να συνδεθώ στον server. Έλεγξε τη σύνδεσή σου.';
            }

            CustomAlert.alert('System Error 👾', errorMessage);
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
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                    <Icon name="arrow-left" size={20} color="#94a3b8" />
                    <Text style={styles.backText}>{step === 1 ? 'Είσοδος' : 'Πίσω'}</Text>
                </TouchableOpacity>

                <Animated.View entering={FadeInUp.delay(200).duration(1000)} style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>20</Text>
                        <Text style={styles.logoTextSub}>E</Text>
                    </View>
                    <Text style={styles.subtitle}>Νεος Παικτης</Text>
                </Animated.View>

                <View style={styles.progressContainer}>
                    <View style={[styles.progressDot, step >= 1 && styles.progressDotActive]} />
                    <View style={[styles.progressLine, step >= 2 && styles.progressLineActive]} />
                    <View style={[styles.progressDot, step >= 2 && styles.progressDotActive]} />
                    <View style={[styles.progressLine, step >= 3 && styles.progressLineActive]} />
                    <View style={[styles.progressDot, step >= 3 && styles.progressDotActive]} />
                </View>

                <Animated.View key={step} entering={FadeInRight.duration(400)} style={styles.form}>

                    {step === 1 && (
                        <>
                            <Text style={styles.stepTitle}>Ποιο είναι το email σου;</Text>
                            <Text style={styles.stepSubtitle}>Θα το χρειαστείς για να σώσεις την πρόοδό σου.</Text>
                            <View style={styles.inputContainer}>
                                <Icon name="envelope" size={18} color="#64748b" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="π.χ. player@aoth.gr"
                                    placeholderTextColor="#64748b"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>

                            <View style={styles.dividerContainer}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>ή γρήγορη εγγραφή με</Text>
                                <View style={styles.dividerLine} />
                            </View>

                            <TouchableOpacity
                                style={styles.socialButton}
                                onPress={promptGoogleAsync}
                                disabled={isLoading}
                            >
                                <Icon name="google" size={18} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={styles.socialButtonText}>Εγγραφή με Google</Text>
                            </TouchableOpacity>

                            {Platform.OS === 'ios' && (
                                <AppleAuthentication.AppleAuthenticationButton
                                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                                    cornerRadius={12}
                                    style={styles.appleButton}
                                    onPress={handleAppleSignup}
                                />
                            )}
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text style={styles.stepTitle}>Διάλεξε Username</Text>
                            <Text style={styles.stepSubtitle}>Πώς θέλεις να σε φωνάζουμε;</Text>
                            <View style={styles.inputContainer}>
                                <Icon name="user-astronaut" size={18} color="#64748b" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Avatar Name"
                                    placeholderTextColor="#64748b"
                                    value={username}
                                    onChangeText={setUsername}
                                    autoCapitalize="none"
                                />
                            </View>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Text style={styles.stepTitle}>Θωράκισε το Account</Text>
                            <Text style={styles.stepSubtitle}>Βάλε έναν δυνατό κωδικό.</Text>

                            <View style={styles.inputContainer}>
                                <Icon name="lock" size={18} color="#64748b" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Μυστικός Κωδικός"
                                    placeholderTextColor="#64748b"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIconContainer}>
                                    <Icon name={showPassword ? 'eye' : 'eye-slash'} size={18} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>

                            <View style={[styles.inputContainer, { marginBottom: (confirmPassword.length > 0 && password !== confirmPassword) ? 8 : 20 }]}>
                                <Icon name="lock" size={18} color="#64748b" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Επιβεβαίωση Κωδικού"
                                    placeholderTextColor="#64748b"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showConfirmPassword}
                                />
                                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIconContainer}>
                                    <Icon name={showConfirmPassword ? 'eye' : 'eye-slash'} size={18} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>

                            {(confirmPassword.length > 0 && password !== confirmPassword) && (
                                <Text style={styles.errorText}>Οι κωδικοί δεν ταιριάζουν</Text>
                            )}

                            <View style={styles.termsContainer}>
                                <TouchableOpacity
                                    style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
                                    onPress={() => setAcceptedTerms(!acceptedTerms)}
                                >
                                    {acceptedTerms && <Icon name="check" size={12} color="#0f172a" />}
                                </TouchableOpacity>
                                <Text style={styles.termsText}>
                                    Συμφωνώ με τους{' '}
                                    <Text style={styles.termsLink} onPress={() => setShowTermsModal(true)}>
                                        Όρους Χρήσης
                                    </Text>
                                    {' '}του 20E.
                                </Text>
                            </View>
                        </>
                    )}

                    <AnimatedTouchableOpacity
                        style={[
                            styles.actionButton,
                            animatedButtonStyle,
                            (step === 3 && (!acceptedTerms || (confirmPassword.length > 0 && password !== confirmPassword)))
                                ? { opacity: 0.5 }
                                : null,
                        ]}
                        onPress={step === 3 ? handleSignup : handleNext}
                        disabled={isLoading}
                    >
                        <LinearGradient
                            colors={['#10b981', '#059669']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.buttonText}>
                                {isLoading ? 'ΦΟΡΤΩΣΗ...' : (step === 3 ? 'ΟΛΟΚΛΗΡΩΣΗ' : 'ΕΠΟΜΕΝΟ')}
                            </Text>
                            {!isLoading && (
                                <Icon
                                    name={step === 3 ? 'gamepad' : 'chevron-right'}
                                    size={18} color="#fff"
                                    style={styles.buttonIcon}
                                />
                            )}
                        </LinearGradient>
                    </AnimatedTouchableOpacity>

                </Animated.View>
            </KeyboardAvoidingView>

            <Modal visible={showTermsModal} transparent animationType="none">
                <Animated.View entering={FadeIn.duration(200)} style={styles.modalOverlay}>
                    <Animated.View entering={SlideInUp.duration(300)} style={styles.termsModalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Όροι Χρήσης 20E</Text>
                            <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                                <Icon name="times" size={24} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.termsScrollView} showsVerticalScrollIndicator={false}>
                            <Text style={styles.termsContent}>
                                Καλώς ήρθες στο 20E!{'\n\n'}
                                <Text style={{ fontWeight: 'bold', color: '#f1f5f9' }}>1. Σκοπός</Text>{'\n'}
                                Το 20E δημιουργήθηκε για εξάσκηση στο ΑΟΘ μέσα από gamified περιβάλλον.{'\n\n'}
                                <Text style={{ fontWeight: 'bold', color: '#f1f5f9' }}>2. Τα Δεδομένα σου</Text>{'\n'}
                                Το email σου χρησιμοποιείται μόνο για ανάκτηση λογαριασμού.{'\n\n'}
                                <Text style={{ fontWeight: 'bold', color: '#f1f5f9' }}>3. Εικονικό Νόμισμα</Text>{'\n'}
                                Τα νομίσματα έχουν αξία μόνο μέσα στο παιχνίδι.{'\n\n'}
                                <Text style={{ fontWeight: 'bold', color: '#f1f5f9' }}>4. Διαγραφή</Text>{'\n'}
                                Μπορείς να διαγράψεις το προφίλ σου από τις Ρυθμίσεις.{'\n\n'}
                                Καλή επιτυχία! 🚀
                            </Text>
                        </ScrollView>
                        <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={() => {
                                setAcceptedTerms(true);
                                setShowTermsModal(false);
                            }}
                        >
                            <Text style={styles.acceptBtnText}>Αποδοχή & Συνέχεια</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
            </Modal>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    backButton: { flexDirection: 'row', alignItems: 'center', position: 'absolute', top: 50, left: 20, zIndex: 10 },
    backText: { color: '#94A3B8', fontSize: 16, marginLeft: 8, fontWeight: 'bold' },
    header: { alignItems: 'center', marginBottom: 30, marginTop: 40 },
    logoContainer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 5 },
    logoTextMain: { fontSize: 60, fontWeight: '900', color: '#F1F5F9', letterSpacing: -2, textShadowColor: 'rgba(16, 185, 129, 0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    logoTextSub: { fontSize: 28, fontWeight: 'bold', color: '#10B981', marginLeft: 2, textShadowColor: 'rgba(16, 185, 129, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },
    subtitle: { fontSize: 14, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 4, fontWeight: '600' },
    progressContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
    progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155' },
    progressDotActive: { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10 },
    progressLine: { width: 40, height: 2, backgroundColor: '#334155', marginHorizontal: 5 },
    progressLineActive: { backgroundColor: '#10B981' },
    form: { backgroundColor: '#1E293B', padding: 30, borderRadius: 24, borderWidth: 1, borderColor: '#334155', minHeight: 250, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
    stepTitle: { fontSize: 24, fontWeight: '700', color: '#F8FAFC', marginBottom: 8, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    stepSubtitle: { fontSize: 15, color: '#94A3B8', marginBottom: 24, lineHeight: 22 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 16, color: '#94A3B8' },
    input: { flex: 1, color: '#F8FAFC', paddingVertical: 16, paddingRight: 0, fontSize: 16, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    eyeIconContainer: { padding: 16 },
    errorText: { color: '#ef4444', fontSize: 14, marginBottom: 16, marginLeft: 4, fontWeight: '600' },
    actionButton: { height: 56, borderRadius: 12, marginTop: 8, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    buttonGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10, marginTop: 2 },
    termsContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, marginTop: -5, paddingHorizontal: 4 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#10b981', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    checkboxChecked: { backgroundColor: '#10b981' },
    termsText: { flex: 1, color: '#94a3b8', fontSize: 13, lineHeight: 20 },
    termsLink: { color: '#06b6d4', fontWeight: 'bold' },
    dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#334155' },
    dividerText: { color: '#64748b', fontSize: 12, marginHorizontal: 10 },
    socialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155', borderRadius: 12, height: 50, marginBottom: 12 },
    socialButtonText: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
    appleButton: { height: 50, width: '100%', marginBottom: 4 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.9)', justifyContent: 'flex-end' },
    termsModalCard: { backgroundColor: '#1e293b', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '75%', padding: 25, paddingBottom: 40, borderWidth: 1, borderColor: '#334155' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#f1f5f9' },
    termsScrollView: { flex: 1, marginBottom: 20 },
    termsContent: { color: '#94a3b8', fontSize: 15, lineHeight: 24 },
    acceptBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center' },
    acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
