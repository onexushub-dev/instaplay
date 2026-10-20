import { resolveLocale, voiceLocale } from '../locale';

test.each([
  [['pt-BR'], 'pt-BR'],
  [['pt-PT'], 'pt-BR'],
  [['en-US'], 'en'],
  [['es-ES'], 'en'],
  [['es-ES', 'pt-BR'], 'pt-BR'],
  [['en-GB', 'pt-BR'], 'en'],
  [['fr-FR', 'de-DE'], 'en'],
  [[], 'en'],
  [['PT_br'], 'pt-BR'],
  [['pt'], 'pt-BR'],
])('resolveLocale(%j) is %s', (tags, expected) => {
  expect(resolveLocale(tags)).toBe(expected);
});

test('the voice recognizer runs in the app language', () => {
  expect(voiceLocale('pt-BR')).toBe('pt-BR');
  expect(voiceLocale('en')).toBe('en-US');
});
