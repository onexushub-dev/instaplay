import { storyTexts } from '../templates';

const at = new Date(2026, 9, 17, 19, 40).getTime();

test('placar', () => {
  expect(storyTexts('placar', { sport: 'beachTennis', startedAt: at, arena: 'Arena Sol' })).toEqual({
    top: ['BEACH TENNIS', '17 OUT · 19:40'],
    bottom: ['QUE LANCE', 'Arena Sol'],
  });
  expect(storyTexts('placar', { sport: 'futevolei', startedAt: at, gameName: 'Final' }).bottom).toEqual(['QUE LANCE', 'Final']);
  expect(storyTexts('placar', { sport: 'futevolei', startedAt: at }).bottom).toEqual(['QUE LANCE', '']);
});

test('minimal', () => {
  expect(storyTexts('minimal', { sport: 'voleiPraia', startedAt: at })).toEqual({ top: [], bottom: ['VÔLEI DE PRAIA · 17/10'] });
});

test('arena', () => {
  expect(storyTexts('arena', { sport: 'outro', startedAt: at })).toEqual({ top: ['SUA ARENA'], bottom: ['OUTRO', '17 OUT'] });
});
