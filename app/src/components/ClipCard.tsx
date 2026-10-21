import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Clip } from "../data/schema";
import { useT } from "../i18n/useT";
import { colors, fonts } from "../theme/tokens";
import { seconds, timeOfDay } from "./format";
import { sourceLabel } from "./sourceLabel";
import { useClipThumbnail } from "./useClipThumbnail";

type Props = {
  clip: Clip;
  number: number;
  onPress: () => void;
  locked?: boolean;
};

export function ClipCard({ clip, number, onPress, locked = false }: Props) {
  const { t, locale } = useT();
  const thumb = useClipThumbnail(clip.path, clip.trim.startMs);
  const duration = seconds(clip.trim.endMs - clip.trim.startMs);
  const label = t("summary.clipA11y", {
    number,
    name: clip.name ? ` · ${clip.name}` : "",
    duration,
    source: sourceLabel(clip.source, locale),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={locked ? t("summary.lockedA11y", { label }) : label}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.thumb}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : null}
        {locked ? (
          <View style={styles.lockVeil}>
            <Text style={styles.lockText}>{t("summary.lockedTag")}</Text>
          </View>
        ) : null}
        <View style={[styles.tag, { left: 8, top: 8 }]}>
          <Text style={styles.tagText}>{`#${number}`}</Text>
        </View>
        <View style={[styles.tag, { right: 8, bottom: 8 }]}>
          <Text style={styles.tagText}>{duration}</Text>
        </View>
      </View>
      {clip.name ? (
        <Text style={styles.name} numberOfLines={1}>
          {clip.name}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <Text style={styles.metaText}>{timeOfDay(clip.createdAt, locale)}</Text>
        <Text style={styles.metaText}>{sourceLabel(clip.source, locale)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 8 },
  thumb: {
    height: 128,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  tag: {
    position: "absolute",
    backgroundColor: "rgba(15,16,13,0.85)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  lockVeil: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,16,13,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  lockText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.text,
  },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  meta: { flexDirection: "row", justifyContent: "space-between" },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
});
