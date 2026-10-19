import type { TriggerSource } from '../../modules/replay-camera/src/ReplayCamera.types';

export type { TriggerSource };

export type Sport = 'beachTennis' | 'futevolei' | 'voleiPraia' | 'outro';

export type Session = { id: string; sport: Sport; startedAt: number; endedAt?: number; name?: string };

export const MAX_GAME_NAME = 40;

export type Clip = {
  id: string;
  sessionId: string;
  createdAt: number;
  source: TriggerSource;
  path: string;
  durationMs: number;
  trim: { startMs: number; endMs: number };
  /** Editor choices; absent = no slow motion, with sound. */
  edit?: { slowmo: boolean; muted: boolean };
};

export type Prefs = {
  onboardingDone: boolean;
  sport: Sport;
  lens: 'ultraWide' | 'wide';
  gestureEnabled: boolean;
  /** Feedback the moment a save is accepted, for a player far from the phone. */
  soundOnSave: boolean;
  flashOnSave: boolean;
  /** "salvar" / "gravar" by voice (iOS). Off until speech permission is granted. */
  voiceEnabled: boolean;
  /** Story screen choices, remembered between lances. */
  storyTemplate: 'placar' | 'minimal' | 'arena';
  arenaName?: string;
};

export const DEFAULT_PREFS: Prefs = {
  onboardingDone: false,
  sport: 'beachTennis',
  lens: 'ultraWide',
  gestureEnabled: true,
  soundOnSave: true,
  flashOnSave: true,
  voiceEnabled: false,
  storyTemplate: 'placar',
};

/** Default cut: the last 30s of the saved 60s window (spec 3.3). */
export const DEFAULT_TRIM_MS = 30_000;
