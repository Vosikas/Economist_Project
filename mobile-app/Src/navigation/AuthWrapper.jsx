import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

import useAppStore from '../store/useAppStore';
import tokenStorage from '../services/tokenstorage';

// 👉 ΝΕΟ: Κάνουμε import το Notification Service
import { registerForPushNotificationsAsync } from '../services/notificationServices';

// 👉 RevenueCat: imported here so the SDK is linked to the authenticated user
import { logInRevenueCat } from '../services/revenueCat';

import GamifiedLoginScreen from '../screens/loginScreen';
import GamifiedSignupScreen from '../screens/signupScreen';
import GamifiedHomeScreen from '../screens/HomeScreen';
import GamifiedForgotPasswordScreen from '../screens/forgotPasswordScreen';
import GamifiedResetPasswordScreen from '../screens/resetPasswordScreen';
import SplashScreen from '../screens/SplashScreen';
import LevelsScreen from '../screens/LevelsScreen';
import QuizScreen from '../screens/QuizScreen';
import LibraryScreen from '../screens/LibraryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SymbolsScreen from '../screens/SymbolsScreen';
import TheoryScreen from '../screens/TheoryScreen';
import NotebookScreen from '../screens/NotebookScreen';
import RedemptionQuizScreen from '../screens/RedemptionQuizScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LevelSummaryScreen from '../screens/LevelSummary';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import BadgesScreen from '../screens/BadgesScreen';
import RedemptionSummaryScreen from '../screens/RedemptionSummaryScreen';
import TermsScreen from '../screens/TermsScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import ChangeEmailScreen from '../screens/ChangeEmailScreen';
import DailyQuizScreen from '../screens/DailyQuizScreen';
import AITutorScreen from '../screens/AITutorScreen';
import PremiumPaywallScreen from '../screens/PremiumPaywallScreen'; // Η οθόνη αγοράς premium
import AITutorMenuScreen from '../screens/AITutorMenuScreen'; // Η κύρια οθόνη του AI Tutor για premium χρήστες
import { CustomAlert } from '../components/CustomAlert';


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

const LoginStack = () => {
    const { fetchDashboardData } = useAppStore();

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login">
                {({ navigation }) => (
                    <GamifiedLoginScreen
                        onLoginSuccess={async (freshToken) => {
                            await fetchDashboardData();
                        }}
                        navigateToSignup={() => navigation.navigate('Signup')}
                        navigateToForgot={() => navigation.navigate('ForgotPassword')}
                    />
                )}
            </Stack.Screen>
            <Stack.Screen name="Signup">
                {({ navigation }) => (
                    <GamifiedSignupScreen navigateToLogin={() => navigation.navigate('Login')} />
                )}
            </Stack.Screen>
            <Stack.Screen name="ForgotPassword">
                {({ navigation }) => (
                    <GamifiedForgotPasswordScreen
                        navigateToLogin={() => navigation.navigate('Login')}
                        navigateToReset={(email) => navigation.navigate('ResetPassword', { email })}
                    />
                )}
            </Stack.Screen>
            <Stack.Screen name="ResetPassword">
                {({ route, navigation }) => (
                    <GamifiedResetPasswordScreen
                        userEmail={route.params?.email || ''}
                        navigateToLogin={() => navigation.navigate('Login')}
                    />
                )}
            </Stack.Screen>
        </Stack.Navigator>
    );
};
const AITutorDynamicScreen = (props) => {
    const isPremium = useAppStore((state) => state.isPremium);
    
    if (isPremium) {
        return <AITutorMenuScreen {...props} />;
    }
    return <PremiumPaywallScreen {...props} />;
};

const DashboardTabs = () => {
    const { logout } = useAppStore();
    const isPremium = useAppStore((state) => state.isPremium);

    return (
        <Tab.Navigator
            initialRouteName="Roadmap"
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: false,
                tabBarItemStyle: { justifyContent: 'center', alignItems: 'center' },
                tabBarStyle: {
                    backgroundColor: 'rgba(30, 41, 59, 0.95)',
                    borderWidth: 1,
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                    borderTopWidth: 0,
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    right: 20,
                    height: 60,
                    borderRadius: 30,
                    elevation: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 5
                },
                tabBarActiveTintColor: '#06b6d4',
                tabBarInactiveTintColor: '#64748b',
            }}
        >
            <Tab.Screen
                name="Roadmap"
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Icon
                            name="map"
                            size={focused ? 26 : 22}
                            color={focused ? '#06b6d4' : '#64748b'}
                            style={focused ? { textShadowColor: 'rgba(6, 182, 212, 0.8)', textShadowRadius: 10 } : null}
                        />
                    ),
                }}
            >
                {() => <GamifiedHomeScreen onLogout={logout} />}
            </Tab.Screen>
            <Tab.Screen
                name="Library"
                component={LibraryScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Icon
                            name="book"
                            size={focused ? 26 : 22}
                            color={focused ? '#06b6d4' : '#64748b'}
                            style={focused ? { textShadowColor: 'rgba(6, 182, 212, 0.8)', textShadowRadius: 10 } : null}
                        />
                    ),
                }}
            />

            <Tab.Screen
                name="Leaderboard"
                component={LeaderboardScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Icon
                            name="trophy"
                            size={focused ? 26 : 22}
                            color={focused ? '#06b6d4' : '#64748b'}
                            style={focused ? { textShadowColor: 'rgba(6, 182, 212, 0.8)', textShadowRadius: 10 } : null}
                        />
                    ),
                }}
            />
            
                  <Tab.Screen 
                name="AI Tutor" 
                // 🔥 ΔΙΟΡΘΩΣΗ: Τώρα δίνουμε το σταθερό Component! Τέρμα το undefined.
                component={AITutorDynamicScreen} 
                options={{
                    tabBarLabel: 'AI Tutor',
                    tabBarIcon: ({ color }) => (
                        <View>
                            <Icon name="robot" size={20} color={color} />
                            {!isPremium && (
                                <Icon 
                                    name="lock" 
                                    size={10} 
                                    color="#f59e0b" 
                                    style={{ position: 'absolute', right: -8, top: -5 }} 
                                />
                            )}
                        </View>
                    )
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <Icon
                            name="user-circle"
                            size={focused ? 26 : 22}
                            solid
                            color={focused ? '#06b6d4' : '#64748b'}
                            style={focused ? { textShadowColor: 'rgba(6, 182, 212, 0.8)', textShadowRadius: 10 } : null}
                        />
                    ),
                }}
            />
 

        </Tab.Navigator>
    );
};

