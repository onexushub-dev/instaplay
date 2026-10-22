import { clampTrim, clipWindow } from '../trim';

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

test('clampTrim allows up to 120s when asked (gym modes)', () => {
  expect(clampTrim({ startMs: 0, endMs: 100000 }, 120000, 'end', 120000)).toEqual({ startMs: 0, endMs: 100000 });
  expect(clampTrim({ startMs: 0, endMs: 130000 }, 150000, 'end', 120000)).toEqual({ startMs: 0, endMs: 120000 });
});

test('the cut never starts before the floor (the black start of a clip)', () => {
  expect(clampTrim({ startMs: 2000, endMs: 30000 }, 57000, 'start', 60000, 11000)).toEqual({ startMs: 11000, endMs: 30000 });
});

test('with a floor the longest cut counts from the floor and the clip end still bounds it', () => {
  expect(clampTrim({ startMs: 11000, endMs: 70000 }, 57000, 'end', 60000, 11000)).toEqual({ startMs: 11000, endMs: 57000 });
});

test('the shortest cut still applies next to the floor', () => {
  expect(clampTrim({ startMs: 12000, endMs: 13000 }, 57000, 'start', 60000, 11000)).toEqual({ startMs: 10000 + 1000, endMs: 14000 });
});

test('a clip can only use the part of the file it was first saved with', () => {
  const clip = { durationMs: 60000, bounds: { startMs: 47000, endMs: 60000 } };
  expect(clipWindow(clip)).toEqual({ startMs: 47000, endMs: 60000 });
});

test('the window starts after the black start when that is later, and never past the bounds end', () => {
  const clip = { durationMs: 60000, bounds: { startMs: 47000, endMs: 60000 } };
  expect(clipWindow(clip, 50000)).toEqual({ startMs: 50000, endMs: 60000 });
  expect(clipWindow(clip, 10000)).toEqual({ startMs: 47000, endMs: 60000 });
  expect(clipWindow(clip, 90000)).toEqual({ startMs: 60000, endMs: 60000 });
});

test('a clip saved before bounds existed can use the whole file', () => {
  expect(clipWindow({ durationMs: 60000 })).toEqual({ startMs: 0, endMs: 60000 });
  expect(clipWindow({ durationMs: 60000 }, 11000)).toEqual({ startMs: 11000, endMs: 60000 });
});

test('inside a clip window the cut can shrink but never reach the rest of the file', () => {
  const win = clipWindow({ durationMs: 60000, bounds: { startMs: 47000, endMs: 60000 } });
  // dragging the start handle earlier than the window, or the end later
  expect(clampTrim({ startMs: 30000, endMs: 60000 }, win.endMs, 'start', 60000, win.startMs)).toEqual({ startMs: 47000, endMs: 60000 });
  expect(clampTrim({ startMs: 47000, endMs: 75000 }, win.endMs, 'end', 60000, win.startMs)).toEqual({ startMs: 47000, endMs: 60000 });
  // shrinking from the start works
  expect(clampTrim({ startMs: 52000, endMs: 60000 }, win.endMs, 'start', 60000, win.startMs)).toEqual({ startMs: 52000, endMs: 60000 });
});
