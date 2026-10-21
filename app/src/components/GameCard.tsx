import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Clip, Session } from '../data/schema';
import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';
import { recordedLabel, sessionLabel } from './format';
import { useClipThumbnail } from './useClipThumbnail';

type Props = { session: Session; clips: number; firstClip?: Clip; recordedMs: number; lockedClips?: number; onPress: () => void };

/** One past game in "My recordings": first lance's frame, name (or sport + date), lances and time. */
export function GameCard({ session, clips, firstClip, recordedMs, lockedClips = 0, onPress }: Props) {
  const thumb = useClipThumbnail(firstClip?.path ?? '', firstClip?.trim.startMs ?? 0);
  const { t, locale } = useT();
  const label = sessionLabel(session, undefined, locale);
  const base = t('games.detail', { clips: t('summary.clips', { count: clips }), time: recordedLabel(recordedMs, locale) });
  const detail = lockedClips > 0 ? t('games.lockedDetail', { detail: base, count: lockedClips }) : base;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      onPress={onPress}
      style={styles.card}>
      <View style={styles.thumb}>
        {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 10,
  },
  thumb: { width: 96, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.border },
  text: { flex: 1, gap: 4 },
  label: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  detail: { fontFamily: fonts.body, fontSize: 13, color: colors.soft },
});
