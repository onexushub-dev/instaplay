import { thumbnailPath } from '../thumbnailPath';

test('the thumbnail sits next to the clip with a .jpg extension', () => {
  expect(thumbnailPath('/docs/clips/ABC.mp4')).toBe('/docs/clips/ABC.jpg');
});
