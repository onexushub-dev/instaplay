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

/** 0.5 = the ultra-wide lens, 1 = the wide lens, above 1 a digital crop. */
export type ModeSettings = {
  zoom: number;
  gestureEnabled: boolean;
  voiceEnabled: boolean;
  bufferSeconds: 60 | 120;
  cutSeconds: number;
  quality: '1080p60' | '1080p30';
};

/** What was saved for a mode: before zoom existed it held `lens` (read, never written). */
export type StoredModeSettings = Partial<ModeSettings> & { lens?: 'ultraWide' | 'wide' };

export type Session = { id: string; sport: Sport; startedAt: number; endedAt?: number; name?: string; /** RevenueCat transaction id of the session pass that unlocked this game; absent = no pass. */ passTransactionId?: string };

export const MAX_GAME_NAME = 40;
export const MAX_CLIP_NAME = 40;

export type Clip = {
  id: string;
  sessionId: string;
  createdAt: number;
  source: TriggerSource;
  path: string;
  durationMs: number;
  trim: { startMs: number; endMs: number };
  /** Where the useful video starts after a black start (0 = from the beginning); unset until the editor first checked. */
  contentStartMs?: number;
  /** Editor choices; absent = normal speed, with sound, no zoom. `slowmo` is how clips saved before speeds were stored. */
  edit?: { slowmo?: boolean; speed?: 0.5 | 1 | 1.5 | 2; muted: boolean; zoom?: { scale: number; cx: number; cy: number }; rotation?: 0 | 90 | 180 | 270 };
  /** Optional name the player gives the clip (like a recording's name). */
  name?: string;
  /** True when the clip was recorded over the free limit and is locked until the game has a pass. */
  locked?: boolean;
  /** When the edited video was last saved to Photos / sent through the share sheet (the clip itself stays inside the app). */
  savedAt?: number;
  sharedAt?: number;
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
  /** When a press of the Bluetooth remote was first heard; the app cannot see the iOS pairing, only presses. */
  remoteTestedAt?: number;
  /** The player's changes to a mode's defaults, kept per mode. */
  modeSettings?: Partial<Record<ModeId, StoredModeSettings>>;
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
