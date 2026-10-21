import { VideoView } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useT } from '../i18n/useT';
import { NO_ZOOM, type Rotation, type Zoom } from './editing';
import { useZoomGesture } from './useZoomGesture';

type Props = {
  player: React.ComponentProps<typeof VideoView>['player'];
  /** The touch area: the whole preview, bigger than the video so a landscape clip is easy to pinch. */
  area: { width: number; height: number };
  /** Where the video sits inside `area`. */
  box: { left: number; top: number; width: number; height: number };
  /** The saved zoom; the live one is kept here so that a pinch redraws only this view, not the whole screen. */
  zoom: Zoom | undefined;
  /** The player's extra clockwise turn; `box` is the shape after turning. */
  rotation: Rotation;
  onCommit: (zoom: Zoom) => void;
  onTap: () => void;
  /** A clear horizontal flick while not zoomed: 1 for left (next), -1 for right (previous). */
  onSwipe?: (step: 1 | -1) => void;
};

/** The video with pinch zoom (around the fingers), drag to move it, and tap. Remount it to start again from `zoom`. */
export function ZoomableVideo({ player, area, box, zoom, rotation, onCommit, onTap, onSwipe }: Props) {
  const { t } = useT();
  const [live, setLive] = useState<Zoom>(zoom ?? NO_ZOOM);
  const panHandlers = useZoomGesture({ zoom: live, box, onChange: setLive, onCommit, onTap, onSwipe });

  return (
    <View {...panHandlers} accessibilityLabel={t('clip.video')} style={[styles.area, area]}>
      <View pointerEvents="none" style={[styles.box, box]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                { translateX: (0.5 - live.cx) * box.width * live.scale },
                { translateY: (0.5 - live.cy) * box.height * live.scale },
                { scale: live.scale },
              ],
            },
          ]}>
          <VideoView player={player} contentFit="contain" nativeControls={false} style={turned(box, rotation)} />
        </View>
      </View>
    </View>
  );
}

/** The video laid out at its own shape in the middle of `box`, then turned, so that it fills `box` after the turn. */
function turned(box: { width: number; height: number }, rotation: Rotation) {
  const sideways = rotation % 180 !== 0;
  const width = sideways ? box.height : box.width;
  const height = sideways ? box.width : box.height;
  return {
    position: 'absolute' as const,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    width,
    height,
    transform: [{ rotate: `${rotation}deg` }],
  };
}

const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, top: 0 },
  box: { position: 'absolute', overflow: 'hidden' },
});
