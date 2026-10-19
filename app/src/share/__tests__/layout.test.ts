import { frameLayout } from '../layout';

test('frameLayout fits a 16:9 video in the middle of 9:16', () => {
  const l = frameLayout({ width: 1920, height: 1080 }, { width: 1080, height: 1920 });
  expect(l.video).toEqual({ x: 0, y: 656.25, width: 1080, height: 607.5 });
  expect(l.top).toEqual({ x: 0, y: 0, width: 1080, height: 656.25 });
  expect(l.bottom).toEqual({ x: 0, y: 1263.75, width: 1080, height: 656.25 });
});

test('frameLayout handles a portrait video', () => {
  const l = frameLayout({ width: 1080, height: 1920 }, { width: 1080, height: 1920 });
  expect(l.video).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  expect(l.top.height).toBe(0);
  expect(l.bottom.height).toBe(0);
});