const MainDashboardStack = () => {

    // 👉 ΝΕΟ: Εδώ καλούμε το Push Notification Service ΜΟΝΟ μία φορά ανά session
    useEffect(() => {
        registerForPushNotificationsAsync();
    }, []);

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={DashboardTabs} />
            <Stack.Screen name="Levels" component={LevelsScreen} />
            <Stack.Screen name="Quiz" component={QuizScreen} />
            <Stack.Screen name="Symbols" component={SymbolsScreen} />
            <Stack.Screen name="Theory" component={TheoryScreen} />
            <Stack.Screen name="NotebookScreen" component={NotebookScreen} />
            <Stack.Screen name="RedemptionQuiz" component={RedemptionQuizScreen} />
            <Stack.Screen name='Settings' component={SettingsScreen} />
            <Stack.Screen name='LevelSummary' component={LevelSummaryScreen} />
            <Stack.Screen name='BadgesScreen' component={BadgesScreen} />
            <Stack.Screen name='RedemptionSummary' component={RedemptionSummaryScreen} />
            <Stack.Screen name='TermsScreen' component={TermsScreen} />
            <Stack.Screen name='ChangePasswordScreen' component={ChangePasswordScreen} />
            <Stack.Screen name='ChangeEmailScreen' component={ChangeEmailScreen} /> 
            <Stack.Screen name="DailyQuiz" component={DailyQuizScreen} />
            <Stack.Screen name="AITutor_active" component={AITutorScreen} />
            
        </Stack.Navigator>
    );
};

export default function AuthWrapper() {
    const { appState, sessionExpired, fetchDashboardData, clearSessionExpired } = useAppStore();
    // Reactive selector: re-runs the RC init effect whenever the user object changes.
    // Using a selector (not the full store) prevents unnecessary re-renders.
    const user = useAppStore((state) => state.user);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [splashFinished, setSplashFinished] = useState(false);

    // ── RevenueCat Login ────────────────────────────────────────────
    // Link the RevenueCat SDK instance to the authenticated backend user ID
    useEffect(() => {
        if (!user?.id) return; // Not yet authenticated
        logInRevenueCat(String(user.id)).catch((e) =>
            console.warn('[RC] Login failed:', e)
        );
    }, [user?.id]); // Dep on user.id specifically — avoids re-running on profile updates

    // ── Session initialisation ───────────────────────────────────────────────
    useEffect(() => {
        const initializeSession = async () => {
            try {
                const savedToken = await tokenStorage.getAccessToken();

                if (savedToken) {
                    useAppStore.getState().setToken(savedToken);
                    await fetchDashboardData();
                } else {
                    useAppStore.setState({ appState: 'AUTHENTICATING' });
                }
            } catch (error) {
                console.error("Σφάλμα κατά την εκκίνηση του session:", error);
                useAppStore.setState({ appState: 'AUTHENTICATING' });
            }
        };

        initializeSession();
    }, []);

    useEffect(() => {
        if (sessionExpired) {
            CustomAlert.alert(
                'Η συνεδρία σας έληξε 🔒',
                'Η συνεδρία σας έληξε για λόγους ασφαλείας. Παρακαλώ συνδεθείτε ξανά.',
                [{ text: 'Εντάξει', style: 'default', onPress: clearSessionExpired }]
            );
        }
    }, [sessionExpired]);

    useEffect(() => {
        if (appState === 'READY' || appState === 'AUTHENTICATING') {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start();
        } else {
            fadeAnim.setValue(0);
        }
    }, [appState]);

    const isLoading = appState === 'CHECKING_AUTH' || appState === 'LOADING_DATA';
    const isAppReady = !isLoading;

    return (
        <View style={styles.rootContainer}>
            {isAppReady && (
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
                    <NavigationContainer ref={navigationRef}>
                        {appState === 'READY' ? <MainDashboardStack /> : <LoginStack />}
                    </NavigationContainer>
                </Animated.View>
            )}

            {!splashFinished && (
                <SplashScreen
                    isAppReady={isAppReady}
                    onFinish={() => setSplashFinished(true)}
                />
            )}
        </View>
    );
}
 
const styles = StyleSheet.create({
    rootContainer: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
});