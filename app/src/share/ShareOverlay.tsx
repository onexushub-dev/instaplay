import { type ComponentRef, forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useT } from '../i18n/useT';
import { colors, fonts } from '../theme/tokens';
import type { Rect as Box } from './layout';

/** Instagram draws its own UI over the bottom of a Story; the mark stays above this margin. */
export const SAFE_BOTTOM = 340;
const SIDE = 64;

type Props = {
  frame: { width: number; height: number };
  layout: { video: Box; top: Box; bottom: Box };
  /** Screen points per frame pixel: 1/PixelRatio for the capture, smaller for the on-screen preview. */
  scale: number;
  /** Draw the "made with" mark. Free exports carry it; paid ones (pass, pro) do not. Bands and layout are unchanged. */
  watermark?: boolean;
};

/**
 * What every exported clip carries: dark bands where the video leaves room (landscape), a soft gradient
 * and the app mark, so whoever sees a shared clip knows which app made it. The same component draws the
 * preview and, captured to PNG, the export overlay.
 */
export const ShareOverlay = forwardRef<ComponentRef<typeof View>, Props>(function ShareOverlay(
  { frame, layout, scale, watermark = true },
  ref,
) {
  const { t } = useT();
  const s = (n: number) => n * scale;
  const box = (r: Box) => ({
    position: 'absolute' as const,
    left: s(r.x),
    top: s(r.y),
    width: s(r.width),
    height: s(r.height),
  });

  return (
    <View ref={ref} collapsable={false} style={{ width: s(frame.width), height: s(frame.height) }}>
      {layout.top.height > 0 ? <View style={[box(layout.top), styles.band]} /> : null}
      {layout.bottom.height > 0 ? <View style={[box(layout.bottom), styles.band]} /> : null}
      <View testID="share-video-area" style={box(layout.video)} />

      <Svg width={s(frame.width)} height={s(frame.height)} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.75} />
          </LinearGradient>
        </Defs>
        <Rect
          x={0}
          y={s(frame.height - SAFE_BOTTOM - 520)}
          width={s(frame.width)}
          height={s(SAFE_BOTTOM + 520)}
          fill="url(#bottom)"
        />
      </Svg>

      {watermark ? (
        <View
          style={[
            styles.mark,
            styles.row,
            { bottom: s(SAFE_BOTTOM - 90), right: s(SIDE), paddingHorizontal: s(20), paddingVertical: s(10), gap: s(10) },
          ]}>
          <View style={[styles.dot, { width: s(16), height: s(16), borderRadius: s(8) }]} />
          <Text allowFontScaling={false} style={[styles.markText, { fontSize: s(28) }]}>
            {t('share.madeWith')}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  band: { backgroundColor: colors.ground },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { backgroundColor: colors.accent },
  mark: { position: 'absolute', backgroundColor: 'rgba(15,16,13,0.7)', borderRadius: 999 },
  markText: { fontFamily: fonts.bodyBold, color: colors.text },
});
