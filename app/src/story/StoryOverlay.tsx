import { type ComponentRef, forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';
import type { Rect } from './layout';

type Props = {
  frame: { width: number; height: number };
  layout: { video: Rect; top: Rect; bottom: Rect };
  texts: { top: string[]; bottom: string[] };
  watermark: boolean;
  /** Screen points per Story pixel: 1 for the 1080×1920 capture, smaller for the on-screen preview. */
  scale: number;
};

/**
 * The Story template: dark bands above and below the video with the template lines, and a transparent
 * hole where the video goes. The same component draws the preview and, captured to PNG, the export overlay.
 */
export const StoryOverlay = forwardRef<ComponentRef<typeof View>, Props>(function StoryOverlay({ frame, layout, texts, watermark, scale }, ref) {
  const s = (n: number) => n * scale;
  const band = (r: Rect) => ({ position: 'absolute' as const, left: s(r.x), top: s(r.y), width: s(r.width), height: s(r.height) });

  return (
    <View ref={ref} collapsable={false} style={{ width: s(frame.width), height: s(frame.height) }}>
      <View style={[band(layout.top), styles.band, styles.topBand, { padding: s(56), gap: s(12) }]}>
        {texts.top.map((line, i) => (
          <Text key={line + i} style={i === 0 ? [styles.headline, { fontSize: s(88) }] : [styles.line, { fontSize: s(44) }]}>
            {line}
          </Text>
        ))}
        {watermark ? (
          <View style={[styles.watermark, { top: s(40), right: s(40), paddingHorizontal: s(20), paddingVertical: s(10), gap: s(10) }]}>
            <View style={[styles.dot, { width: s(16), height: s(16), borderRadius: s(8) }]} />
            <Text style={[styles.watermarkText, { fontSize: s(28) }]}>feito com LANCE</Text>
          </View>
        ) : null}
      </View>

      <View testID="story-video-area" style={band(layout.video)} />

      <View style={[band(layout.bottom), styles.band, styles.bottomBand, { padding: s(56), gap: s(12) }]}>
        {texts.bottom.map((line, i) =>
          line ? (
            <Text key={line + i} style={i === 0 ? [styles.headline, { fontSize: s(96) }] : [styles.line, { fontSize: s(44) }]}>
              {line}
            </Text>
          ) : null
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  band: { backgroundColor: colors.ground, overflow: 'hidden' },
  topBand: { justifyContent: 'flex-end' },
  bottomBand: { justifyContent: 'flex-start' },
  headline: { fontFamily: fonts.displayBold, color: colors.accent },
  line: { fontFamily: fonts.bodyBold, color: colors.text },
  watermark: { position: 'absolute', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15,16,13,0.7)', borderRadius: 999 },
  dot: { backgroundColor: colors.accent },
  watermarkText: { fontFamily: fonts.bodyBold, color: colors.text },
});
