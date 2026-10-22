import { render, screen } from '@testing-library/react-native';

import type { Clip } from '../../data/schema';
import { ClipCard } from '../ClipCard';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('../useClipThumbnail', () => ({ useClipThumbnail: () => undefined }));

const clip: Clip = {
  id: 'c1', sessionId: 's1', createdAt: 0, source: 'gesture', path: '/c1.mp4', durationMs: 30000,
  trim: { startMs: 0, endMs: 30000 },
};

test('a clip that was not sent anywhere has no badge', async () => {
  await render(<ClipCard clip={clip} number={1} onPress={() => {}} />);
  expect(screen.queryByText('Na galeria')).toBeNull();
  expect(screen.queryByText('Compartilhado')).toBeNull();
});

test('a saved clip says it is in the gallery', async () => {
  await render(<ClipCard clip={{ ...clip, savedAt: 1 }} number={1} onPress={() => {}} />);
  expect(screen.getByText('Na galeria')).toBeTruthy();
});

test('a shared clip says so, and saving wins when both happened', async () => {
  const { rerender } = await render(<ClipCard clip={{ ...clip, sharedAt: 1 }} number={1} onPress={() => {}} />);
  expect(screen.getByText('Compartilhado')).toBeTruthy();
  await rerender(<ClipCard clip={{ ...clip, sharedAt: 1, savedAt: 2 }} number={1} onPress={() => {}} />);
  expect(screen.getByText('Na galeria')).toBeTruthy();
});

test('the card is never labeled or tagged as blocked', async () => {
  await render(<ClipCard clip={clip} number={1} onPress={() => {}} />);
  expect(screen.getByRole('button', { name: /^Clipe 1/ }).props.accessibilityLabel).not.toMatch(/, bloqueado$/);
  expect(screen.queryByText('BLOQUEADO')).toBeNull();
});
