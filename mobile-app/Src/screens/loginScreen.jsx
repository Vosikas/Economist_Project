import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import authService from '../services/authService';

export default function LoginScreen({ onLoginSuccess, navigateToSignup }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async () => {
        try {
            // Στέλνουμε username και password όπως τα περιμένει το API
            await authService.login(username, password);
            onLoginSuccess();
        } catch (error) {
            Alert.alert('Σφάλμα Σύνδεσης', 'Λάθος όνομα χρήστη ή κωδικός');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Σύνδεση</Text>
            
            <TextInput 
                style={styles.input} 
                placeholder="Όνομα Χρήστη / Email" 
                value={username} 
                onChangeText={setUsername} 
                autoCapitalize="none" 
            />
            
            <TextInput 
                style={styles.input} 
                placeholder="Κωδικός" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry 
            />
            
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
                <Text style={styles.buttonText}>Είσοδος</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={navigateToSignup}>
                <Text style={styles.linkText}>Δεν έχεις λογαριασμό; Εγγραφή</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#333' },
    input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
    button: { backgroundColor: '#007bff', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    linkText: { color: '#007bff', textAlign: 'center', marginTop: 10 }
});