import type { Clip } from '../data/schema';
import type { Tier } from './entitlement';
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
  watermark: boolean;
};

/** Free: 720x1280 (spec 6). Every export carries the app mark. Any speed other than 1x plays without sound. */
export function exportOptions(tier: Tier, edit: Clip['edit'], trim: Clip['trim']): ExportOptions {
  const pro = tier === 'pro';
  const { speed, muted, zoom } = readEdit(edit);
  return {
    width: pro ? 1080 : 720,
    height: pro ? 1920 : 1280,
    startMs: trim.startMs,
    endMs: trim.endMs,
    speed,
    muted: muted || speed !== 1,
    crop: zoom && zoom.scale > 1 ? cropRect(zoom) : undefined,
    watermark: true,
  };
}
