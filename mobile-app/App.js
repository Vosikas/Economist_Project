import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';

// Service για το Token
import tokenStorage from './Src/services/tokenstorage';

// Gamified Screens (Προσοχή: Τα ονόματα των αρχείων πρέπει να ταιριάζουν ακριβώς!)
import GamifiedLoginScreen from './Src/screens/loginScreen';
import GamifiedSignupScreen from './Src/screens/signupScreen';
import GamifiedHomeScreen from './Src/screens/HomeScreen';
import GamifiedForgotPasswordScreen from './Src/screens/forgotPasswordScreen';
import GamifiedResetPasswordScreen from './Src/screens/resetPasswordScreen';

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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
                <ActivityIndicator size="large" color="#06b6d4" />
            </View>
        );
    }

    // Το κεντρικό μας routing system
    let ScreenComponent;

    switch (currentScreen) {
        case 'Home':
            ScreenComponent = (
                <GamifiedHomeScreen 
                    username="Παίκτη" // Στο μέλλον μπορούμε να το τραβάμε από το Token
                    onLogout={async () => { 
                        await tokenStorage.removeToken(); // Καλό είναι να καθαρίζουμε και τη μνήμη!
                        setUserToken(null); 
                        setCurrentScreen('Login'); 
                    }} 
                />
            );
            break;
        case 'Signup':
            ScreenComponent = (
                <GamifiedSignupScreen 
                    navigateToLogin={() => setCurrentScreen('Login')} 
                />
            );
            break;
        case 'ForgotPassword':
            ScreenComponent = (
                <GamifiedForgotPasswordScreen 
                    navigateToLogin={() => setCurrentScreen('Login')} 
                    navigateToReset={() => setCurrentScreen('ResetPassword')} 
                />
            );
            break;
        case 'ResetPassword':
            ScreenComponent = (
                <GamifiedResetPasswordScreen 
                    navigateToLogin={() => setCurrentScreen('Login')} 
                />
            );
            break;
        case 'Login':
        default:
            ScreenComponent = (
                <GamifiedLoginScreen 
                    onLoginSuccess={() => setCurrentScreen('Home')} 
                    navigateToSignup={() => setCurrentScreen('Signup')} 
                    navigateToForgot={() => setCurrentScreen('ForgotPassword')} 
                />
            );
            break;
    }

    return (
        <>
            {/* Κάνουμε τη μπάρα του κινητού (ώρα, μπαταρία) να ταιριάζει με το σκοτεινό θέμα */}
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
            {ScreenComponent}
        </>
    );
}