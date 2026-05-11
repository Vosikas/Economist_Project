import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import useAlertStore from '../store/useAlertStore';

export const inferAlertType = (title = '') => {
    if (!title) return 'info';
    const t = String(title).toLowerCase();
    if (t.includes('σφάλμα') || t.includes('αποτυχία') || t.includes('πρόβλημα') || t.includes('error') || t.includes('denied') || t.includes('❌') || t.includes('αδύναμ') || t.includes('αδυναμία') || t.includes('λάθος') || t.includes('system error')) return 'error';
    if (t.includes('επιτυχία') || t.includes('success') || t.includes('καθαρό') || t.includes('έτοιμος') || t.includes('στάλθηκε') || t.includes('ελήφθη') || t.includes('🟢') || t.includes('ανάκτηση') || t.includes('ping στάλθηκε')) return 'success';
    if (t.includes('προσοχή') || t.includes('warning') || t.includes('⚠️') || t.includes('ανεπαρκή') || t.includes('αποδοχή') || t.includes('συμφωνία')) return 'warning';
    return 'info';
};

export const CustomAlert = {
    alert: (title, message, buttons, options = {}) => {
        const type = options?.type || inferAlertType(title);
        useAlertStore.getState().showAlert(title, message, buttons, { ...options, type });
    },
    hide: () => {
        useAlertStore.getState().hideAlert();
    }
};

export const CustomAlertModal = () => {
    const { isVisible, title, message, buttons, options, hideAlert } = useAlertStore();

    if (!isVisible) return null;

    const handlePress = (onPress) => {
        hideAlert();
        if (onPress) {
            setTimeout(() => onPress(), 150);
        }
    };

    const getIcon = () => {
        switch (options.type) {
            case 'success': return <Ionicons name="checkmark-circle" size={60} color="#10b981" />;
            case 'error': return <Ionicons name="close-circle" size={60} color="#ef4444" />;
            case 'warning': return <Ionicons name="warning" size={60} color="#f59e0b" />;
            default: return <Ionicons name="information-circle" size={60} color="#3b82f6" />;
        }
    };

    const getGlowColor = () => {
        switch (options.type) {
            case 'success': return 'rgba(16, 185, 129, 0.4)';
            case 'error': return 'rgba(239, 68, 68, 0.4)';
            case 'warning': return 'rgba(245, 158, 11, 0.4)';
            default: return 'rgba(59, 130, 246, 0.4)';
        }
    };

    return (
        <Modal transparent visible={isVisible} animationType="none">
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.overlay}>
                <View style={[styles.alertBox, { shadowColor: getGlowColor() }]}>
                    <View style={styles.iconContainer}>
                        {getIcon()}
                    </View>
                    <Text style={styles.title}>{title}</Text>
                    {message ? <Text style={styles.message}>{message}</Text> : null}

                    <View style={styles.buttonContainer}>
                        {buttons.map((btn, index) => {
                            const isCancel = btn.style === 'cancel' || btn.style === 'destructive';
                            return (
                                <TouchableOpacity 
                                    key={index} 
                                    style={[
                                        styles.button, 
                                        buttons.length === 1 && { width: '100%' },
                                        buttons.length > 1 && { flex: 1, marginHorizontal: 6 },
                                        isCancel ? styles.cancelButton : styles.confirmButton
                                    ]}
                                    onPress={() => handlePress(btn.onPress)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[
                                        styles.buttonText, 
                                        isCancel ? styles.cancelButtonText : styles.confirmButtonText
                                    ]}>
                                        {btn.text || 'ΟΚ'}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)',
    },
    alertBox: {
        width: '85%',
        backgroundColor: '#1e293b',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 15,
    },
    iconContainer: {
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#f8fafc',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 16,
        color: '#cbd5e1',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24,
    },
    buttonContainer: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
    },
    button: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmButton: {
        backgroundColor: '#3b82f6',
    },
    cancelButton: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#475569',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    confirmButtonText: {
        color: '#ffffff',
    },
    cancelButtonText: {
        color: '#e2e8f0',
    }
});
