import type { ModeId, ModeSettings, Prefs } from '../data/schema';

export type ModeGroup = 'quadra' | 'academia';
export type Guide = 'court' | 'person' | 'none';

export type Mode = {
  id: ModeId;
  group: ModeGroup;
  label: string;
  guide: Guide;
  tip: string;
  defaults: ModeSettings;
};

const COURT: Omit<Mode, 'id' | 'label'> = {
  group: 'quadra',
  guide: 'court',
  tip: '',
  defaults: {
    lens: 'ultraWide',
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: 60,
    cutSeconds: 30,
    quality: '1080p60',
  },
};

// Gym: overhead lifts would fire the arms-up gesture, so it is off; a set can outlast 60s;
// 1080p30 keeps a 120s buffer around 90 MB.
const GYM: Omit<Mode, 'id' | 'label'> = {
  group: 'academia',
  guide: 'person',
  tip: 'No chão ou no tripé, a 2–3 m, de lado para o exercício',
  defaults: {
    lens: 'wide',
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
export const MODES: Mode[] = [{ ...COURT, id: 'quadra', label: 'Livre', guide: 'none' }];

/** Modes and sports offered before; games saved with them still need a label and settings. */
const SAVED_SPORTS: Mode[] = [
  { ...GYM, id: 'academia', label: 'Academia' },
  { ...COURT, id: 'beachTennis', label: 'Beach tennis' },
  { ...COURT, id: 'futevolei', label: 'Futevôlei' },
  { ...COURT, id: 'voleiPraia', label: 'Vôlei de praia' },
  { ...COURT, id: 'outro', label: 'Outro' },
  { ...GYM, id: 'musculacao', label: 'Musculação' },
  { ...GYM, id: 'crossfit', label: 'Crossfit' },
  { ...GYM, id: 'funcional', label: 'Funcional' },
  { ...GYM, id: 'outroAcademia', label: 'Outro' },
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
      ? { lens: prefs.lens, gestureEnabled: prefs.gestureEnabled, voiceEnabled: prefs.voiceEnabled }
      : {};
  return { ...m.defaults, ...legacy, ...prefs.modeSettings?.[own] };
}

/** The prefs patch that records `patch` as the player's change for `mode` only. */
export function withModeOverride(prefs: Prefs, mode: ModeId, patch: Partial<ModeSettings>): Partial<Prefs> {
  const current = prefs.modeSettings ?? {};
  return { modeSettings: { ...current, [mode]: { ...current[mode], ...patch } } };
}
