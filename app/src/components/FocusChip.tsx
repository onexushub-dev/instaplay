import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = {
  state: 'preparing' | 'on' | 'off';
  onToggle: () => void;
};

/** Modo Foco on/off over the video: lime and checked when the picture follows the play. */
export function FocusChip({ state, onToggle }: Props) {
  const on = state === 'on';
  const preparing = state === 'preparing';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Modo Foco"
      accessibilityState={{ checked: on, disabled: preparing }}
      disabled={preparing}
      onPress={onToggle}
      hitSlop={8}
      style={[styles.chip, on ? styles.on : styles.off]}>
      {preparing ? (
        <ActivityIndicator size="small" color={colors.soft} />
      ) : (
        <View style={[styles.dot, on ? styles.dotOn : styles.dotOff]} />
      )}
      <Text style={[styles.text, on ? styles.textOn : styles.textOff]}>
        {preparing ? 'Modo Foco · preparando' : 'Modo Foco'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  on: { backgroundColor: colors.accent, borderColor: colors.accent },
  off: { backgroundColor: 'rgba(15,16,13,0.72)', borderColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: colors.onAccent },
  dotOff: { backgroundColor: colors.muted },
  text: { fontFamily: fonts.bodyBold, fontSize: 13 },
  textOn: { color: colors.onAccent },
  textOff: { color: colors.text },
});
