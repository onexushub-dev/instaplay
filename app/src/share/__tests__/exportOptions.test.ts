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

test('muted keeps normal speed', () => {
  expect(exportOptions('pro', { slowmo: false, muted: true }, trim)).toMatchObject({ speed: 1, muted: true });
});

test('free exports 720x1280', () => {
  expect(exportOptions('free', undefined, trim)).toMatchObject({ width: 720, height: 1280 });
});
