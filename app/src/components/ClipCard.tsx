import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Clip } from '../data/schema';
import { colors, fonts } from '../theme/tokens';
import { seconds, timeOfDay } from './format';
import { CheckIcon } from './icons';
import { SOURCE_LABEL } from './sourceLabel';
import { useClipThumbnail } from './useClipThumbnail';

type Props = {
  clip: Clip;
  number: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** Picking clips to delete: the card shows a check circle and is dimmed until picked. */
  selecting?: boolean;
  selected?: boolean;
};

export function ClipCard({ clip, number, onPress, onLongPress, selecting = false, selected = false }: Props) {
  const thumb = useClipThumbnail(clip.path, clip.trim.startMs);
  const duration = seconds(clip.trim.endMs - clip.trim.startMs);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Clipe ${number}${clip.name ? ` · ${clip.name}` : ''}, ${duration}, ${SOURCE_LABEL[clip.source]}${clip.savedAt ? ', salvo na galeria' : clip.sharedAt ? ', compartilhado' : ''}${selecting ? (selected ? ', selecionado' : ', não selecionado') : ''}`}
      accessibilityState={selecting ? { checked: selected } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.card, selecting && !selected && styles.unpicked]}>
      <View style={styles.thumb}>
        {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[styles.tag, { left: 8, top: 8 }]}>
          <Text style={styles.tagText}>{`#${number}`}</Text>
        </View>
        <View style={[styles.tag, { right: 8, bottom: 8 }]}>
          <Text style={styles.tagText}>{duration}</Text>
        </View>
        {clip.savedAt || clip.sharedAt ? (
          <View style={[styles.tag, styles.done, { left: 8, bottom: 8 }]}>
            <CheckIcon color={colors.accent} size={12} />
            <Text style={styles.tagText}>{clip.savedAt ? 'Na galeria' : 'Compartilhado'}</Text>
          </View>
        ) : null}
        {selecting ? (
          <View style={[styles.check, selected && styles.checkOn]}>{selected ? <CheckIcon size={16} /> : null}</View>
        ) : null}
      </View>
      {clip.name ? (
        <Text style={styles.name} numberOfLines={1}>
          {clip.name}
        </Text>
      ) : null}
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
  tag: {
    position: 'absolute',
    backgroundColor: 'rgba(15,16,13,0.85)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  unpicked: { opacity: 0.6 },
  check: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: 'rgba(15,16,13,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
});
