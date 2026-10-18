import type { Clip } from '../data/schema';
import type { Tier } from './entitlement';

export type StoryExport = {
  width: number;
  height: number;
  startMs: number;
  endMs: number;
  speed: 1 | 0.5;
  muted: boolean;
  watermark: boolean;
};

/** Free: 720x1280 with the watermark (spec 6). Slow motion plays at half speed without sound. */
export function exportOptions(tier: Tier, edit: Clip['edit'], trim: Clip['trim']): StoryExport {
  const pro = tier === 'pro';
  const slowmo = edit?.slowmo ?? false;
  return {
    width: pro ? 1080 : 720,
    height: pro ? 1920 : 1280,
    startMs: trim.startMs,
    endMs: trim.endMs,
    speed: slowmo ? 0.5 : 1,
    muted: slowmo || (edit?.muted ?? false),
    watermark: !pro,
  };
}
