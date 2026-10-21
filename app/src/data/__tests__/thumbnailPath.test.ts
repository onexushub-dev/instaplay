import { thumbnailPath } from '../thumbnailPath';

test('the thumbnail sits next to the clip with a .thumb.jpg extension', () => {
  expect(thumbnailPath('/docs/clips/ABC.mp4')).toBe('/docs/clips/ABC.thumb.jpg');
});
