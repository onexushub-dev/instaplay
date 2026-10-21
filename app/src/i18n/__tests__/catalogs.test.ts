import { catalogs, currentLocale, setLocale, t, translate } from '..';
import { en } from '../locales/en';
import { ptBR } from '../locales/pt-BR';

type Tree = { [key: string]: string | Tree };

const isPlural = (v: unknown): v is { one: string; other: string } =>
  typeof v === 'object' && v !== null && 'one' in v && 'other' in v;

/** Every leaf as [path, value]; a plural's forms are leaves of their own (`summary.clips.one`). */
function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`),
  );
}

const placeholders = (text: string) => [...text.matchAll(/%\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLocale('pt-BR'));

test('pt-BR has exactly the keys of en', () => {
  expect(leaves(ptBR as unknown as Tree).map(([k]) => k)).toEqual(leaves(en as unknown as Tree).map(([k]) => k));
});

test('every text has the same placeholders in both languages', () => {
  const pt = new Map(leaves(ptBR as unknown as Tree));
  for (const [key, text] of leaves(en as unknown as Tree)) {
    expect([key, placeholders(pt.get(key)!)]).toEqual([key, placeholders(text)]);
  }
});

test('plurals have exactly one and other', () => {
  const walk = (tree: Tree) => {
    for (const v of Object.values(tree)) {
      if (typeof v === 'string') continue;
      if (isPlural(v)) expect(Object.keys(v).sort()).toEqual(['one', 'other']);
      else walk(v);
    }
  };
  walk(catalogs.en as unknown as Tree);
  walk(catalogs['pt-BR'] as unknown as Tree);
});

test('no text is empty and the brand is never translated', () => {
  for (const [key, text] of [...leaves(en as unknown as Tree), ...leaves(ptBR as unknown as Tree)]) {
    expect([key, text.trim().length > 0]).toEqual([key, true]);
    // The brand is always "LANCE"; lowercase "lance" is the Portuguese word for a play.
    expect([key, /\bLance\b/.test(text)]).toEqual([key, false]);
  }
});

test('plurals: 1 clip / 2 clips, 1 clipe / 2 clipes', () => {
  expect(translate('en', 'summary.clips', { count: 1 })).toBe('1 clip');
  expect(translate('en', 'summary.clips', { count: 2 })).toBe('2 clips');
  expect(translate('en', 'summary.clips', { count: 0 })).toBe('0 clips');
  expect(translate('pt-BR', 'summary.clips', { count: 1 })).toBe('1 clipe');
  expect(translate('pt-BR', 'summary.clips', { count: 2 })).toBe('2 clipes');
  expect(translate('pt-BR', 'summary.clips', { count: 0 })).toBe('0 clipes');
});

test('interpolation fills %{name}', () => {
  expect(translate('en', 'remote.connectingTo', { name: 'iPhone 15' })).toBe('Connecting to iPhone 15…');
  expect(translate('pt-BR', 'remote.connectingTo', { name: 'iPhone 15' })).toBe('Conectando a iPhone 15…');
});

test('the payments notes name the game or the workout', () => {
  const g = { what: translate('en', 'modes.what.quadra') };
  const w = { what: translate('en', 'modes.what.academia') };
  expect(translate('en', 'payments.lastFreeNote', g)).toBe('Last free clip of this game.');
  expect(translate('en', 'payments.lastFreeNote', w)).toBe('Last free clip of this workout.');
  expect(translate('en', 'payments.lockedNote', g)).toBe('Saved. Unlock it after the game.');
  expect(translate('en', 'payments.lockedNote', w)).toBe('Saved. Unlock it after the workout.');
  const pg = { what: translate('pt-BR', 'modes.what.quadra') };
  const pw = { what: translate('pt-BR', 'modes.what.academia') };
  expect(translate('pt-BR', 'payments.lastFreeNote', pg)).toBe('Último clipe grátis deste jogo.');
  expect(translate('pt-BR', 'payments.lastFreeNote', pw)).toBe('Último clipe grátis deste treino.');
  expect(translate('pt-BR', 'payments.lockedNote', pg)).toBe('Guardado. Libere no fim do jogo.');
  expect(translate('pt-BR', 'payments.lockedNote', pw)).toBe('Guardado. Libere no fim do treino.');
});

test('tests run on a pt-BR phone; setLocale switches the plain t', () => {
  expect(currentLocale()).toBe('pt-BR');
  expect(t('common.close')).toBe('Fechar');
  setLocale('en');
  expect(t('common.close')).toBe('Close');
});
