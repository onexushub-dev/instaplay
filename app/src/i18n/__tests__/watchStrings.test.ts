/// <reference types="node" />
import fs from 'fs';
import path from 'path';

// The watch app's texts are English keys in ContentView.swift, translated in targets/watch/Localizable.xcstrings.
const WATCH = path.join(__dirname, '..', '..', '..', 'targets', 'watch');
const view = fs.readFileSync(path.join(WATCH, 'ContentView.swift'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(WATCH, 'Localizable.xcstrings'), 'utf8'));

type Unit = { stringUnit: { value: string } };
type Localization = Unit | { variations: { plural: Record<string, Unit> } };

/** The keys SwiftUI looks up: Text("…") and Message("…") literals, with "\(x)" interpolations as %lld. */
function usedKeys(source: string): string[] {
  const keys = [...source.matchAll(/\b(?:Text|Message)\("((?:[^"\\]|\\.)*)"\)/g)].map((m) =>
    m[1].replace(/\\\([^)]*\)/g, '%lld'),
  );
  return [...new Set(keys)].sort();
}

test('every text the watch shows is in the catalog, in English and Portuguese', () => {
  const keys = usedKeys(view);
  expect(keys).toEqual(
    expect.arrayContaining(['%lld clips', 'No connection to your iPhone', 'Save', 'Start recording on your iPhone']),
  );
  expect(catalog.sourceLanguage).toBe('en');
  for (const key of keys) {
    const entry = catalog.strings[key];
    expect([key, entry !== undefined]).toEqual([key, true]);
    expect([key, Object.keys(entry.localizations).sort()]).toEqual([key, ['en', 'pt-BR']]);
  }
});

test('the catalog has no key the watch does not use', () => {
  expect(Object.keys(catalog.strings).sort()).toEqual(usedKeys(view));
});

test('the clip count is a plural in both languages', () => {
  const loc: Record<string, Localization> = catalog.strings['%lld clips'].localizations;
  const forms = (l: Localization) =>
    'variations' in l ? Object.fromEntries(Object.entries(l.variations.plural).map(([k, v]) => [k, v.stringUnit.value])) : {};
  expect(forms(loc.en)).toEqual({ one: '%lld clip', other: '%lld clips' });
  expect(forms(loc['pt-BR'])).toEqual({ one: '%lld clipe', other: '%lld clipes' });
});

test('the Portuguese copy is what the watch said before', () => {
  const pt = (key: string) => (catalog.strings[key].localizations['pt-BR'] as Unit).stringUnit.value;
  expect(pt('Save')).toBe('Salvar');
  expect(pt('Start recording on your iPhone')).toBe('Comece a gravar no iPhone');
  expect(pt('No connection to your iPhone')).toBe('Sem conexão com o iPhone');
  expect(pt('View camera')).toBe('Ver câmera');
  expect(pt('Close camera')).toBe('Fechar câmera');
  expect(pt('Saved')).toBe('Salvo');
  expect(pt('Not saved')).toBe('Não salvou');
});

test('no Portuguese is left hard-coded in the watch view', () => {
  const literals = [...view.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  expect(literals.filter((s) => /[À-ÿ]/.test(s))).toEqual([]);
});
