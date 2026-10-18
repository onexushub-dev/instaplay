import { sessionLabel } from '../format';

test('sessionLabel uses the name, else sport and date', () => {
  const at = new Date(2026, 9, 17, 18, 40).getTime();
  expect(sessionLabel({ id: 's', sport: 'futevolei', startedAt: at, name: 'Final' })).toBe('Final');
  expect(sessionLabel({ id: 's', sport: 'futevolei', startedAt: at }, new Date(2026, 9, 20).getTime())).toBe(
    'Futevôlei · 17/10, 18:40'
  );
});
