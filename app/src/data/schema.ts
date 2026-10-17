import type { TriggerSource } from '../../modules/replay-camera/src/ReplayCamera.types';

export type { TriggerSource };

export type Sport = 'beachTennis' | 'futevolei' | 'voleiPraia' | 'outro';

export type Session = { id: string; sport: Sport; startedAt: number; endedAt?: number };

export type Clip = {
  id: string;
  sessionId: string;
  createdAt: number;
  source: TriggerSource;
  path: string;
  durationMs: number;
  trim: { startMs: number; endMs: number };
};

export type Prefs = {
  onboardingDone: boolean;
  sport: Sport;
  lens: 'ultraWide' | 'wide';
  gestureEnabled: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  onboardingDone: false,
  sport: 'beachTennis',
  lens: 'ultraWide',
  gestureEnabled: true,
};

/** Default cut: the last 30s of the saved 60s window (spec 3.3). */
export const DEFAULT_TRIM_MS = 30_000;
