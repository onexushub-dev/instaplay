import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Clip, Session } from '../data/schema';
import { colors, fonts } from '../theme/tokens';
import { recordedLabel, sessionLabel } from './format';
import { useClipThumbnail } from './useClipThumbnail';

type Props = { session: Session; clips: number; firstClip?: Clip; recordedMs: number; onPress: () => void };

/** One past game in "Meus jogos": first lance's frame, name (or sport + date), lances and time. */
export function GameCard({ session, clips, firstClip, recordedMs, onPress }: Props) {
  const thumb = useClipThumbnail(firstClip?.path ?? '', firstClip?.trim.startMs ?? 0);
  const label = sessionLabel(session);
  const detail = `${clips} ${clips === 1 ? 'lance' : 'lances'} · ${recordedLabel(recordedMs)}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${detail}`} onPress={onPress} style={styles.card}>
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
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 10 },
  thumb: { width: 96, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.border },
  text: { flex: 1, gap: 4 },
  label: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  detail: { fontFamily: fonts.body, fontSize: 13, color: colors.soft },
});
