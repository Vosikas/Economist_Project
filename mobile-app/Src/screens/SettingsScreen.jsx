import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import useAppStore from '../store/useAppStore';
import { CustomAlert } from '../components/CustomAlert';


const COLOR_BG = '#0f172a';
const COLOR_CARD = 'rgba(30, 41, 59, 0.5)'; 
const COLOR_PRIMARY = '#06b6d4'; 

const SettingRow = ({ icon, title, value, onValueChange, isToggle, onPress, color = COLOR_PRIMARY }) => (
    <TouchableOpacity 
        style={styles.settingRow} 
        activeOpacity={isToggle ? 1 : 0.7} 
        onPress={onPress}
    >
        <View style={[styles.iconBg, { backgroundColor: `${color}15` }]}>
            <Icon name={icon} size={16} color={color} />
        </View>
        <Text style={styles.settingTitle}>{title}</Text>
        
        {isToggle ? (
            <Switch 
                value={value} 
                onValueChange={onValueChange} 
                trackColor={{ false: '#334155', true: COLOR_PRIMARY }}
                thumbColor={'#fff'}
            />
        ) : (
            <Icon name="chevron-right" size={14} color="#64748b" />
        )}
    </TouchableOpacity>
);

export default function SettingsScreen({ navigation }) {
    const { logout, deleteAccount, user } = useAppStore();
    
    // Τοπικά states - μελλοντικά τα συνδέεις με το AsyncStorage αν θες να σώζονται
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [hapticsEnabled, setHapticsEnabled] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);

    // 👉 Η νέα λογική για το Toggle των ειδοποιήσεων
    const handleNotificationToggle = async (newValue) => {
        if (newValue === true) {
            const { status } = await Notifications.getPermissionsAsync();
            
            if (status !== 'granted') {
                CustomAlert.alert(
                    "Απαιτείται Άδεια",
                    "Έχετε απενεργοποιήσει τις ειδοποιήσεις για το 20_E. Θέλετε να μεταβείτε στις ρυθμίσεις της συσκευής σας για να τις ενεργοποιήσετε;",
                    [
                        { text: "Άκυρο", style: "cancel" },
                        { 
                            text: "Ρυθμίσεις", 
                            onPress: () => {
                                if (Platform.OS === 'ios') {
                                    Linking.openURL('app-settings:');
                                } else {
                                    Linking.openSettings();
                                }
                            }
                        }
                    ]
                );
                return; // Σταματάμε εδώ αν δεν έχει άδεια
            }
        }
        
        // Αν έχει άδεια (ή αν απλά το κλείνει), ενημερώνουμε το state
        setNotificationsEnabled(newValue);
    };

    const handleDeleteAccount = () => {
        CustomAlert.alert(
            "Διαγραφή Λογαριασμού",
            "Είσαι σίγουρος; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί και θα χάσεις όλο το XP σου.",
            [
                { text: "Ακύρωση", style: "cancel" },
                { text: "Διαγραφή", style: "destructive", onPress: deleteAccount }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Icon name="arrow-left" size={20} color="#f1f5f9" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Ρυθμίσεις</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                <Text style={styles.sectionTitle}>ΕΜΠΕΙΡΙΑ ΧΡΗΣΤΗ</Text>
                <View style={styles.sectionCard}>
                    <SettingRow icon="volume-up" title="Ηχητικά Εφέ" isToggle value={soundEnabled} onValueChange={setSoundEnabled} />
                    <View style={styles.divider} />
                    <SettingRow icon="mobile-alt" title="Δόνηση (Haptics)" isToggle value={hapticsEnabled} onValueChange={setHapticsEnabled} />
                    <View style={styles.divider} />
                    {/* Συνδέσαμε το νέο handler εδώ */}
                    <SettingRow icon="bell" title="Ειδοποιήσεις" isToggle value={notificationsEnabled} onValueChange={handleNotificationToggle} />
                </View>

                <Text style={styles.sectionTitle}>ΛΟΓΑΡΙΑΣΜΟΣ</Text>
                <View style={styles.sectionCard}>
                    <SettingRow icon="envelope" title="Email Λογαριασμού" onPress={() => navigation.navigate('ChangeEmailScreen')} />
                    <View style={styles.divider} />
                    <SettingRow icon="key" title="Αλλαγή Κωδικού" onPress={() => navigation.navigate('ChangePasswordScreen')} />
                    <View style={styles.divider} />
                    <SettingRow icon="file-contract" title="Όροι Χρήσης" onPress={() => navigation.navigate('TermsScreen')} />
                </View>

                {/* DANGER ZONE */}
                <TouchableOpacity style={styles.logoutButton} onPress={logout}>
                    <LinearGradient colors={['#ef4444', '#b91c1c']} style={styles.logoutGradient}>
                        <Icon name="power-off" size={16} color="#fff" />
                        <Text style={styles.logoutText}>ΑΠΟΣΥΝΔΕΣΗ</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
                    <Text style={styles.deleteAccountText}>Οριστική Διαγραφή Λογαριασμού</Text>
                </TouchableOpacity>

                <Text style={styles.versionText}>Έκδοση 1.0.0 (Beta)</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLOR_BG },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    backBtn: { padding: 10, marginLeft: -10 },
    headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold' },
    scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 50 },
    sectionTitle: { color: '#64748b', fontSize: 12, fontWeight: 'bold', marginBottom: 10, marginLeft: 15, marginTop: 15 },
    sectionCard: { backgroundColor: COLOR_CARD, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    iconBg: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    settingTitle: { flex: 1, color: '#f1f5f9', fontSize: 15, marginLeft: 15 },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 60 },
    logoutButton: { borderRadius: 16, overflow: 'hidden', marginTop: 40 },
    logoutGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
    logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
    deleteAccountBtn: { marginTop: 25, paddingVertical: 10, alignItems: 'center' },
    deleteAccountText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
    versionText: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 40 }
});