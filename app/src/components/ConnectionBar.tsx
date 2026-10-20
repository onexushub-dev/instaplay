import { StyleSheet, Text, View } from 'react-native';

import type { ConnectionTone } from '../remote/remoteScreen';
import { colors, fonts } from '../theme/tokens';

type Props = { tone: ConnectionTone; name: string; detail?: string };

const DOT: Record<ConnectionTone, string> = { ok: colors.accent, warn: colors.warning, bad: colors.rec };

function spoken(tone: ConnectionTone, name: string): string {
  if (tone === 'ok') return `Conectado a ${name}`;
  if (tone === 'warn') return `Reconectando a ${name}`;
  return 'Sem acesso à rede local';
}

/** Always-visible strip at the top of the remote: a coloured dot (never colour alone: the label says it too), the camera phone's full name (it wraps instead of being cut) and, below it, the game. */
export function ConnectionBar({ tone, name, detail }: Props) {
  return (
    <View accessible accessibilityLabel={spoken(tone, name)} style={styles.bar}>
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: DOT[tone] }]} />
        <Text style={styles.name}>{name}</Text>
      </View>
      {detail !== undefined ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 72,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 20, height: 20, borderRadius: 10 },
  name: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 22, color: colors.text },
  detail: { fontFamily: fonts.displayBold, fontSize: 40, color: colors.text },
});
