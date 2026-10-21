import { type ReactNode, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

/** How far the row slides to show the button. */
const OPEN = 96;

/** Where a drag that ended at `x` (0 closed, -OPEN open) settles: open once it passed half way. */
export function settlesOpen(x: number): boolean {
  return x < -OPEN / 2;
}

type Props = { children: ReactNode; onDelete: () => void; label?: string };

/** A row that slides left to show an "Apagar" button; a tap on the row while it is open only closes it. */
export function SwipeToDelete({ children, onDelete, label = 'Apagar' }: Props) {
  const [x] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const settle = (toOpen: boolean) => {
    openRef.current = toOpen;
    setOpen(toOpen);
    Animated.timing(x, { toValue: toOpen ? -OPEN : 0, duration: 160, useNativeDriver: false }).start();
  };

  // eslint-disable-next-line react-hooks/refs -- the ref is only read inside the gesture callbacks, never while rendering
  const [pan] = useState(() =>
    PanResponder.create({
      // Only a clearly horizontal drag: the list still scrolls and the card still takes taps.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -OPEN : 0;
        x.setValue(Math.max(-OPEN * 1.25, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => settle(settlesOpen((openRef.current ? -OPEN : 0) + g.dx)),
      onPanResponderTerminate: () => settle(openRef.current),
    }),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.behind}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={!open}
          onPress={() => {
            settle(false);
            onDelete();
          }}
          style={styles.button}>
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
        {open ? (
          // While open the row does not open the game: a tap just puts it back.
          <Pressable accessibilityLabel="Fechar" onPress={() => settle(false)} style={StyleSheet.absoluteFill} />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden' },
  behind: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: colors.rec,
  },
  button: { width: OPEN, height: '100%', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onAccent },
});
