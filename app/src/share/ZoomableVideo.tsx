import { VideoView } from 'expo-video';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NO_ZOOM, type Zoom } from './editing';
import { useZoomGesture } from './useZoomGesture';

type Props = {
  player: React.ComponentProps<typeof VideoView>['player'];
  /** The touch area: the whole preview, bigger than the video so a landscape clip is easy to pinch. */
  area: { width: number; height: number };
  /** Where the video sits inside `area`. */
  box: { left: number; top: number; width: number; height: number };
  /** The saved zoom; the live one is kept here so that a pinch redraws only this view, not the whole screen. */
  zoom: Zoom | undefined;
  onCommit: (zoom: Zoom) => void;
  onTap: () => void;
};

/** The video with pinch zoom (around the fingers), drag to move it, and tap. Remount it to start again from `zoom`. */
export function ZoomableVideo({ player, area, box, zoom, onCommit, onTap }: Props) {
  const [live, setLive] = useState<Zoom>(zoom ?? NO_ZOOM);
  const panHandlers = useZoomGesture({ zoom: live, box, onChange: setLive, onCommit, onTap });

  return (
    <View {...panHandlers} accessibilityLabel="Vídeo" style={[styles.area, area]}>
      <View pointerEvents="none" style={[styles.box, box]}>
        <VideoView
          player={player}
          contentFit="contain"
          nativeControls={false}
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                { translateX: (0.5 - live.cx) * box.width * live.scale },
                { translateY: (0.5 - live.cy) * box.height * live.scale },
                { scale: live.scale },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { position: 'absolute', left: 0, top: 0 },
  box: { position: 'absolute', overflow: 'hidden' },
});
