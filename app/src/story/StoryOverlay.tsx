import { type ComponentRef, forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '../theme/tokens';
import type { Rect as Box } from './layout';
import type { TemplateId } from './templates';

/** Instagram draws its own UI over the top and bottom of a Story; text stays inside these margins. */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 340;
const SIDE = 64;

type Props = {
  frame: { width: number; height: number };
  layout: { video: Box; top: Box; bottom: Box };
  texts: { top: string[]; bottom: string[] };
  template?: TemplateId;
  watermark: boolean;
  /** Screen points per Story pixel: 1/PixelRatio for the capture, smaller for the on-screen preview. */
  scale: number;
};

/**
 * The Story "filter": dark bands where the video leaves room (landscape), soft dark gradients at the top and
 * bottom, and the template's text in Instagram's safe area, over the video when it fills the frame (portrait).
 * The same component draws the preview and, captured to PNG, the export overlay.
 */
export const StoryOverlay = forwardRef<ComponentRef<typeof View>, Props>(function StoryOverlay(
  { frame, layout, texts, template = 'placar', watermark, scale },
  ref
) {
  const s = (n: number) => n * scale;
  const box = (r: Box) => ({ position: 'absolute' as const, left: s(r.x), top: s(r.y), width: s(r.width), height: s(r.height) });
  const [first, second] = texts.top;
  const [main, sub] = texts.bottom;

  return (
    <View ref={ref} collapsable={false} style={{ width: s(frame.width), height: s(frame.height) }}>
      {layout.top.height > 0 ? <View style={[box(layout.top), styles.band]} /> : null}
      {layout.bottom.height > 0 ? <View style={[box(layout.bottom), styles.band]} /> : null}
      <View testID="story-video-area" style={box(layout.video)} />

      <Svg width={s(frame.width)} height={s(frame.height)} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0.7} />
            <Stop offset="1" stopColor="#000" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.75} />
          </LinearGradient>
        </Defs>
        {texts.top.length ? <Rect x={0} y={0} width={s(frame.width)} height={s(SAFE_TOP + 420)} fill="url(#top)" /> : null}
        <Rect x={0} y={s(frame.height - SAFE_BOTTOM - 520)} width={s(frame.width)} height={s(SAFE_BOTTOM + 520)} fill="url(#bottom)" />
      </Svg>

      <View testID="story-top-block" style={[styles.block, { top: s(SAFE_TOP), left: s(SIDE), right: s(SIDE), gap: s(14) }]}>
        {template === 'placar' && first ? (
          <>
            <View style={[styles.chip, { paddingHorizontal: s(24), paddingVertical: s(8), borderRadius: s(12) }]}>
              <Text style={[styles.chipText, { fontSize: s(56) }]}>{first}</Text>
            </View>
            {second ? <Text style={[styles.detail, { fontSize: s(40) }]}>{second}</Text> : null}
          </>
        ) : null}
        {template === 'arena' && first ? (
          <Text style={[styles.headline, styles.center, { fontSize: s(96), color: colors.accent }]}>{first}</Text>
        ) : null}
      </View>

      <View testID="story-bottom-block" style={[styles.block, { bottom: s(SAFE_BOTTOM), left: s(SIDE), right: s(SIDE), gap: s(10) }]}>
        {template === 'placar' ? (
          <>
            {main ? <Text style={[styles.headline, { fontSize: s(128) }]}>{main}</Text> : null}
            {sub ? <Text style={[styles.detail, { fontSize: s(44), color: colors.accent }]}>{sub}</Text> : null}
          </>
        ) : null}
        {template === 'arena' ? (
          <>
            {main ? <Text style={[styles.headline, styles.center, { fontSize: s(72) }]}>{main}</Text> : null}
            {sub ? <Text style={[styles.detail, styles.center, { fontSize: s(40) }]}>{sub}</Text> : null}
          </>
        ) : null}
        {template === 'minimal' && main ? (
          <View style={[styles.row, { gap: s(16) }]}>
            <View style={[styles.dot, { width: s(20), height: s(20), borderRadius: s(10) }]} />
            <Text style={[styles.detail, { fontSize: s(40) }]}>{main}</Text>
          </View>
        ) : null}
      </View>

      {watermark ? (
        <View style={[styles.watermark, styles.row, { bottom: s(SAFE_BOTTOM - 90), right: s(SIDE), paddingHorizontal: s(20), paddingVertical: s(10), gap: s(10) }]}>
          <View style={[styles.dot, { width: s(16), height: s(16), borderRadius: s(8) }]} />
          <Text style={[styles.watermarkText, { fontSize: s(28) }]}>feito com LANCE</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  band: { backgroundColor: colors.ground },
  block: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { textAlign: 'center' },
  chip: { alignSelf: 'flex-start', backgroundColor: colors.accent },
  chipText: { fontFamily: fonts.displayBold, color: colors.onAccent },
  headline: { fontFamily: fonts.displayBold, color: '#FFFFFF' },
  detail: { fontFamily: fonts.bodyBold, color: '#FFFFFF' },
  dot: { backgroundColor: colors.accent },
  watermark: { position: 'absolute', backgroundColor: 'rgba(15,16,13,0.7)', borderRadius: 999 },
  watermarkText: { fontFamily: fonts.bodyBold, color: colors.text },
});
