import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthWrapper from './Src/navigation/AuthWrapper';
import { CustomAlertModal } from './Src/components/CustomAlert';

export default function App() {
    return (
        <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
            <AuthWrapper />
            <CustomAlertModal />
        </SafeAreaProvider>
    );
}