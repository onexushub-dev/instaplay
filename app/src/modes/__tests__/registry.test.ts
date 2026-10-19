import { MODE_LABEL } from '../../components/format';
import { DEFAULT_PREFS, type Prefs } from '../../data/schema';
import { effectiveSettings, MODES, modeById, modesIn, withModeOverride } from '../registry';

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULT_PREFS, ...over });

test('every mode has a label, group, guide and tip', () => {
  expect(MODES.map((m) => m.id)).toEqual([
    'beachTennis', 'futevolei', 'voleiPraia', 'outro', 'musculacao', 'crossfit', 'funcional', 'outroAcademia',
  ]);
  for (const m of MODES) {
    expect(m.label).toBeTruthy();
    expect(['quadra', 'academia']).toContain(m.group);
    expect(m.tip).toBeTruthy();
  }
  expect(modesIn('academia').map((m) => m.id)).toEqual(['musculacao', 'crossfit', 'funcional', 'outroAcademia']);
});

test('gym modes default the gesture off, voice on, 1x, 120s at 1080p30, last 60s', () => {
  expect(effectiveSettings('musculacao', prefs())).toEqual({
    lens: 'wide', gestureEnabled: false, voiceEnabled: true, bufferSeconds: 120, cutSeconds: 60, quality: '1080p30',
  });
  expect(modeById('crossfit').guide).toBe('person');
  expect(modeById('crossfit').storyTemplates).toEqual(['treino', 'recorde', 'minimal']);
});

test('court modes default to ultra-wide, 60s, gesture on', () => {
  expect(effectiveSettings('beachTennis', prefs())).toEqual({
    lens: 'ultraWide', gestureEnabled: true, voiceEnabled: false, bufferSeconds: 60, cutSeconds: 30, quality: '1080p60',
  });
  expect(modeById('futevolei').guide).toBe('court');
  expect(modeById('futevolei').storyTemplates).toEqual(['placar', 'minimal', 'arena']);
});

test('overrides are per mode', () => {
  const p = prefs(withModeOverride(prefs(), 'musculacao', { gestureEnabled: true }));
  expect(effectiveSettings('musculacao', p).gestureEnabled).toBe(true);
  expect(effectiveSettings('crossfit', p).gestureEnabled).toBe(false);
  expect(effectiveSettings('beachTennis', p).gestureEnabled).toBe(true);
});

test('old global prefs apply to court modes only', () => {
  const p = prefs({ lens: 'wide', voiceEnabled: true });
  expect(effectiveSettings('futevolei', p)).toMatchObject({ lens: 'wide', voiceEnabled: true });
  expect(effectiveSettings('musculacao', p).lens).toBe('wide'); // gym default anyway
  expect(effectiveSettings('crossfit', prefs({ gestureEnabled: true })).gestureEnabled).toBe(false);
});

test('old sessions keep their label', () => {
  expect(MODE_LABEL.beachTennis).toBe('Beach tennis');
  expect(MODE_LABEL.outro).toBe('Outro');
  expect(MODE_LABEL.musculacao).toBe('Musculação');
});
