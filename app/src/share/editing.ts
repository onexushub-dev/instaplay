import type { Clip } from '../data/schema';

export const SPEEDS = [0.5, 1, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/** Pinch zoom: `scale` times, looking at the point (cx, cy) of the video, both in 0..1. */
export type Zoom = { scale: number; cx: number; cy: number };
export const MAX_ZOOM = 4;
export const NO_ZOOM: Zoom = { scale: 1, cx: 0.5, cy: 0.5 };

export type Edit = { speed: Speed; muted: boolean; zoom: Zoom | undefined };

/** What the editor works with. Clips saved before speeds existed only have the slow motion switch. */
export function readEdit(edit: Clip['edit']): Edit {
  return { speed: edit?.speed ?? (edit?.slowmo ? 0.5 : 1), muted: edit?.muted ?? false, zoom: edit?.zoom };
}

/** How long the result lasts: the cut played at `speed`. */
export function outputMs(trim: { startMs: number; endMs: number }, speed: number): number {
  return (trim.endMs - trim.startMs) / speed;
}

/** 1x..MAX_ZOOM, with the visible window kept inside the video. */
export function clampZoom(zoom: Zoom): Zoom {
  const scale = Math.min(Math.max(zoom.scale, 1), MAX_ZOOM);
  const half = 0.5 / scale;
  return {
    scale,
    cx: Math.min(Math.max(zoom.cx, half), 1 - half),
    cy: Math.min(Math.max(zoom.cy, half), 1 - half),
  };
}

/** The visible part of the video, in 0..1 of its width and height (what the export crops to). */
export function cropRect(zoom: Zoom): { x: number; y: number; width: number; height: number } {
  const size = 1 / zoom.scale;
  return { x: zoom.cx - size / 2, y: zoom.cy - size / 2, width: size, height: size };
}

/**
 * Pinch by `ratio`. `focal` is where the fingers are on the picture (0..1); the point under them stays under them, as
 * in any photo viewer.
 */
export function pinchZoom(base: Zoom, ratio: number, focal: { x: number; y: number } = { x: 0.5, y: 0.5 }): Zoom {
  const scale = Math.min(Math.max(base.scale * ratio, 1), MAX_ZOOM);
  const shift = (f: number, c: number) => c + (f - 0.5) / base.scale - (f - 0.5) / scale;
  return clampZoom({ scale, cx: shift(focal.x, base.cx), cy: shift(focal.y, base.cy) });
}

/** `dx`/`dy`: how far the fingers moved, as a fraction of the video's size on screen. The picture follows them. */
export function panZoom(base: Zoom, dx: number, dy: number): Zoom {
  return clampZoom({ ...base, cx: base.cx - dx / base.scale, cy: base.cy - dy / base.scale });
}
