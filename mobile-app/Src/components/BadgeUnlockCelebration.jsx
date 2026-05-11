import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  ZoomIn,
  FadeInDown,
  FadeIn,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { FontAwesome5 as Icon } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const TIER_COLORS = {
  gold: '#fbbf24',
  silver: '#94a3b8',
  bronze: '#f59e0b',
};

// Confetti palette — tier-agnostic, always festive
const CONFETTI_COLORS = ['#fbbf24', '#8b5cf6', '#10b981', '#ef4444', '#60a5fa', '#f472b6'];

// ─── Confetti dot ─────────────────────────────────────────────────────────────
function ConfettiDot({ color, delay, startX }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  // Size is stable per instance (computed once, not on every render)
  const size = 5 + Math.floor(Math.random() * 7);
  const drift = (Math.random() - 0.5) * 100;

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 150 }));

    translateY.value = withDelay(
      delay,
      withTiming(height * 0.65, {
        duration: 2000 + Math.random() * 1000,
        easing: Easing.out(Easing.quad),
      })
    );

    translateX.value = withDelay(
      delay,
      withTiming(drift, {
        duration: 2200,
        easing: Easing.inOut(Easing.sin),
      })
    );

    rotate.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, { duration: 700 + Math.random() * 400, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [delay]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.confettiDot,
        style,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, left: startX },
      ]}
    />
  );
}

// ─── Burst particle ───────────────────────────────────────────────────────────
function BurstParticle({ color, angle, delay }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, { damping: 13, stiffness: 75 }));
  }, [delay]);

  const RADIUS = 140;
  const rad = (angle * Math.PI) / 180;
  const targetX = Math.cos(rad) * RADIUS;
  const targetY = Math.sin(rad) * RADIUS;

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [0, targetX]) },
      { translateY: interpolate(progress.value, [0, 1], [0, targetY]) },
      { scale: interpolate(progress.value, [0, 0.5, 1], [0, 1.4, 0.7]) },
    ],
    opacity: interpolate(progress.value, [0, 0.25, 1], [0, 1, 0]),
  }));

  return (
    <Animated.View style={[styles.burstParticle, { backgroundColor: color }, style]} />
  );
}

