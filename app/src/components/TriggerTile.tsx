import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = {
  icon: ReactNode;
  title: string;
  status: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

/** One way of saving a lance, with its live status (setup screen). */
export function TriggerTile({ icon, title, status, active = false, disabled = false, onPress }: Props) {
  const body = (
    <>
      {icon}
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.status, active && { color: colors.accent }]}>{status}</Text>
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.tile, disabled && styles.disabled]} accessible accessibilityLabel={`${title}, ${status}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${status}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tile, disabled && styles.disabled]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.5 },
  text: { flex: 1 },
  title: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
