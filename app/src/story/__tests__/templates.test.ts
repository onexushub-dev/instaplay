import { storyTexts } from '../templates';

const at = new Date(2026, 9, 17, 19, 40).getTime();

test('placar', () => {
  expect(storyTexts('placar', { sport: 'beachTennis', startedAt: at, arena: 'Arena Sol' })).toEqual({
    top: ['BEACH TENNIS', '17 OUT · 19:40'],
    bottom: ['QUE LANCE', 'Arena Sol'],
  });
  expect(storyTexts('placar', { sport: 'futevolei', startedAt: at, gameName: 'Final' }).bottom).toEqual([
    'QUE LANCE',
    'Final',
  ]);
  expect(storyTexts('placar', { sport: 'futevolei', startedAt: at }).bottom).toEqual(['QUE LANCE', '']);
});

test('minimal', () => {
  expect(storyTexts('minimal', { sport: 'voleiPraia', startedAt: at })).toEqual({
    top: [],
    bottom: ['VÔLEI DE PRAIA · 17/10'],
  });
});

test('arena', () => {
  expect(storyTexts('arena', { sport: 'outro', startedAt: at })).toEqual({
    top: ['SUA ARENA'],
    bottom: ['OUTRO', '17 OUT'],
  });
});

test('treino', () => {
  expect(storyTexts('treino', { sport: 'musculacao', startedAt: at, arena: 'Supino · 100 kg' })).toEqual({
    top: ['MUSCULAÇÃO', '17 OUT'],
    bottom: ['TREINO', 'Supino · 100 kg'],
  });
});

test('recorde', () => {
  expect(storyTexts('recorde', { sport: 'crossfit', startedAt: at, arena: 'Clean · 80 kg' })).toEqual({
    top: ['CROSSFIT'],
    bottom: ['RECORDE PESSOAL', 'Clean · 80 kg'],
  });
});

test('Quadra and Academia games print no sport name, only the date', () => {
  const at = new Date(2026, 9, 17, 18, 5).getTime();
  expect(storyTexts('placar', { sport: 'quadra', startedAt: at })).toEqual({
    top: ['17 OUT · 18:05'],
    bottom: ['QUE LANCE', ''],
  });
  expect(storyTexts('minimal', { sport: 'quadra', startedAt: at })).toEqual({ top: [], bottom: ['17/10'] });
  expect(storyTexts('arena', { sport: 'quadra', startedAt: at })).toEqual({ top: ['SUA ARENA'], bottom: ['17 OUT'] });
  expect(storyTexts('treino', { sport: 'academia', startedAt: at, arena: 'Supino · 100 kg' })).toEqual({
    top: ['17 OUT'],
    bottom: ['TREINO', 'Supino · 100 kg'],
  });
  expect(storyTexts('recorde', { sport: 'academia', startedAt: at })).toEqual({
    top: [],
    bottom: ['RECORDE PESSOAL', ''],
  });
});
