import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { clampTrim } from '../share/trim';
import { colors } from '../theme/tokens';

type Cut = { startMs: number; endMs: number };
type Props = {
  durationMs: number;
  trim: Cut;
  /** Longest cut allowed: the mode's buffer (60s court, 120s gym). */
  maxMs?: number;
  onChange: (trim: Cut) => void;
  onCommit: (trim: Cut) => void;
};

const HANDLE = 44; // touch target

/** The whole clip as a track, the cut as an accent window with a draggable handle on each edge. */
export function TrimBar({ durationMs, trim, maxMs, onChange, onCommit }: Props) {
  const [width, setWidth] = useState(0);
  // Pan callbacks read the latest props through this ref (updated after each commit).
  const latest = useRef({ trim, width, durationMs, maxMs, onChange, onCommit });
  useLayoutEffect(() => {
    latest.current = { trim, width, durationMs, maxMs, onChange, onCommit };
  });

  const handle = (moved: 'start' | 'end') => {
    let origin: Cut = { startMs: 0, endMs: 0 };
    let current: Cut = origin;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        origin = latest.current.trim;
        current = origin;
      },
      onPanResponderMove: (_, g) => {
        const { width: w, durationMs: d } = latest.current;
        if (!w) return;
        const delta = (g.dx / w) * d;
        const next = moved === 'start' ? { ...origin, startMs: origin.startMs + delta } : { ...origin, endMs: origin.endMs + delta };
        current = clampTrim(next, d, moved, latest.current.maxMs);
        latest.current.onChange(current);
      },
      onPanResponderRelease: () => latest.current.onCommit(current),
      onPanResponderTerminate: () => latest.current.onCommit(current),
    });
  };
  // eslint-disable-next-line react-hooks/refs -- the ref is only read inside pan callbacks, never during render
  const [startPan] = useState(() => handle('start'));
  // eslint-disable-next-line react-hooks/refs -- same as above
  const [endPan] = useState(() => handle('end'));

  const left = durationMs ? (trim.startMs / durationMs) * width : 0;
  const right = durationMs ? (trim.endMs / durationMs) * width : 0;

  return (
    <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.window, { left, width: Math.max(0, right - left) }]} />
      <View
        {...startPan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Início do corte"
        style={[styles.handle, { left: left - HANDLE / 2 }]}>
        <View style={styles.grip} />
      </View>
      <View
        {...endPan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Fim do corte"
        style={[styles.handle, { left: right - HANDLE / 2 }]}>
        <View style={styles.grip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 56, borderRadius: 10, backgroundColor: colors.surface, justifyContent: 'center' },
  window: { position: 'absolute', top: 0, bottom: 0, borderWidth: 3, borderColor: colors.accent, borderRadius: 10, backgroundColor: 'rgba(214,242,63,0.12)' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: HANDLE, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 12, height: 32, borderRadius: 4, backgroundColor: colors.accent },
});
