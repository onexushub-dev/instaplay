import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Clip } from '../data/schema';
import { colors, fonts } from '../theme/tokens';
import { seconds, timeOfDay } from './format';
import { SOURCE_LABEL } from './sourceLabel';
import { useClipThumbnail } from './useClipThumbnail';

type Props = { clip: Clip; number: number; onPress: () => void };

export function ClipCard({ clip, number, onPress }: Props) {
  const thumb = useClipThumbnail(clip.path, clip.trim.startMs);
  const duration = seconds(clip.trim.endMs - clip.trim.startMs);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lance ${number}, ${duration}, ${SOURCE_LABEL[clip.source]}`}
      onPress={onPress}
      style={styles.card}>
      <View style={styles.thumb}>
        {thumb ? <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[styles.tag, { left: 8, top: 8 }]}>
          <Text style={styles.tagText}>{`#${number}`}</Text>
        </View>
        <View style={[styles.tag, { right: 8, bottom: 8 }]}>
          <Text style={styles.tagText}>{duration}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={styles.metaText}>{timeOfDay(clip.createdAt)}</Text>
        <Text style={styles.metaText}>{SOURCE_LABEL[clip.source]}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 8 },
  thumb: { height: 128, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  tag: { position: 'absolute', backgroundColor: 'rgba(15,16,13,0.85)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
});
