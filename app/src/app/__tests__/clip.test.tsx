import { fireEvent, render, screen } from '@testing-library/react-native';

import ClipEditor from '../clip/[id]';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ id: 'c1' }) }));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ addListener: () => ({ remove() {} }), play() {}, currentTime: 0 }),
  VideoView: () => null,
}));
jest.mock('../../data/mmkv', () => {
  let clip: any = {
    id: 'c1', sessionId: 's1', createdAt: new Date(2026, 9, 17, 19, 40).getTime(), source: 'gesture',
    path: '/c1.mp4', durationMs: 60000, trim: { startMs: 30000, endMs: 60000 },
  };
  return {
    __setClip: (c: any) => (clip = c),
    removeFile: jest.fn(),
    repo: {
      getClip: () => clip,
      listClips: () => (clip ? [clip] : []),
      updateClip: jest.fn((id: string, patch: object) => (clip = { ...clip, ...patch })),
      deleteClip: jest.fn(),
      subscribe: () => () => {},
      version: () => 0,
    },
  };
});

const { repo, __setClip } = jest.requireMock('../../data/mmkv');
const { router } = jest.requireMock('expo-router');

beforeEach(() => jest.clearAllMocks());

test('shows which lance it is', async () => {
  await render(<ClipEditor />);
  expect(screen.getByText('Lance #1 · 19:40')).toBeTruthy();
  expect(screen.getByText('Corte: 0:30')).toBeTruthy();
});

test('toggling slow motion stores it on the clip', async () => {
  await render(<ClipEditor />);
  await fireEvent.press(screen.getByRole('button', { name: 'Câmera lenta' }));
  expect(repo.updateClip).toHaveBeenCalledWith('c1', { edit: { slowmo: true, muted: false } });
});

test('toggling sound stores muted', async () => {
  await render(<ClipEditor />);
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { slowmo: true, muted: true } });
});

test('Próximo: Story opens the story screen', async () => {
  await render(<ClipEditor />);
  await fireEvent.press(screen.getByRole('button', { name: 'Próximo: Story' }));
  expect(router.push).toHaveBeenCalledWith('/story/c1');
});

test('a missing clip shows the message instead of the editor', async () => {
  __setClip(undefined);
  await render(<ClipEditor />);
  expect(screen.getByText('Este lance não está mais no celular.')).toBeTruthy();
});
