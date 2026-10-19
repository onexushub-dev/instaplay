import { MODE_LABEL } from '../../components/format';
import { DEFAULT_PREFS, type Prefs } from '../../data/schema';
import { effectiveSettings, MODES, modeById, offeredMode, withModeOverride } from '../registry';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

test('the app offers two modes: Quadra and Academia', () => {
  expect(MODES.map((m) => [m.id, m.label, m.group, m.guide])).toEqual([
    ['quadra', 'Quadra', 'quadra', 'court'],
    ['academia', 'Academia', 'academia', 'person'],
  ]);
  expect(DEFAULT_PREFS.sport).toBe('quadra');
});

test('academia defaults the gesture off, voice on, 1x, 120s at 1080p30, last 60s', () => {
  expect(effectiveSettings('academia', prefs())).toEqual({
    lens: 'wide',
    gestureEnabled: false,
    voiceEnabled: true,
    bufferSeconds: 120,
    cutSeconds: 60,
    quality: '1080p30',
  });
});

test('quadra defaults to ultra-wide, 60s, gesture on', () => {
  expect(effectiveSettings('quadra', prefs())).toEqual({
    lens: 'ultraWide',
    gestureEnabled: true,
    voiceEnabled: false,
    bufferSeconds: 60,
    cutSeconds: 30,
    quality: '1080p60',
  });
});

test('overrides are per mode', () => {
  const p = prefs(withModeOverride(prefs(), 'academia', { gestureEnabled: true }));
  expect(effectiveSettings('academia', p).gestureEnabled).toBe(true);
  expect(effectiveSettings('quadra', prefs({ gestureEnabled: false })).gestureEnabled).toBe(false);
  expect(effectiveSettings('quadra', prefs(withModeOverride(prefs(), 'academia', { lens: 'ultraWide' }))).lens).toBe(
    'ultraWide',
  );
  expect(effectiveSettings('academia', prefs(withModeOverride(prefs(), 'quadra', { lens: 'wide' }))).lens).toBe('wide');
  expect(
    effectiveSettings('academia', prefs(withModeOverride(prefs(), 'quadra', { gestureEnabled: true }))).gestureEnabled,
  ).toBe(false);
});

test('old global prefs apply to Quadra only', () => {
  const p = prefs({ lens: 'wide', voiceEnabled: true });
  expect(effectiveSettings('quadra', p)).toMatchObject({ lens: 'wide', voiceEnabled: true });
  expect(effectiveSettings('academia', prefs({ gestureEnabled: true })).gestureEnabled).toBe(false);
});

test('games saved with a sport keep their label and follow their group', () => {
  expect(MODE_LABEL.beachTennis).toBe('Beach tennis');
  expect(MODE_LABEL.musculacao).toBe('Musculação');
  expect(offeredMode('futevolei')).toBe('quadra');
  expect(offeredMode('crossfit')).toBe('academia');
  expect(offeredMode('academia')).toBe('academia');
  const p = prefs(withModeOverride(prefs(), 'academia', { gestureEnabled: true }));
  expect(effectiveSettings('crossfit', p)).toEqual(effectiveSettings('academia', p));
  expect(modeById('voleiPraia').group).toBe('quadra');
});
