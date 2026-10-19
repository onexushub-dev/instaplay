import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { storyLayout } from '../layout';
import { StoryOverlay } from '../StoryOverlay';

const frame = { width: 1080, height: 1920 };
const layout = storyLayout({ width: 1920, height: 1080 }, frame);
const texts = { top: ['BEACH TENNIS', '17 OUT · 19:40'], bottom: ['QUE LANCE', 'Arena Sol'] };

test('draws the template lines in the bands', async () => {
  await render(<StoryOverlay frame={frame} layout={layout} texts={texts} watermark={false} scale={1} />);
  expect(screen.getByText('BEACH TENNIS')).toBeTruthy();
  expect(screen.getByText('QUE LANCE')).toBeTruthy();
  expect(screen.getByText('Arena Sol')).toBeTruthy();
});

test('the watermark appears only when asked', async () => {
  const view = await render(<StoryOverlay frame={frame} layout={layout} texts={texts} watermark={false} scale={1} />);
  expect(screen.queryByText('feito com LANCE')).toBeNull();
  await view.rerender(<StoryOverlay frame={frame} layout={layout} texts={texts} watermark scale={1} />);
  expect(screen.getByText('feito com LANCE')).toBeTruthy();
});

test('the video area stays transparent', async () => {
  await render(<StoryOverlay frame={frame} layout={layout} texts={texts} watermark={false} scale={1} />);
  const area = StyleSheet.flatten(screen.getByTestId('story-video-area').props.style);
  expect(area.backgroundColor).toBeUndefined();
  expect(area.height).toBe(607.5);
});

test('templates stay visible on a portrait video (no bands)', async () => {
  const portrait = storyLayout({ width: 1080, height: 1920 }, frame);
  await render(<StoryOverlay frame={frame} layout={portrait} texts={texts} watermark={false} scale={1} />);
  // Text blocks sit in Instagram's safe area over the video, not inside the zero-height bands.
  const top = StyleSheet.flatten(screen.getByTestId('story-top-block').props.style);
  const bottom = StyleSheet.flatten(screen.getByTestId('story-bottom-block').props.style);
  expect(top.top).toBe(250);
  expect(bottom.bottom).toBe(340);
  expect(screen.getByText('BEACH TENNIS')).toBeTruthy();
});

test('Story text ignores the system font size, so the export matches the design', async () => {
  await render(<StoryOverlay frame={frame} layout={layout} texts={texts} watermark scale={1} />);
  for (const t of ['BEACH TENNIS', 'QUE LANCE', 'Arena Sol', 'feito com LANCE']) {
    expect(screen.getByText(t).props.allowFontScaling).toBe(false);
  }
});
