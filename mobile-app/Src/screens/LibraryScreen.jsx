import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 as Icon } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Animated, {
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    Easing
} from 'react-native-reanimated';

// ─── Floating Card Component ─────────────────────────────────────────────────
const HolographicCard = ({ title, subtitle, icon, delay, colors, glowColor, onPress }) => {
    const floatY = useSharedValue(0);

    useEffect(() => {
        const floatDelay = delay + 400; 

        setTimeout(() => {
            floatY.value = withRepeat(
                withSequence(
                    withTiming(-4, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) })
                ),
                -1, 
                true 
            );
        }, floatDelay);
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: floatY.value }]
    }));

    return (
        <Animated.View
            entering={FadeInDown.delay(delay).duration(600).springify()}
            style={styles.cardWrapper}
        >
            <Animated.View style={animatedStyle}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={onPress}
                    style={[
                        styles.card,
                        { borderColor: glowColor, shadowColor: glowColor }
                    ]}
                >
                    {/* Cyberpunk Tech Corner */}
                    <View style={[styles.techCorner, { borderTopColor: glowColor, borderRightColor: glowColor }]} />
                    <View style={[styles.techCornerBottom, { borderBottomColor: glowColor, borderLeftColor: glowColor }]} />

                    <View style={styles.orbContainer}>
                        <LinearGradient
                            colors={colors}
                            style={styles.orbGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Icon name={icon} size={20} color="#ffffff" style={styles.iconGlow} />
                        </LinearGradient>
                        <View style={[styles.orbGlowOverlay, { shadowColor: glowColor }]} />
                    </View>

                    <View style={styles.textContainer}>
                        <Text style={styles.cardTitle}>{title}</Text>
                        <Text style={styles.cardSubtitle}>{subtitle}</Text>
                    </View>

                    <View style={styles.actionContainer}>
                        <Icon name="chevron-right" size={14} color={glowColor} style={[styles.chevron, { textShadowColor: glowColor, textShadowRadius: 10 }]} />
                    </View>
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LibraryScreen() {
    const navigation = useNavigation();

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* ─── Cyberpunk Header ─── */}
            <View style={styles.headerContainer}>
                {/* Terminal Access Badge */}
                <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.terminalBadge}>
                    <View style={styles.terminalDot} />
                    <Text style={styles.terminalText}>SYS.ACCESS // GRANTED</Text>
                </Animated.View>

                <Animated.Text entering={FadeInDown.delay(200).duration(500)} style={styles.headerTitle}>
                    ΒΙΒΛΙΟΘΗΚΗ
                </Animated.Text>
                
                <Animated.Text entering={FadeInDown.delay(300).duration(500)} style={styles.headerSubtitle}>
                    Επιλέξτε τομέα δεδομένων για αποκρυπτογράφηση
                </Animated.Text>

                {/* Cyber Circuit Divider */}
                <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.circuitDivider}>
                    <LinearGradient
                        colors={['transparent', '#06b6d4', '#06b6d4', 'transparent']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.circuitLine}
                    />
                    <View style={styles.circuitNode} />
                    <View style={[styles.circuitNode, { opacity: 0.5, transform: [{ scale: 0.7 }] }]} />
                </Animated.View>
            </View>

            {/* ─── Cards List ─── */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <HolographicCard
                    title="Αρχείο Τύπων"
                    subtitle="Όλα τα εργαλεία, τα σύμβολα και οι τύποι του ΑΟΘ, έτοιμα για άμεση χρήση."
                    icon="calculator"
                    delay={400}
                    colors={['rgba(14, 165, 233, 0.2)', 'rgba(2, 132, 199, 0.8)']} // Deep Cyans
                    glowColor="#0ea5e9" 
                    onPress={() => navigation.navigate('Symbols')}
                />

                <HolographicCard
                    title="Πυρήνας Θεωρίας"
                    subtitle="Συμπυκνωμένα δεδομένα και SOS σημεία για ταχύτατη σάρωση και απομνημόνευση."
                    icon="brain"
                    delay={500}
                    colors={['rgba(16, 185, 129, 0.2)', 'rgba(5, 150, 105, 0.8)']} // Emerald Greens
                    glowColor="#10b981" 
                    onPress={() => navigation.navigate('Theory')}
                />

                <HolographicCard
                    title="Ανάλυση Σφαλμάτων"
                    subtitle="Το προσωπικό σου αρχείο. Εντόπισε, μελέτησε και εξόντωσε τις αδυναμίες σου."
                    icon="crosshairs"
                    delay={600}
                    colors={['rgba(245, 158, 11, 0.2)', 'rgba(217, 119, 6, 0.8)']} // Amber/Warning
                    glowColor="#f59e0b"
                    onPress={() => navigation.navigate('NotebookScreen')}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#0f172a' },
    
    // Header
    headerContainer: { alignItems: 'center', paddingTop: 20, paddingBottom: 20, paddingHorizontal: 20 },
    terminalBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(6, 182, 212, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(6, 182, 212, 0.3)', marginBottom: 12 },
    terminalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#06b6d4', marginRight: 8, shadowColor: '#06b6d4', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4 },
    terminalText: { color: '#06b6d4', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }) },
    headerTitle: {
        color: '#f1f5f9', fontSize: 36, fontWeight: '900', letterSpacing: 4,
        textShadowColor: 'rgba(6, 182, 212, 0.6)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
        fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }), marginBottom: 8
    },
    headerSubtitle: { color: '#94a3b8', fontSize: 13, textAlign: 'center', letterSpacing: 0.5, marginBottom: 15 },
    
    // Circuit Divider
    circuitDivider: { flexDirection: 'row', alignItems: 'center', width: '80%', height: 10 },
    circuitLine: { flex: 1, height: 1, opacity: 0.7 },
    circuitNode: { width: 4, height: 4, backgroundColor: '#06b6d4', marginLeft: 4, transform: [{ rotate: '45deg' }] },

    // Content
    scrollContent: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 120 },
    cardWrapper: { marginBottom: 28 }, // Αύξησα το κενό ανάμεσα στις κάρτες (από 24 σε 28)
    
    // Card
    card: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b',
        borderRadius: 16, padding: 22, borderWidth: 1,
        elevation: 15, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 15,
    },
    techCorner: {
        position: 'absolute', top: -1, right: -1, width: 25, height: 25,
        borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 16, opacity: 1,
    },
    techCornerBottom: {
        position: 'absolute', bottom: -1, left: -1, width: 15, height: 15,
        borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 16, opacity: 0.5,
    },
    orbContainer: { width: 56, height: 56, marginRight: 20, justifyContent: 'center', alignItems: 'center' },
    orbGradient: {
        width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', transform: [{ rotate: '10deg' }]
    },
    orbGlowOverlay: {
        ...StyleSheet.absoluteFillObject, borderRadius: 14, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8, shadowRadius: 15, elevation: 10, backgroundColor: 'transparent',
    },
    iconGlow: { transform: [{ rotate: '-10deg' }] }, // Επαναφέρει το εικονίδιο ίσια παρόλο που το κουτί γυρίζει
    textContainer: { flex: 1, justifyContent: 'center', paddingRight: 10 },
    cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
    cardSubtitle: { color: '#94a3b8', fontSize: 13, lineHeight: 20 },
    actionContainer: { width: 24, alignItems: 'flex-end' },
    chevron: { opacity: 0.9 }
});