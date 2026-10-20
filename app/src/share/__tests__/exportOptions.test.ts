import { exportOptions } from '../exportOptions';

const trim = { startMs: 30000, endMs: 60000 };

test('pro exports 1080x1920', () => {
  expect(exportOptions('pro', undefined, trim)).toMatchObject({
    width: 1080,
    height: 1920,
    startMs: 30000,
    endMs: 60000,
    speed: 1,
    muted: false,
  });
});

test('the app mark is always on, for every tier', () => {
  expect(exportOptions('pro', undefined, trim).watermark).toBe(true);
  expect(exportOptions('free', undefined, trim).watermark).toBe(true);
});

test('slow motion halves the speed and drops the sound', () => {
  expect(exportOptions('pro', { slowmo: true, muted: false }, trim)).toMatchObject({ speed: 0.5, muted: true });
});

test.each([1.5, 2])('%sx keeps the chosen speed and drops the sound', (speed) => {
  expect(exportOptions('pro', { speed: speed as 1.5 | 2, muted: false }, trim)).toMatchObject({ speed, muted: true });
});

test('no zoom means no crop', () => {
  expect(exportOptions('pro', undefined, trim).crop).toBeUndefined();
  expect(exportOptions('pro', { speed: 1, muted: false, zoom: { scale: 1, cx: 0.5, cy: 0.5 } }, trim).crop).toBeUndefined();
});

test('a zoom exports the visible part of the video', () => {
  const edit = { speed: 1 as const, muted: false, zoom: { scale: 2, cx: 0.25, cy: 0.75 } };
  expect(exportOptions('pro', edit, trim).crop).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 });
});

test('muted keeps normal speed', () => {
  expect(exportOptions('pro', { slowmo: false, muted: true }, trim)).toMatchObject({ speed: 1, muted: true });
});

test('free exports 720x1280', () => {
  expect(exportOptions('free', undefined, trim)).toMatchObject({ width: 720, height: 1280 });
});
