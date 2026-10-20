import { SOURCE_LABEL } from '../sourceLabel';

test('every way of saving has a label the player can read', () => {
  expect(SOURCE_LABEL.phone).toBe('Celular');
  expect(SOURCE_LABEL.watch).toBe('Relógio');
  expect(Object.keys(SOURCE_LABEL).sort()).toEqual(['gesture', 'phone', 'remote', 'screen', 'voice', 'watch']);
});
