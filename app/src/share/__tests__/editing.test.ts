import { clampZoom, cropRect, MAX_ZOOM, outputMs, panZoom, pinchZoom, readEdit } from '../editing';

test('a clip with no edit plays at normal speed, with sound and no zoom', () => {
  expect(readEdit(undefined)).toEqual({ speed: 1, muted: false, zoom: undefined });
});

test('clips saved with the old slow motion switch read as 0.5x', () => {
  expect(readEdit({ slowmo: true, muted: false }).speed).toBe(0.5);
  expect(readEdit({ slowmo: false, muted: true })).toMatchObject({ speed: 1, muted: true });
});

test('a chosen speed wins over the old switch', () => {
  expect(readEdit({ slowmo: true, speed: 2, muted: false }).speed).toBe(2);
});

test('the result lasts the cut divided by the speed', () => {
  const trim = { startMs: 10_000, endMs: 22_000 };
  expect(outputMs(trim, 1)).toBe(12_000);
  expect(outputMs(trim, 2)).toBe(6_000);
  expect(outputMs(trim, 0.5)).toBe(24_000);
});

test('zoom never goes below 1x or above the maximum', () => {
  expect(clampZoom({ scale: 0.4, cx: 0.5, cy: 0.5 }).scale).toBe(1);
  expect(clampZoom({ scale: 99, cx: 0.5, cy: 0.5 }).scale).toBe(MAX_ZOOM);
});

test('the zoom window stays inside the video', () => {
  expect(clampZoom({ scale: 2, cx: 0, cy: 1 })).toEqual({ scale: 2, cx: 0.25, cy: 0.75 });
  expect(clampZoom({ scale: 1, cx: 0.9, cy: 0.1 })).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
});

test('the crop is the visible part of the video, in 0..1', () => {
  expect(cropRect({ scale: 2, cx: 0.25, cy: 0.75 })).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 });
});

test('pinching scales the zoom from where it was', () => {
  expect(pinchZoom({ scale: 2, cx: 0.5, cy: 0.5 }, 1.5)).toEqual({ scale: 3, cx: 0.5, cy: 0.5 });
  expect(pinchZoom({ scale: 3, cx: 0.5, cy: 0.5 }, 0.1).scale).toBe(1);
});

test('dragging moves the window the opposite way, scaled by the zoom', () => {
  // fingers move a quarter of the width to the right: the picture follows, so the window moves left
  expect(panZoom({ scale: 2, cx: 0.5, cy: 0.5 }, 0.25, 0)).toEqual({ scale: 2, cx: 0.375, cy: 0.5 });
});

test('dragging does nothing without zoom', () => {
  expect(panZoom({ scale: 1, cx: 0.5, cy: 0.5 }, 0.3, 0.3)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
});
