import type { Clip } from '../data/schema';
import type { Plan } from '../payments/types';
import { cropRect, readEdit } from './editing';

export type ExportOptions = {
  width: number;
  height: number;
  startMs: number;
  endMs: number;
  speed: number;
  muted: boolean;
  /** The visible part of the video (0..1 of its size) when the player zoomed in; absent = the whole video. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Extra clockwise turn on top of the one stored in the clip. */
  rotation: 0 | 90 | 180 | 270;
  watermark: boolean;
};

/** Legacy tier names still accepted until the export takes only a `Plan`. */
type Tier = Plan | 'pass' | 'pro';

/**
 * Free: 720x1280 (spec 6), paid (a paid plan, pass, pro): 1080x1920. A landscape clip gets the same frame turned on its
 * side, so it fills the screen when the phone is held sideways, like any video in Photos. Every export carries the app mark, in both plans.
 * Any speed other than 1x plays without sound.
 */
export function exportOptions(tier: Tier, edit: Clip['edit'], trim: Clip['trim'], landscape = false): ExportOptions {
  const paid = tier !== 'free';
  const short = paid ? 1080 : 720;
  const long = paid ? 1920 : 1280;
  const { speed, muted, zoom, rotation } = readEdit(edit);
  return {
    width: landscape ? long : short,
    height: landscape ? short : long,
    startMs: trim.startMs,
    endMs: trim.endMs,
    speed,
    muted: muted || speed !== 1,
    crop: zoom && zoom.scale > 1 ? cropRect(zoom) : undefined,
    rotation,
    watermark: true,
  };
}
