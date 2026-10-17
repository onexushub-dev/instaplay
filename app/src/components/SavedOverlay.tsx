import { StyleSheet, Text, View } from 'react-native';

import type { TriggerSource } from '../data/schema';
import { colors, fonts } from '../theme/tokens';
import { Button } from './Button';
import { CheckIcon } from './icons';
import { SOURCE_LABEL } from './sourceLabel';

type Props = { number: number; source: TriggerSource; onUndo: () => void };

/** Full-screen confirmation shown for ~2s after each save (mockup 4). */
export function SavedOverlay({ number, source, onUndo }: Props) {
  return (
    <View style={styles.root} accessibilityLiveRegion="assertive">
      <View style={styles.badge}>
        <CheckIcon />
      </View>
      <Text style={styles.title}>{`LANCE #${number} SALVO`}</Text>
      <Text style={styles.via}>{`via ${SOURCE_LABEL[source]} · últimos 30s`}</Text>
      <Text style={styles.hint}>Dá para ajustar o corte depois, dentro dos 60s guardados.</Text>
      <View style={styles.undo}>
        <Button label="Desfazer" variant="secondary" onPress={onUndo} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.recordingGround,
    borderWidth: 6,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  badge: { width: 140, height: 140, borderRadius: 70, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayBold, fontSize: 52, color: colors.text, textAlign: 'center' },
  via: { fontFamily: fonts.body, fontSize: 15, color: colors.soft },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  undo: { position: 'absolute', left: 24, right: 24, bottom: 48 },
});
