import type { useVideoPlayer } from 'expo-video';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = {
  player: ReturnType<typeof useVideoPlayer>;
  durationMs: number;
  trim: { startMs: number; endMs: number };
  speed: number;
  /** While a trim handle is dragged the cursor sits on that edge instead of following playback. */
  scrubMs?: number;
  /** The player drags the cursor: where it is now, kept inside the cut. */
  onScrub?: (ms: number) => void;
  onScrubEnd?: () => void;
};

/**
 * The cursor over the trim track: where the video is playing and how many seconds into the result that is.
 * It listens to the player itself, so playback redraws only this view and not the whole screen.
 */
export function Playhead({ player, durationMs, trim, speed, scrubMs, onScrub, onScrubEnd }: Props) {
  const [playingMs, setPlayingMs] = useState(trim.startMs);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => setPlayingMs(currentTime * 1000));
    return () => sub.remove();
  }, [player]);

  const at = scrubMs ?? playingMs;
  const [width, setWidth] = useState(0);
  // Pan callbacks read the latest props through this ref (updated after each commit).
  const latest = useRef({ at, width, durationMs, trim, onScrub, onScrubEnd });
  useLayoutEffect(() => {
    latest.current = { at, width, durationMs, trim, onScrub, onScrubEnd };
  });
  // eslint-disable-next-line react-hooks/refs -- the ref is only read inside pan callbacks, never during render
  const [pan] = useState(() => {
    let origin = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        origin = latest.current.at;
        latest.current.onScrub?.(origin);
      },
      onPanResponderMove: (_, g) => {
        const { width: w, durationMs: d, trim: t } = latest.current;
        if (!w) return;
        const ms = Math.min(Math.max(origin + (g.dx / w) * d, t.startMs), t.endMs);
        latest.current.onScrub?.(ms);
      },
      onPanResponderRelease: () => latest.current.onScrubEnd?.(),
      onPanResponderTerminate: () => latest.current.onScrubEnd?.(),
    });
  });
  const share = durationMs ? Math.min(Math.max(at / durationMs, 0), 1) : 0;
  const elapsed = Math.max(0, (at - trim.startMs) / speed / 1000);

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View
        testID="playhead"
        {...pan.panHandlers}
        hitSlop={{ left: 18, right: 18, top: 10, bottom: 10 }}
        accessibilityRole="adjustable"
        accessibilityLabel="Posição do vídeo"
        style={[styles.line, { left: `${share * 100}%` }]}>
        <View pointerEvents="none" style={styles.pill}>
          <Text style={styles.time}>{`${elapsed.toFixed(1)}s`}</Text>
        </View>
      </View>
    </View>
  );
}

const PILL = 44;
const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.text,
    alignItems: 'center',
  },
  pill: {
    position: 'absolute',
    top: -2,
    width: PILL,
    marginLeft: 0,
    borderRadius: 999,
    backgroundColor: colors.text,
    alignItems: 'center',
    paddingVertical: 1,
  },
  time: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.ground },
});
