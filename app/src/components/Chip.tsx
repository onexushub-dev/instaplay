import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

type Props = { label: string; selected?: boolean; onPress?: () => void };

export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.idle]}>
      <Text style={[styles.label, { color: selected ? colors.onAccent : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 44, paddingHorizontal: 14, borderRadius: radius.chip, justifyContent: 'center' },
  selected: { backgroundColor: colors.accent },
  idle: { borderWidth: 1, borderColor: colors.border },
  label: { fontFamily: fonts.bodySemi, fontSize: 14 },
});
