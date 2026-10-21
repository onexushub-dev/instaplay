import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = { text: string; tone: 'on' | 'idle' };

/** A dot and a short status: accent when the device is connected, grey otherwise. */
export function StatusPill({ text, tone }: Props) {
  return (
    <View accessible accessibilityLabel={text} style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: tone === 'on' ? colors.accent : colors.muted }]} />
      <Text style={[styles.text, tone === 'on' && { color: colors.accent }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
});
