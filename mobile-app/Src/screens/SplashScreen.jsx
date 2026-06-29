import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

const SplashScreen = ({ isAppReady, onFinish }) => {
    const pulseAnim = useRef(new Animated.Value(0.3)).current;
    const progressAnim = useRef(new Animated.Value(0)).current;
    const fadeOutAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // 1. Pulsing animation for the logo
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1500,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.3,
                    duration: 1500,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
            ])
        );
        pulse.start();

        // 2. Custom Progress Bar loading over ~4 seconds
        Animated.timing(progressAnim, {
            toValue: 100,
            duration: 4000,
            useNativeDriver: false, // Cannot use native driver when animating width
            easing: Easing.out(Easing.cubic),
        }).start();

        return () => pulse.stop();
    }, [pulseAnim, progressAnim]);

    useEffect(() => {
        // 3. Fade out the splash screen when app is ready
        if (isAppReady) {
            Animated.timing(fadeOutAnim, {
                toValue: 0,
                duration: 600,
                delay: 200, // tiny delay for visual smoothness
                useNativeDriver: true,
            }).start(() => {
                if (onFinish) {
                    onFinish();
                }
            });
        }
    }, [isAppReady, fadeOutAnim, onFinish]);

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
    });

    return (
        <Animated.View style={[styles.container, { opacity: fadeOutAnim }]}>
            {/* Center Logo Section */}
            <View style={styles.centerContainer}>
                <Animated.View style={{ opacity: pulseAnim }}>
                    <Text style={styles.logoText}>
                        <Text style={styles.logoWhite}>20</Text>
                        <Text style={styles.logoGreen}>_E</Text>
                    </Text>
                </Animated.View>
            </View>

            {/* Bottom Progress Bar & Text Section */}
            <View style={styles.bottomContainer}>
                <View style={styles.progressBarWrapper}>
                    <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
                </View>
                <Text style={styles.loadingText}>Φορτώνουμε τον κόσμο του ΑΟΘ...</Text>
                <Text style={styles.footerText}>v1.0 by Pythonistas</Text>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0f172a',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        elevation: 9999, // ensures it overlays everything on Android
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoText: {
        fontSize: 72,
        fontWeight: 'bold',
        letterSpacing: 2,
    },
    logoWhite: {
        color: '#f1f5f9',
    },
    logoGreen: {
        color: '#10b981',
        textShadowColor: 'rgba(16, 185, 129, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
    },
    bottomContainer: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingBottom: 40,
    },
    progressBarWrapper: {
        width: '100%',
        height: 2,
        backgroundColor: '#1e293b',
        borderRadius: 1,
        overflow: 'hidden',
        marginBottom: 16,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#10b981',
    },
    loadingText: {
        color: '#38bdf8', // Sky Blue
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 20,
    },
    footerText: {
        color: '#475569',
        fontSize: 12,
        position: 'absolute',
        bottom: 15,
    },
});

export default SplashScreen;
