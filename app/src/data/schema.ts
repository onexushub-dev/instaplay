import type { TriggerSource } from '../../modules/replay-camera/src/ReplayCamera.types';

export type { TriggerSource };

/**
 * A usage mode. The app offers `quadra` and `academia`; the sport ids are kept so games saved with
 * them stay valid (they follow their group's settings).
 */
export type ModeId =
  | 'quadra'
  | 'academia'
  | 'beachTennis'
  | 'futevolei'
  | 'voleiPraia'
  | 'outro'
  | 'musculacao'
  | 'crossfit'
  | 'funcional'
  | 'outroAcademia';
/** Kept as the field type name: Session.sport and Prefs.sport hold a mode id. */
export type Sport = ModeId;

export type ModeSettings = {
  lens: 'ultraWide' | 'wide';
  gestureEnabled: boolean;
  voiceEnabled: boolean;
  bufferSeconds: 60 | 120;
  cutSeconds: number;
  quality: '1080p60' | '1080p30';
};

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
  /** The player's changes to a mode's defaults, kept per mode. */
  modeSettings?: Partial<Record<ModeId, Partial<ModeSettings>>>;
};

export const DEFAULT_PREFS: Prefs = {
  onboardingDone: false,
  sport: 'quadra',
  lens: 'ultraWide',
  gestureEnabled: true,
  soundOnSave: true,
  flashOnSave: true,
  voiceEnabled: false,
};

/** Default cut: the last 30s of the saved 60s window (spec 3.3). */
export const DEFAULT_TRIM_MS = 30_000;
