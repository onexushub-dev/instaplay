import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

/** `lockedBadge`: a paid option the player does not have: this badge ("Pro") beside the label, and `lockedHint` read out after it. */
type Props = { label: string; selected?: boolean; onPress?: () => void; lockedBadge?: string; lockedHint?: string };

export function Chip({ label, selected = false, onPress, lockedBadge, lockedHint }: Props) {
  const spoken = [label, lockedHint].filter((part) => part !== undefined).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.idle]}>
      <Text style={[styles.label, { color: selected ? colors.onAccent : colors.text }]}>{label}</Text>
      {lockedBadge === undefined ? null : <Text style={styles.badge}>{lockedBadge}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 44, paddingHorizontal: 14, borderRadius: radius.chip, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  selected: { backgroundColor: colors.accent },
  idle: { borderWidth: 1, borderColor: colors.border },
  label: { fontFamily: fonts.bodySemi, fontSize: 14 },
  badge: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.accent },
});
