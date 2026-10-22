import { BUFFER_SECONDS, DEFAULT_CLIP_SECONDS, type ModeId, type ModeSettings, type Prefs } from '../data/schema';
import { zoomFromLens } from './zoom';

export type Guide = 'court' | 'person' | 'none';

export type Mode = {
  id: ModeId;
  label: string;
  guide: Guide;
  tip: string;
  defaults: ModeSettings;
};

// One set of defaults for everything: the app no longer tells a court from a gym. The buffer is fixed and
// the player picks the clip length on the setup screen.
const DEFAULTS: Omit<Mode, 'id' | 'label'> = {
  guide: 'court',
  tip: '',
  defaults: {
    zoom: 0.5,
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: BUFFER_SECONDS,
    cutSeconds: DEFAULT_CLIP_SECONDS,
    quality: '1080p60',
  },
};

/**
 * The modes the app offers. For now there is one, with no drawing over the camera: the player frames the shot freely.
 * A new mode is a new entry here (plus a guide drawing if it needs one).
 */
export const MODES: Mode[] = [{ ...DEFAULTS, id: 'quadra', label: 'Livre', guide: 'none' }];

/** Modes and sports offered before; games saved with them still need a label and settings. */
const SAVED_SPORTS: Mode[] = [
  { ...DEFAULTS, id: 'academia', label: 'Academia' },
  { ...DEFAULTS, id: 'beachTennis', label: 'Beach tennis' },
  { ...DEFAULTS, id: 'futevolei', label: 'Futevôlei' },
  { ...DEFAULTS, id: 'voleiPraia', label: 'Vôlei de praia' },
  { ...DEFAULTS, id: 'outro', label: 'Outro' },
  { ...DEFAULTS, id: 'musculacao', label: 'Musculação' },
  { ...DEFAULTS, id: 'crossfit', label: 'Crossfit' },
  { ...DEFAULTS, id: 'funcional', label: 'Funcional' },
  { ...DEFAULTS, id: 'outroAcademia', label: 'Outro' },
];

export function modeById(id: ModeId): Mode {
  return MODES.find((m) => m.id === id) ?? SAVED_SPORTS.find((m) => m.id === id) ?? MODES[0];
}

/** The offered mode a saved id belongs to. With one mode on offer, everything saved before maps to it. */
export function offeredMode(_id: ModeId): ModeId {
  return MODES[0].id;
}

/** The clip length kept within what the buffer can hold; anything unusable falls back to the default. */
function clipSeconds(value: number): number {
  if (!(value > 0)) return DEFAULT_CLIP_SECONDS;
  return Math.min(value, BUFFER_SECONDS);
}

/**
 * The settings a game runs with: the defaults, then the global prefs saved before modes existed, then the
 * player's changes. Every saved id uses the settings of the one mode on offer; the buffer is always the same.
 */
export function effectiveSettings(mode: ModeId, prefs: Prefs): ModeSettings {
  const m = modeById(mode);
  const own = offeredMode(mode);
  const legacy: Partial<ModeSettings> = {
    zoom: zoomFromLens(prefs.lens),
    gestureEnabled: prefs.gestureEnabled,
    voiceEnabled: prefs.voiceEnabled,
  };
  const saved = prefs.modeSettings && prefs.modeSettings[own] ? prefs.modeSettings[own] : {};
  const { lens: savedLens, ...rest } = saved;
  // A zoom saved for the mode wins; a lens saved before zoom existed keeps its framing.
  const savedZoom = rest.zoom !== undefined ? rest.zoom : savedLens !== undefined ? zoomFromLens(savedLens) : undefined;
  const merged = { ...m.defaults, ...legacy, ...rest, ...(savedZoom !== undefined ? { zoom: savedZoom } : {}) };
  return { ...merged, bufferSeconds: BUFFER_SECONDS, cutSeconds: clipSeconds(merged.cutSeconds) };
}

/** The prefs patch that records `patch` as the player's change for `mode` only. */
export function withModeOverride(prefs: Prefs, mode: ModeId, patch: Partial<ModeSettings>): Partial<Prefs> {
  const current = prefs.modeSettings ?? {};
  return { modeSettings: { ...current, [mode]: { ...current[mode], ...patch } } };
}
