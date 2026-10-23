import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

type Props = { color: string; size?: number };

/**
 * "I am working on it": a ring that breathes outward around a dot. With Reduce Motion on, nothing grows or moves; the
 * dot fades in and out instead, so the screen still shows it is waiting.
 *
 * Reanimated runs it on the UI thread. The old `Animated` loop stood still on the phones (camera, Bluetooth and the Wi-Fi
 * preview keep them busy) and only moved in the simulator.
 */
export function PulseRing({ color, size = 96 }: Props) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.set(0);
    // Both the timing and the repeat ignore the system setting (`ReduceMotion.Never`): on `System`, with Reduce Motion
    // on, Reanimated plays the repeat once and stops, which is what the phones did. Reduce Motion is handled by the
    // styles below instead (they only fade, nothing grows).
    pulse.set(
      withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const ring = useAnimatedStyle(() => {
    const t = pulse.get();
    if (reduce) return { opacity: 0, transform: [{ scale: 1 }] };
    return { opacity: 0.7 * (1 - t), transform: [{ scale: 1 + 0.7 * t }] };
  });
  const dot = useAnimatedStyle(() => {
    const t = pulse.get();
    return { opacity: reduce ? 0.35 + 0.65 * Math.abs(1 - 2 * t) : 1 };
  });

  return (
    <View
      testID="pulse-ring"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { width: size * 1.7, height: size * 1.7 }]}>
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: color }, ring]} />
      <Animated.View
        style={[{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: color }, dot]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 4 },
});
