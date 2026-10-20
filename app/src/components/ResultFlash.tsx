import { StyleSheet, Text, View } from 'react-native';

import type { MessageKey } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';
import { CheckIcon, CloseIcon } from './icons';

export type FlashKind = 'saved' | 'failed' | 'timeout';

const LOOK: Record<FlashKind, { ground: string; word: MessageKey; hint: MessageKey | null }> = {
  saved: { ground: colors.accent, word: 'remote.flashSaved', hint: null },
  failed: { ground: colors.rec, word: 'remote.flashFailed', hint: 'remote.flashFailedHint' },
  timeout: { ground: colors.warning, word: 'remote.flashTimeout', hint: 'remote.flashTimeoutHint' },
};

/** Full-screen answer to a tap on SAVE, readable at arm's length and from across the court. Lets touches through. */
export function ResultFlash({ kind }: { kind: FlashKind }) {
  const { t } = useT();
  const look = LOOK[kind];
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="assertive"
      style={[StyleSheet.absoluteFill, styles.flash, { backgroundColor: look.ground }]}>
      {kind === 'saved' ? <CheckIcon size={160} /> : <CloseIcon color={colors.ground} size={160} />}
      <Text style={styles.word}>{t(look.word)}</Text>
      {look.hint !== null ? <Text style={styles.hint}>{t(look.hint)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flash: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  word: { fontFamily: fonts.displayBold, fontSize: 72, letterSpacing: 1, color: colors.ground, textAlign: 'center' },
  hint: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.ground, textAlign: 'center' },
});
