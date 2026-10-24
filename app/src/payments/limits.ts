import type { Quality, TriggerSource } from '../../modules/replay-camera/src/ReplayCamera.types';
import type { ModeSettings } from '../data/schema';
import type { Plan } from './types';

/** The free plan records at most this much per clip. */
export const FREE_MAX_SECONDS = 15;

export type CaptureConfig = { quality: Quality; bufferSeconds: number; cutSeconds: number; audio: boolean };

export function hdQuality(q: Quality): Quality {
  return q === '1080p60' ? '720p60' : q === '1080p30' ? '720p30' : q;
}

/** What the camera runs with: the player's settings on the paid plan; HD, no sound and 15 s at most on the free one. */
export function captureConfig(settings: ModeSettings, plan: Plan): CaptureConfig {
  if (plan === 'paid') {
    return { quality: settings.quality, bufferSeconds: settings.bufferSeconds, cutSeconds: settings.cutSeconds, audio: settings.audio };
  }
  return {
    quality: hdQuality(settings.quality),
    bufferSeconds: Math.min(settings.bufferSeconds, FREE_MAX_SECONDS),
    cutSeconds: Math.min(settings.cutSeconds, FREE_MAX_SECONDS),
    audio: false,
  };
}

export const PAID_TRIGGERS: readonly TriggerSource[] = ['watch', 'remote', 'phone'];

export function triggerAllowed(source: TriggerSource, plan: Plan): boolean {
  return plan === 'paid' || !PAID_TRIGGERS.includes(source);
}
