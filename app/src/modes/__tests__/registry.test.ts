import { MODE_LABEL } from '../../components/format';
import { DEFAULT_PREFS, type Prefs } from '../../data/schema';
import { effectiveSettings, MODES, modeById, offeredMode, withModeOverride } from '../registry';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

test('the app offers one free mode, with nothing drawn over the camera', () => {
  expect(MODES.map((m) => [m.id, m.label, m.guide, m.tip])).toEqual([['quadra', 'Livre', 'none', '']]);
  expect(DEFAULT_PREFS.sport).toBe('quadra');
});

test('the free mode defaults to 0.5x (ultra-wide), 60s, gesture on, last 30s', () => {
  expect(effectiveSettings('quadra', prefs())).toEqual({
    zoom: 0.5,
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: 60,
    cutSeconds: 30,
    quality: '1080p60',
  });
});

test('the player\'s changes are kept for the mode, and old global prefs still apply', () => {
  const p = prefs(withModeOverride(prefs(), 'quadra', { gestureEnabled: false }));
  expect(effectiveSettings('quadra', p).gestureEnabled).toBe(false);
  expect(effectiveSettings('quadra', prefs({ lens: 'wide', voiceEnabled: true }))).toMatchObject({
    zoom: 1,
    voiceEnabled: true,
  });
});

test('a lens saved in the mode\'s own settings before zoom existed keeps its framing', () => {
  const old = prefs({ modeSettings: { quadra: { lens: 'wide' } } });
  expect(effectiveSettings('quadra', old).zoom).toBe(1);
  expect(effectiveSettings('quadra', old)).not.toHaveProperty('lens');
  const ultra = prefs({ lens: 'wide', modeSettings: { quadra: { lens: 'ultraWide' } } });
  expect(effectiveSettings('quadra', ultra).zoom).toBe(0.5);
});

test('a saved zoom wins over an old lens and over the global one', () => {
  const p = prefs({ lens: 'wide', modeSettings: { quadra: { lens: 'wide', zoom: 2 } } });
  expect(effectiveSettings('quadra', p).zoom).toBe(2);
});

test('the gym defaults keep the wide lens as 1x', () => {
  expect(effectiveSettings('academia', prefs()).zoom).toBe(1);
});

test('saving a zoom writes zoom and never lens', () => {
  const patch = withModeOverride(prefs(), 'quadra', { zoom: 2 });
  expect(patch).toEqual({ modeSettings: { quadra: { zoom: 2 } } });
});

test('games saved with an old sport keep their label, and everything maps to the one mode on offer', () => {
  expect(MODE_LABEL.beachTennis).toBe('Beach tennis');
  expect(MODE_LABEL.musculacao).toBe('Musculação');
  expect(MODE_LABEL.quadra).toBe('Gravação');
  for (const id of ['futevolei', 'crossfit', 'academia', 'quadra'] as const) expect(offeredMode(id)).toBe('quadra');
  expect(modeById('academia').label).toBe('Academia');
  expect(modeById('voleiPraia').group).toBe('quadra');
});
