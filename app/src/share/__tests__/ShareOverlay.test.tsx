import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { frameLayout } from '../layout';
import { ShareOverlay } from '../ShareOverlay';

const frame = { width: 1080, height: 1920 };
const layout = frameLayout({ width: 1920, height: 1080 }, frame);

test('every clip carries the app mark, so whoever sees it knows what made it', async () => {
  await render(<ShareOverlay frame={frame} layout={layout} scale={1} />);
  expect(screen.getByText('feito com LANCE')).toBeTruthy();
});

test('the mark ignores the system font size, so the export matches the design', async () => {
  await render(<ShareOverlay frame={frame} layout={layout} scale={1} />);
  expect(screen.getByText('feito com LANCE').props.allowFontScaling).toBe(false);
});

test('the video area stays transparent', async () => {
  await render(<ShareOverlay frame={frame} layout={layout} scale={1} />);
  const area = StyleSheet.flatten(screen.getByTestId('share-video-area').props.style);
  expect(area.backgroundColor).toBeUndefined();
  expect(area.height).toBe(607.5);
});

test('no template text is drawn, only the mark', async () => {
  await render(<ShareOverlay frame={frame} layout={layout} scale={1} />);
  expect(screen.queryByTestId('story-top-block')).toBeNull();
  expect(screen.queryByTestId('story-bottom-block')).toBeNull();
});
