import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import authService from '../services/authService';

export default function HomeScreen({ onLogout }) {
    const handleLogout = async () => {
        await authService.logout();
        onLogout(); // Ενημερώνουμε το App.js
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Καλωσήρθες στο παιχνίδι! 🎮</Text>
            
            <View style={styles.card}>
                <Text style={styles.statsText}>Level 1: Πρωτάρης Οικονομολόγος</Text>
                <Text style={styles.statsText}>XP: 0</Text>
            </View>

            <Text style={styles.subtitle}>Έτοιμος να ξεκλειδώσεις το πρώτο Κεφάλαιο ΑΟΘ;</Text>

            <TouchableOpacity style={styles.button} onPress={handleLogout}>
                <Text style={styles.buttonText}>Αποσύνδεση</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 40, textAlign: 'center' },
    card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, width: '100%', marginBottom: 30, elevation: 3 },
    statsText: { fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#333' },
    button: { backgroundColor: '#dc3545', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});