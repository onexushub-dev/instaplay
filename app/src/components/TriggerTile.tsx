import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';
import { LockIcon } from './icons';

type Props = {
  icon: ReactNode;
  title: string;
  /** Optional second line; without it the title carries the whole action and turns accent when active. */
  status?: string;
  active?: boolean;
  disabled?: boolean;
  /** A paid trigger the player does not have: a lock and this badge ("Pro"), and `lockedHint` read out after the status. */
  lockedBadge?: string;
  lockedHint?: string;
  onPress?: () => void;
};

/** One way of saving a lance, with its live status (setup screen). */
export function TriggerTile({ icon, title, status, active = false, disabled = false, lockedBadge, lockedHint, onPress }: Props) {
  const body = (
    <>
      {icon}
      <View style={styles.text}>
        <Text style={[styles.title, status === undefined && active && { color: colors.accent }]}>{title}</Text>
        {status === undefined ? null : (
          <Text style={[styles.status, active && { color: colors.accent }]}>{status}</Text>
        )}
      </View>
      {lockedBadge === undefined ? null : (
        <View style={styles.badge}>
          <LockIcon color={colors.onAccent} />
          <Text style={styles.badgeText}>{lockedBadge}</Text>
        </View>
      )}
    </>
  );
  const label = [title, status, lockedHint].filter((part) => part !== undefined).join(', ');
  if (!onPress) {
    return (
      <View style={[styles.tile, disabled && styles.disabled]} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.onAccent },
});
