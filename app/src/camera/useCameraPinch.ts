import { useLayoutEffect, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

import type { ZoomRange } from '../../modules/replay-camera/src/ReplayCamera.types';
import { pinchZoom } from '../modes/zoom';

type Props = {
  /** The zoom now: where a new pinch starts from. */
  zoom: number;
  range: ZoomRange;
  /** Live, on every move of the fingers. */
  onChange: (zoom: number) => void;
  /** When the fingers lift (or the gesture is taken away): the zoom to keep. */
  onCommit: (zoom: number) => void;
};

type Touch = { pageX: number; pageY: number };

const distance = (touches: readonly Touch[]) =>
  Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);

/**
 * Two fingers on the preview zoom the camera like the iPhone Camera app: the zoom changes by how much the distance between
 * the fingers grew. Only a two-finger move takes the gesture, so taps and one-finger drags are left to whatever is under it.
 */
export function useCameraPinch(props: Props) {
  // The responder callbacks read the latest props through this ref (updated after each commit).
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const [handlers] = useState(() => {
    let base = 1;
    let current = 1;
    let startDistance = 0;
    let pinching = false;

    const begin = (touches: readonly Touch[]) => {
      base = current;
      startDistance = distance(touches);
      pinching = startDistance > 0;
    };

    return {
      onMoveShouldSetResponder: (e: GestureResponderEvent) => e.nativeEvent.touches.length === 2,
      onResponderGrant: (e: GestureResponderEvent) => {
        current = latest.current.zoom;
        begin(e.nativeEvent.touches);
      },
      onResponderMove: (e: GestureResponderEvent) => {
        const touches = e.nativeEvent.touches;
        // A finger that lifted (or lands again) starts a fresh reading from the zoom reached so far.
        if (touches.length < 2) {
          pinching = false;
          return;
        }
        if (!pinching) return begin(touches);
        current = pinchZoom(base, distance(touches) / startDistance, latest.current.range);
        latest.current.onChange(current);
      },
      onResponderRelease: () => latest.current.onCommit(current),
      onResponderTerminate: () => latest.current.onCommit(current),
    };
  });

  return handlers;
}
