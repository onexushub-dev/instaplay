import { storyLayout } from '../layout';

test('storyLayout fits a 16:9 video in the middle of 9:16', () => {
  const l = storyLayout({ width: 1920, height: 1080 }, { width: 1080, height: 1920 });
  expect(l.video).toEqual({ x: 0, y: 656.25, width: 1080, height: 607.5 });
  expect(l.top).toEqual({ x: 0, y: 0, width: 1080, height: 656.25 });
  expect(l.bottom).toEqual({ x: 0, y: 1263.75, width: 1080, height: 656.25 });
});

test('storyLayout handles a portrait video', () => {
  const l = storyLayout({ width: 1080, height: 1920 }, { width: 1080, height: 1920 });
  expect(l.video).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  expect(l.top.height).toBe(0);
  expect(l.bottom.height).toBe(0);
});
