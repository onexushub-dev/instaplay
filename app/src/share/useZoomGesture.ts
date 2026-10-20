import { useLayoutEffect, useRef, useState } from 'react';
import { PanResponder } from 'react-native';

import { NO_ZOOM, panZoom, pinchZoom, type Zoom } from './editing';

type Touch = { pageX: number; pageY: number };
type Props = {
  zoom: Zoom;
  /** Where the video sits inside the touch area, to turn finger movement into a fraction of it. */
  box: { left: number; top: number; width: number; height: number };
  onChange: (zoom: Zoom) => void;
  onCommit: (zoom: Zoom) => void;
  onTap: () => void;
};

const TAP_SLOP = 10;
const TAP_MS = 350;

/** Two fingers pinch and move the picture, one finger moves it when zoomed in; a short touch without movement is a tap. */
export function useZoomGesture(props: Props) {
  // Pan callbacks read the latest props through this ref (updated after each commit).
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // eslint-disable-next-line react-hooks/refs -- the ref is only read inside pan callbacks, never during render
  const [responder] = useState(() => {
    let origin = { x: 0, y: 0 };
    let current: Zoom = NO_ZOOM;
    let previous: { count: number; x: number; y: number; distance: number } | undefined;
    let startedAt = 0;
    let travelled = 0;
    let multi = false;

    const read = (touches: readonly Touch[]) => {
      const x = touches.reduce((sum, t) => sum + t.pageX, 0) / touches.length;
      const y = touches.reduce((sum, t) => sum + t.pageY, 0) / touches.length;
      const distance =
        touches.length > 1 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : 0;
      return { count: touches.length, x, y, distance };
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current = latest.current.zoom;
        previous = read(e.nativeEvent.touches);
        startedAt = Date.now();
        travelled = 0;
        multi = previous.count > 1;
        // Where the touch area starts on screen: the touch's page position minus its position inside the area.
        const first = e.nativeEvent.touches[0] as Touch & { locationX?: number; locationY?: number };
        origin = { x: first.pageX - (first.locationX ?? 0), y: first.pageY - (first.locationY ?? 0) };
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        if (!touches.length) return;
        const next = read(touches);
        multi ||= next.count > 1;
        const { box } = latest.current;
        const { width, height } = box;
        // Only moves between two readings with the same number of fingers count: a finger landing or leaving jumps the centre.
        if (previous && previous.count === next.count && width > 0 && height > 0) {
          const dx = next.x - previous.x;
          const dy = next.y - previous.y;
          travelled += Math.hypot(dx, dy);
          let zoom = current;
          if (next.count > 1 && previous.distance > 0) {
            const focal = { x: (next.x - origin.x - box.left) / width, y: (next.y - origin.y - box.top) / height };
            zoom = pinchZoom(zoom, next.distance / previous.distance, {
              x: Math.min(Math.max(focal.x, 0), 1),
              y: Math.min(Math.max(focal.y, 0), 1),
            });
          }
          current = panZoom(zoom, dx / width, dy / height);
          latest.current.onChange(current);
        }
        previous = next;
      },
      onPanResponderRelease: () => {
        const tap = !multi && travelled < TAP_SLOP && Date.now() - startedAt < TAP_MS;
        if (tap) latest.current.onTap();
        else latest.current.onCommit(current);
      },
      onPanResponderTerminate: () => latest.current.onCommit(current),
    });
  });

  return responder.panHandlers;
}
