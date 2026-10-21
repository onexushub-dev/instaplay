import { MODE_LABEL } from '../../components/format';
import { DEFAULT_PREFS, type Prefs } from '../../data/schema';
import { effectiveSettings, MODES, modeById, offeredMode, withModeOverride } from '../registry';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

test('the app offers one free mode, with nothing drawn over the camera', () => {
  expect(MODES.map((m) => [m.id, m.label, m.guide, m.tip])).toEqual([['quadra', 'Livre', 'none', '']]);
  expect(DEFAULT_PREFS.sport).toBe('quadra');
});

test('the free mode defaults to ultra-wide, 60s, gesture on, last 30s', () => {
  expect(effectiveSettings('quadra', prefs())).toEqual({
    lens: 'ultraWide',
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
    lens: 'wide',
    voiceEnabled: true,
  });
});

test('games saved with an old sport keep their label, and everything maps to the one mode on offer', () => {
  expect(MODE_LABEL.beachTennis).toBe('Beach tennis');
  expect(MODE_LABEL.musculacao).toBe('Musculação');
  expect(MODE_LABEL.quadra).toBe('Gravação');
  for (const id of ['futevolei', 'crossfit', 'academia', 'quadra'] as const) expect(offeredMode(id)).toBe('quadra');
  expect(modeById('academia').label).toBe('Academia');
  expect(modeById('voleiPraia').group).toBe('quadra');
});
