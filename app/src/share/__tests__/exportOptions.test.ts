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

test('free keeps the app mark', () => {
  expect(exportOptions('free', undefined, trim).watermark).toBe(true);
});

test.each(['pass', 'pro'] as const)('%s exports without the app mark', (tier) => {
  expect(exportOptions(tier, undefined, trim).watermark).toBe(false);
});

test('pass exports 1080x1920', () => {
  expect(exportOptions('pass', undefined, trim)).toMatchObject({ width: 1080, height: 1920 });
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

test('a turned clip exports with its rotation, and none by default', () => {
  expect(exportOptions('pro', undefined, trim).rotation).toBe(0);
  expect(exportOptions('pro', { speed: 1, muted: false, rotation: 90 }, trim).rotation).toBe(90);
});
