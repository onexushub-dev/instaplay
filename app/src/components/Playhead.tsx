import type { useVideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

type Props = {
  player: ReturnType<typeof useVideoPlayer>;
  durationMs: number;
  trim: { startMs: number; endMs: number };
  speed: number;
  /** While a trim handle is dragged the cursor sits on that edge instead of following playback. */
  scrubMs?: number;
};

/**
 * The cursor over the trim track: where the video is playing and how many seconds into the result that is.
 * It listens to the player itself, so playback redraws only this view and not the whole screen.
 */
export function Playhead({ player, durationMs, trim, speed, scrubMs }: Props) {
  const [playingMs, setPlayingMs] = useState(trim.startMs);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => setPlayingMs(currentTime * 1000));
    return () => sub.remove();
  }, [player]);

  const at = scrubMs ?? playingMs;
  const share = durationMs ? Math.min(Math.max(at / durationMs, 0), 1) : 0;
  const elapsed = Math.max(0, (at - trim.startMs) / speed / 1000);

  return (
    <View testID="playhead" pointerEvents="none" style={[styles.line, { left: `${share * 100}%` }]}>
      <View style={styles.pill}>
        <Text style={styles.time}>{`${elapsed.toFixed(1)}s`}</Text>
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
