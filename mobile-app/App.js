import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import tokenStorage from './Src/services/tokenstorage';
import LoginScreen from './Src/screens/loginScreen';
import SignupScreen from './Src/screens/signupScreen';
import HomeScreen from './Src/screens/HomeScreen';

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [userToken, setUserToken] = useState(null);
    const [currentScreen, setCurrentScreen] = useState('Login');

    useEffect(() => {
        const checkToken = async () => {
            const token = await tokenStorage.getToken();
            if (token) {
                setUserToken(token);
                setCurrentScreen('Home');
            }
            setIsLoading(false);
        };
        checkToken();
    }, []);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        );
    }

    if (currentScreen === 'Home') {
        return <HomeScreen onLogout={() => { setUserToken(null); setCurrentScreen('Login'); }} />;
    }

    if (currentScreen === 'Signup') {
        return <SignupScreen navigateToLogin={() => setCurrentScreen('Login')} />;
    }

    return (
        <LoginScreen 
            onLoginSuccess={() => setCurrentScreen('Home')} 
            navigateToSignup={() => setCurrentScreen('Signup')} 
        />
    );
}