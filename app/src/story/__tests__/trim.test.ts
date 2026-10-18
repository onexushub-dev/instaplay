import { clampTrim } from '../trim';

test('clampTrim keeps the window inside the clip', () => {
  expect(clampTrim({ startMs: -5000, endMs: 20000 }, 60000, 'start')).toEqual({ startMs: 0, endMs: 20000 });
  expect(clampTrim({ startMs: 40000, endMs: 70000 }, 60000, 'end')).toEqual({ startMs: 40000, endMs: 60000 });
});

test('clampTrim enforces a 3s minimum by moving the dragged handle back', () => {
  expect(clampTrim({ startMs: 19000, endMs: 20000 }, 60000, 'start')).toEqual({ startMs: 17000, endMs: 20000 });
  expect(clampTrim({ startMs: 19000, endMs: 20000 }, 60000, 'end')).toEqual({ startMs: 19000, endMs: 22000 });
});

test('clampTrim enforces a 60s maximum', () => {
  expect(clampTrim({ startMs: 0, endMs: 90000 }, 120000, 'end')).toEqual({ startMs: 0, endMs: 60000 });
});

test('a clip shorter than 3s keeps its whole length', () => {
  expect(clampTrim({ startMs: 500, endMs: 1000 }, 2000, 'start')).toEqual({ startMs: 0, endMs: 2000 });
});
