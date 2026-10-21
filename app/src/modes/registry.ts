import type { ModeId, ModeSettings, Prefs } from '../data/schema';
import { zoomFromLens } from './zoom';

export type ModeGroup = 'quadra' | 'academia';
export type Guide = 'court' | 'person' | 'none';

/** A mode's name and placement tip are translated: modeLabel(id) and modeTip(group) in components/format. */
export type Mode = {
  id: ModeId;
  group: ModeGroup;
  guide: Guide;
  /** Whether the setup screen shows the group's placement tip (modeTip). The free court mode has none. */
  tip: boolean;
  defaults: ModeSettings;
};

const COURT: Omit<Mode, 'id'> = {
  group: 'quadra',
  guide: 'court',
  tip: false,
  defaults: {
    zoom: 0.5,
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: 60,
    cutSeconds: 30,
    quality: '1080p60',
  },
};

// Gym: overhead lifts would fire the arms-up gesture, so it is off; a set can outlast 60s;
// 1080p30 keeps a 120s buffer around 90 MB.
const GYM: Omit<Mode, 'id'> = {
  group: 'academia',
  guide: 'person',
  tip: true,
  defaults: {
    zoom: 1,
    gestureEnabled: false,
    voiceEnabled: true,
    bufferSeconds: 120,
    cutSeconds: 60,
    quality: '1080p30',
  },
};

/**
 * The modes the app offers. For now there is one, with no drawing over the camera: the player frames the shot freely.
 * A new mode is a new entry here (plus a guide drawing if it needs one).
 */
export const MODES: Mode[] = [{ ...COURT, id: 'quadra', guide: 'none' }];

/** Modes and sports offered before; games saved with them still need a label (modeLabel) and settings. */
const SAVED_SPORTS: Mode[] = [
  { ...GYM, id: 'academia' },
  { ...COURT, id: 'beachTennis' },
  { ...COURT, id: 'futevolei' },
  { ...COURT, id: 'voleiPraia' },
  { ...COURT, id: 'outro' },
  { ...GYM, id: 'musculacao' },
  { ...GYM, id: 'crossfit' },
  { ...GYM, id: 'funcional' },
  { ...GYM, id: 'outroAcademia' },
];

export function modeById(id: ModeId): Mode {
  return MODES.find((m) => m.id === id) ?? SAVED_SPORTS.find((m) => m.id === id) ?? MODES[0];
}

/** The offered mode a saved id belongs to. With one mode on offer, everything saved before maps to it. */
export function offeredMode(_id: ModeId): ModeId {
  return MODES[0].id;
}

/**
 * The settings a game in `mode` runs with: the mode's defaults, then (Quadra only) the global prefs
 * saved before modes existed, then the player's changes for this mode (a saved sport uses its group's).
 */
export function effectiveSettings(mode: ModeId, prefs: Prefs): ModeSettings {
  const m = modeById(mode);
  const own = offeredMode(mode);
  const legacy: Partial<ModeSettings> =
    m.group === 'quadra'
      ? { zoom: zoomFromLens(prefs.lens), gestureEnabled: prefs.gestureEnabled, voiceEnabled: prefs.voiceEnabled }
      : {};
  const saved = prefs.modeSettings && prefs.modeSettings[own] ? prefs.modeSettings[own] : {};
  const { lens: savedLens, ...rest } = saved;
  // A zoom saved for the mode wins; a lens saved before zoom existed keeps its framing.
  const savedZoom = rest.zoom !== undefined ? rest.zoom : savedLens !== undefined ? zoomFromLens(savedLens) : undefined;
  return { ...m.defaults, ...legacy, ...rest, ...(savedZoom !== undefined ? { zoom: savedZoom } : {}) };
}

/** The prefs patch that records `patch` as the player's change for `mode` only. */
export function withModeOverride(prefs: Prefs, mode: ModeId, patch: Partial<ModeSettings>): Partial<Prefs> {
  const current = prefs.modeSettings ?? {};
  return { modeSettings: { ...current, [mode]: { ...current[mode], ...patch } } };
}
