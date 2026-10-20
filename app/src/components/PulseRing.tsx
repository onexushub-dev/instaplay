import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReduceMotion } from './useReduceMotion';

type Props = { color: string; size?: number };

/** A ring that breathes outward: "I am working on it". Still (no motion) when the player asked for less motion. */
export function PulseRing({ color, size = 96 }: Props) {
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduce) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size * 1.7, height: size * 1.7, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, borderColor: color, opacity, transform: [{ scale }] },
        ]}
      />
      <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 4 },
});
