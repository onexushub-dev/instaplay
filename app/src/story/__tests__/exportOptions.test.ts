import { exportOptions } from '../exportOptions';

const trim = { startMs: 30000, endMs: 60000 };

test('pro exports 1080x1920 without watermark', () => {
  expect(exportOptions('pro', undefined, trim)).toEqual({
    width: 1080, height: 1920, startMs: 30000, endMs: 60000, speed: 1, muted: false, watermark: false,
  });
});

test('slow motion halves the speed and drops the sound', () => {
  expect(exportOptions('pro', { slowmo: true, muted: false }, trim)).toMatchObject({ speed: 0.5, muted: true });
});

test('muted keeps normal speed', () => {
  expect(exportOptions('pro', { slowmo: false, muted: true }, trim)).toMatchObject({ speed: 1, muted: true });
});

test('free exports 720x1280 with the watermark', () => {
  expect(exportOptions('free', undefined, trim)).toMatchObject({ width: 720, height: 1280, watermark: true });
});