// ─── Rotating shimmer ring ────────────────────────────────────────────────────
function ShimmerRing({ color }) {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 7000, easing: Easing.linear }),
      -1,
      false
    );
    scale.value = withRepeat(
      withSequence(
        withTiming(1.07, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const rotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.shimmerRingWrapper, scaleStyle]}>
      <Animated.View style={[styles.shimmerRing, rotateStyle]}>
        {/* 8 dots orbiting the ring */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * 2 * Math.PI;
          const R = 115; // orbit radius
          const x = Math.cos(angle) * R;
          const y = Math.sin(angle) * R;
          return (
            <View
              key={i}
              style={[
                styles.orbitDot,
                {
                  backgroundColor: color,
                  opacity: i % 2 === 0 ? 0.9 : 0.4,
                  transform: [{ translateX: x }, { translateY: y }],
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

// ─── Medal disc with heartbeat ────────────────────────────────────────────────
function MedalDisc({ color, icon, delay }) {
  const scale = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);
  const iconRotate = useSharedValue(-8);

  useEffect(() => {
    // Pop in with spring overshoot
    scale.value = withDelay(delay, withSpring(1, { damping: 9, stiffness: 95 }));

    // Heartbeat glow
    glowOpacity.value = withDelay(
      delay + 400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.25, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    );

    // Subtle icon rock on entry
    iconRotate.value = withDelay(
      delay,
      withSequence(
        withTiming(8, { duration: 200 }),
        withTiming(-5, { duration: 150 }),
        withTiming(3, { duration: 120 }),
        withTiming(0, { duration: 100 })
      )
    );
  }, [delay]);

  const discStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotate.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.medalDisc, { borderColor: color }, discStyle]}>
      {/* Pulsing inner glow */}
      <Animated.View
        style={[
          styles.medalGlow,
          { backgroundColor: color },
          glowStyle,
        ]}
      />
      {/* Dashed inner ring */}
      <View style={[styles.innerRing, { borderColor: `${color}60` }]}>
        <Animated.View style={iconStyle}>
          <Icon name={icon || 'award'} size={76} color={color} solid />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ─── Ambient background glow ──────────────────────────────────────────────────
function AmbientGlow({ color }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 600 });
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.ambientGlow,
        { backgroundColor: color },
        style,
      ]}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BadgeUnlockCelebration({ visible, badges, badge, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const badgeList = badges && badges.length > 0 ? badges : badge ? [badge] : [];
  const currentBadge = badgeList[currentIndex];

  // Reset index when modal opens
  useEffect(() => {
    if (visible) setCurrentIndex(0);
  }, [visible]);

  const handleNext = () => {
    if (currentIndex < badgeList.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  if (!visible || !currentBadge) return null;

  const badgeColor = TIER_COLORS[currentBadge.tier?.toLowerCase()] ?? TIER_COLORS.gold;
  const isLastBadge = currentIndex === badgeList.length - 1;

  // Stable confetti data — computed once per render, not inside child components
  const confettiItems = Array.from({ length: 18 }).map((_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: i * 80,
    startX: (width / 18) * i,
  }));

  // Burst particles — evenly spread 360°
  const burstItems = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    angle: (360 / 12) * i,
    delay: 200 + i * 30,
  }));

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleNext}
    >
      <View style={styles.fullscreen}>

        {/* Dark backdrop */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.backdrop} />

        {/* Ambient glow behind disc */}
        <AmbientGlow color={badgeColor} />

        {/* Confetti rain — positioned at top of screen */}
        <View style={styles.confettiContainer} pointerEvents="none">
          {confettiItems.map((item) => (
            <ConfettiDot
              key={`${currentIndex}-conf-${item.id}`}
              color={item.color}
              delay={item.delay}
              startX={item.startX}
            />
          ))}
        </View>

        {/* Main content — key forces full remount & re-animation on badge change */}
        <Animated.View key={`badge-${currentIndex}`} style={styles.contentWrapper}>

          {/* ── Header ── */}
          <Animated.View
            entering={FadeInDown.delay(80).springify().damping(16)}
            style={styles.header}
          >
            <Text style={[styles.superTitle, { color: badgeColor }]}>ΝΕΟ ΕΠΙΤΕΥΓΜΑ</Text>
            {badgeList.length > 1 && (
              <View style={styles.pillCounter}>
                <Text style={styles.counterText}>
                  {currentIndex + 1} / {badgeList.length}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* ── Centre stage ── */}
          <View style={styles.centerStage}>
            {/* Rotating orbit ring */}
            <ShimmerRing color={badgeColor} />

            {/* Burst particles */}
            <View style={styles.burstContainer} pointerEvents="none">
              {burstItems.map((item) => (
                <BurstParticle
                  key={`${currentIndex}-burst-${item.id}`}
                  color={badgeColor}
                  angle={item.angle}
                  delay={item.delay}
                />
              ))}
            </View>

            {/* Medal */}
            <MedalDisc color={badgeColor} icon={currentBadge.icon} delay={150} />
          </View>

          {/* ── Text block ── */}
          <Animated.View
            entering={FadeInDown.delay(450).springify().damping(18)}
            style={styles.textBlock}
          >
            {/* Tier pill */}
            <View style={[styles.tierPill, { backgroundColor: `${badgeColor}22`, borderColor: `${badgeColor}55` }]}>
              <Icon name="shield-alt" size={11} color={badgeColor} solid />
              <Text style={[styles.tierPillText, { color: badgeColor }]}>
                {currentBadge.tier?.toUpperCase() ?? 'BADGE'}
              </Text>
            </View>

            <Text style={styles.badgeName}>{currentBadge.name}</Text>
            <Text style={styles.badgeDescription}>{currentBadge.description}</Text>
          </Animated.View>

          {/* ── Action button ── */}
          <Animated.View
            entering={FadeInDown.delay(650).springify().damping(18)}
            style={styles.footer}
          >
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: badgeColor }]}
              onPress={handleNext}
              activeOpacity={0.82}
            >
              <Text style={styles.actionButtonText}>
                {isLastBadge ? '🎉  ΤΕΛΕΙΑ!' : 'ΕΠΟΜΕΝΟ  →'}
              </Text>
            </TouchableOpacity>

            {/* Subtle skip link when multiple badges */}
            {!isLastBadge && (
              <TouchableOpacity onPress={onClose} style={styles.skipButton}>
                <Text style={styles.skipText}>Παράλειψη</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617',
    opacity: 0.96,
  },

  // Soft radial glow behind the medal — no extreme shadow values (Android safe)
  ambientGlow: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    opacity: 0.09,
    top: height / 2 - (width * 1.2) / 2,
    left: width / 2 - (width * 1.2) / 2,
  },

  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },

  confettiDot: {
    position: 'absolute',
    top: 0,
  },

  contentWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: height * 0.09,
    paddingHorizontal: 24,
    zIndex: 10,
  },

  // Header
  header: {
    alignItems: 'center',
    gap: 10,
  },
  superTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  pillCounter: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  counterText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Centre stage
  centerStage: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 280,
    height: 280,
  },

  // Shimmer ring
  shimmerRingWrapper: {
    position: 'absolute',
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shimmerRing: {
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbitDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },

  // Burst
  burstContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  burstParticle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Medal disc
  medalDisc: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020617',
    // Conservative shadow — works on both platforms
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  medalGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  innerRing: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Text block
  textBlock: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  tierPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  badgeName: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeDescription: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Footer
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  actionButton: {
    width: '88%',
    paddingVertical: 18,
    borderRadius: 50,
    alignItems: 'center',
    // Subtle lift shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonText: {
    color: '#020617',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  skipText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
