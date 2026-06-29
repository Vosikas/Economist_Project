import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import authService from '../services/authService';
import { CustomAlert } from '../components/CustomAlert';


const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function GamifiedResetPasswordScreen({ navigateToLogin, userEmail = '' }) {
    const [email, setEmail] = useState(userEmail); 
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    // 👉 ΝΕΑ STATES: Για το Χρονόμετρο (120 δευτερόλεπτα = 2 λεπτά)
    const [timeLeft, setTimeLeft] = useState(120); 
    const [isLoading, setIsLoading] = useState(false);
    const buttonScale = useSharedValue(1);

    useEffect(() => {
        if (userEmail) {
            setEmail(userEmail);
        }
    }, [userEmail]);

    // 👉 ΝΕΟ EFFECT: Η λογική της αντίστροφης μέτρησης
    useEffect(() => {
        if (timeLeft <= 0) return;
        
        const timerId = setInterval(() => {
            setTimeLeft((prevTime) => prevTime - 1);
        }, 1000);
        
        return () => clearInterval(timerId);
    }, [timeLeft]);

    // Μετατρέπει τα δευτερόλεπτα σε μορφή MM:SS
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const animatedButtonStyle = useAnimatedStyle(() => {
        return { transform: [{ scale: buttonScale.value }] };
    });

    const handleReset = async () => {
        if (!email.trim() || !otp.trim() || !newPassword.trim() || !confirmPassword.trim()) {
            CustomAlert.alert('Προσοχή ⚠️', 'Συμπλήρωσε όλα τα πεδία για να προχωρήσεις.');
            return;
        }
        if (newPassword.length < 6) {
            CustomAlert.alert('Αδύναμη Θωράκιση 🛡️', 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
            return;
        }
        if (newPassword !== confirmPassword) {
            CustomAlert.alert('Σφάλμα ⚠️', 'Οι κωδικοί που πληκτρολόγησες δεν ταιριάζουν!');
            return;
        }

        setIsLoading(true);
        buttonScale.value = withSpring(0.9, { damping: 2 }, () => {
            buttonScale.value = withSpring(1);
        });

        try {
            await authService.resetPassword(email.trim().toLowerCase(), otp.trim(), newPassword.trim());
            CustomAlert.alert('Επιτυχία! 🟢', 'Η θωράκισή σου αναβαθμίστηκε. Είσαι έτοιμος για login!');
            navigateToLogin();
        } catch (error) {
            CustomAlert.alert('Σφάλμα', error.message || 'Το PIN είναι λάθος ή έχει λήξει.');
        } finally {
            setIsLoading(false);
        }
    };

    // 👉 ΝΕΑ ΣΥΝΑΡΤΗΣΗ: Επαναποστολή PIN
    const handleResendOTP = async () => {
        if (!email.trim()) {
            CustomAlert.alert('Προσοχή', 'Συμπλήρωσε πρώτα το email σου.');
            return;
        }
        try {
            // Υποθέτω ότι στο authService έχεις μια συνάρτηση forgotPassword
            await authService.forgotPassword(email.trim().toLowerCase()); 
            setTimeLeft(120); // Επαναφορά χρονομέτρου
            CustomAlert.alert('Σήμα Εστάλη 📡', 'Ένα νέο PIN ταξιδεύει προς το email σου!');
        } catch (error) {
            CustomAlert.alert('Σφάλμα', 'Δεν μπορέσαμε να στείλουμε νέο PIN. Δοκίμασε ξανά σε λίγο.');
        }
    };

    return (
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center' }}>
                <Animated.View entering={FadeInUp.delay(200).duration(1000)} style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoTextMain}>20</Text>
                        <Text style={styles.logoTextSubGreen}>E</Text>
                    </View>
                    <Text style={styles.subtitleGreen}>Νεα Θωρακιση</Text>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(400).duration(1000)} style={styles.form}>
                    
                    <View style={styles.inputContainer}>
                        <Icon name="envelope" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Το Email σου" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                    </View>

                    <View style={styles.inputContainer}>
                        <Icon name="hashtag" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput style={styles.input} placeholder="Το 6ψήφιο PIN" placeholderTextColor="#64748b" value={otp} onChangeText={setOtp} autoCapitalize="none" keyboardType="number-pad" />
                    </View>

                    {/* 👉 ΝΕΟ UI: Το Timer για το Resend PIN κάτω από το OTP */}
                    <View style={styles.resendContainer}>
                        {timeLeft > 0 ? (
                            <Text style={styles.resendTextMuted}>
                                ⏳ Νέο σήμα σε <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
                            </Text>
                        ) : (
                            <TouchableOpacity onPress={handleResendOTP} style={styles.resendButtonActive}>
                                <Icon name="sync-alt" size={14} color="#10b981" />
                                <Text style={styles.resendTextActive}> Δεν ήρθε; Ξαναστείλε το PIN</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.inputContainer}>
                        <Icon name="lock" size={18} color="#64748b" style={styles.inputIcon} />
                        <TextInput 
                            style={styles.input} 
                            placeholder="Νέος Κωδικός" 
                            placeholderTextColor="#64748b" 
                            value={newPassword} 
                            onChangeText={setNewPassword} 
                            secureTextEntry={!showPassword} 
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIconContainer}>
                            <Icon name={showPassword ? "eye" : "eye-slash"} size={18} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.inputContainer, { marginBottom: (confirmPassword.length > 0 && newPassword !== confirmPassword) ? 8 : 20 }]}>
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
                            <Icon name={showConfirmPassword ? "eye" : "eye-slash"} size={18} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>
                    
                    {(confirmPassword.length > 0 && newPassword !== confirmPassword) && (
                        <Text style={styles.errorText}>Οι κωδικοί δεν ταιριάζουν</Text>
                    )}

                    <AnimatedTouchableOpacity 
                        style={[
                            styles.actionButton, 
                            animatedButtonStyle,
                            (confirmPassword.length > 0 && newPassword !== confirmPassword) ? { opacity: 0.5 } : null
                        ]} 
                        onPress={handleReset} 
                        disabled={isLoading || (confirmPassword.length > 0 && newPassword !== confirmPassword)}
                    >
                        <LinearGradient colors={['#10b981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
                            <Text style={styles.buttonText}>{isLoading ? 'ΑΠΟΘΗΚΕΥΣΗ...' : 'ΑΛΛΑΓΗ ΚΩΔΙΚΟΥ'}</Text>
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
    header: { alignItems: 'center', marginBottom: 40, marginTop: 20 },
    logoContainer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 5 },
    logoTextMain: { fontSize: 60, fontWeight: '900', color: '#F1F5F9', letterSpacing: -2, textShadowColor: 'rgba(16, 185, 129, 0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
    logoTextSubGreen: { fontSize: 28, fontWeight: 'bold', color: '#10B981', marginLeft: 2, textShadowColor: 'rgba(16, 185, 129, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15 },
    subtitleGreen: { fontSize: 14, color: '#10B981', textTransform: 'uppercase', letterSpacing: 4, fontWeight: '600' },
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
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
    inputIcon: { padding: 16, color: '#94A3B8' },
    input: { flex: 1, color: '#F8FAFC', paddingVertical: 16, paddingRight: 0, fontSize: 16, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }) },
    
    // 👉 ΝΕΑ STYLES ΓΙΑ ΤΟ TIMER
    resendContainer: { alignItems: 'flex-end', marginBottom: 20, marginTop: -10, paddingRight: 4 },
    resendTextMuted: { color: '#64748B', fontSize: 13, fontWeight: '600' },
    timerText: { color: '#f1f5f9', fontWeight: 'bold' },
    resendButtonActive: { flexDirection: 'row', alignItems: 'center' },
    resendTextActive: { color: '#10b981', fontSize: 13, fontWeight: 'bold' },

    eyeIconContainer: { padding: 16 },
    errorText: { color: '#ef4444', fontSize: 13, marginBottom: 16, marginTop: -4, marginLeft: 4, fontWeight: '600' },
    
    actionButton: { height: 56, borderRadius: 12, marginTop: 8, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    buttonGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
    buttonIcon: { marginLeft: 10 },
    switchContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
    switchText: { color: '#64748B', fontSize: 15, fontWeight: '500' }
});