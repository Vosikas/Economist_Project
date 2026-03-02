import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import authService from '../services/authService';

export default function SignupScreen({ navigateToLogin }) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSignup = async () => {
        try {
            await authService.signup(username, email, password);
            Alert.alert('Επιτυχία!', 'Ο λογαριασμός δημιουργήθηκε. Μπορείς να συνδεθείς.');
            navigateToLogin(); // Τον στέλνουμε πίσω στο Login
        } catch (error) {
            Alert.alert('Σφάλμα', error.message);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Δημιουργία Λογαριασμού</Text>
            
            <TextInput style={styles.input} placeholder="Όνομα Χρήστη" value={username} onChangeText={setUsername} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Κωδικός" value={password} onChangeText={setPassword} secureTextEntry />
            
            <TouchableOpacity style={styles.button} onPress={handleSignup}>
                <Text style={styles.buttonText}>Εγγραφή</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={navigateToLogin}>
                <Text style={styles.linkText}>Έχεις ήδη λογαριασμό; Σύνδεση</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#333' },
    input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
    button: { backgroundColor: '#28a745', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    linkText: { color: '#28a745', textAlign: 'center', marginTop: 10 }
});