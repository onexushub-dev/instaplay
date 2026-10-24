import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../../theme/tokens';
import type { ToolContext } from '../tools';
import { PanelHead } from './PanelParts';

const HINT = 'A câmera acompanha o lance, com zoom quando a jogada se concentra.';

export function FocusPanel({ ctx }: { ctx: ToolContext }) {
  if (ctx.focus === 'unavailable') {
    return (
      <View style={{ gap: 10 }}>
        <PanelHead title="Modo Foco" hint="Modo Foco indisponível para esse clipe." />
      </View>
    );
  }
  const on = ctx.focus === 'on';
  const preparing = ctx.focus === 'preparing';
  return (
    <View style={{ gap: 10 }}>
      <PanelHead
        title="Modo Foco"
        hint={HINT}
        right={
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Modo Foco"
            accessibilityState={{ checked: on, disabled: preparing }}
            disabled={preparing}
            onPress={ctx.toggleFocus}
            hitSlop={8}
            style={[styles.track, on ? styles.trackOn : null, preparing ? styles.off : null]}>
            <View style={[styles.knob, on ? styles.knobOn : null]} />
          </Pressable>
        }
      />
      {preparing ? (
        <View style={styles.note}>
          <ActivityIndicator size="small" color={colors.soft} />
          <Text style={styles.noteText}>Preparando o enquadramento…</Text>
        </View>
      ) : (
        <View style={styles.note}>
          <Text style={styles.noteText}>Mantenha o dedo pressionado no vídeo para ver o clipe original</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: 52, height: 32, borderRadius: 16, backgroundColor: colors.border, justifyContent: 'center', padding: 3 },
  trackOn: { backgroundColor: colors.accent },
  off: { opacity: 0.45 },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text },
  knobOn: { alignSelf: 'flex-end', backgroundColor: colors.onAccent },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  noteText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
});
