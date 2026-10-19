import { fireEvent, render, screen } from '@testing-library/react-native';

import ClipEditor from '../clip/[id]';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ id: 'c1' }) }));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ addListener: () => ({ remove() {} }), play() {}, currentTime: 0 }),
  VideoView: () => null,
}));
jest.mock('../../components/TrimBar', () => {
  const props: { last?: any } = {};
  return { __props: props, TrimBar: (p: any) => ((props.last = p), null) };
});
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
      getPrefs: () => jest.requireActual('../../data/schema').DEFAULT_PREFS,
      getSession: () => ({ id: 's1', sport: clip?.durationMs > 60000 ? 'musculacao' : 'beachTennis', startedAt: 0 }),
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

test('shows which clipe it is', async () => {
  await render(<ClipEditor />);
  expect(screen.getByText('Clipe #1 · 19:40')).toBeTruthy();
  expect(screen.getByText('Corte: 0:30')).toBeTruthy();
});

test('toggling slow motion stores it on the clip', async () => {
  await render(<ClipEditor />);
  await fireEvent.press(screen.getByRole('button', { name: 'Câmera lenta' }));
  expect(repo.updateClip).toHaveBeenCalledWith('c1', { edit: { slowmo: true, muted: false } });
});

test('toggling sound stores muted', async () => {
  __setClip({ id: 'c1', sessionId: 's1', createdAt: 0, source: 'gesture', path: '/c1.mp4', durationMs: 60000,
    trim: { startMs: 30000, endMs: 60000 } });
  await render(<ClipEditor />);
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { slowmo: false, muted: true } });
});

test('Salvar opens the save and share screen', async () => {
  await render(<ClipEditor />);
  await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
  expect(router.push).toHaveBeenCalledWith('/share/c1');
});

test('a missing clip shows the message instead of the editor', async () => {
  __setClip(undefined);
  await render(<ClipEditor />);
  expect(screen.getByText('Este clipe não está mais no celular.')).toBeTruthy();
});

test('with slow motion on, sound shows as off and cannot be turned on', async () => {
  __setClip({ id: 'c1', sessionId: 's1', createdAt: 0, source: 'gesture', path: '/c1.mp4', durationMs: 60000,
    trim: { startMs: 30000, endMs: 60000 }, edit: { slowmo: true, muted: false } });
  await render(<ClipEditor />);
  expect(screen.getByRole('button', { name: 'Som' })).toBeDisabled();
  expect(screen.getByText('Sem som')).toBeTruthy();
});

test('a gym clip allows cuts up to 120s', async () => {
  __setClip({ id: 'c1', sessionId: 's1', createdAt: 0, source: 'voice', path: '/c1.mp4', durationMs: 120000,
    trim: { startMs: 60000, endMs: 120000 } });
  await render(<ClipEditor />);
  expect(jest.requireMock('../../components/TrimBar').__props.last.maxMs).toBe(120000);
});

test('a named clip shows its name instead of the number', async () => {
  __setClip({ id: 'c1', sessionId: 's1', createdAt: 0, source: 'gesture', path: '/c1.mp4', durationMs: 60000,
    trim: { startMs: 30000, endMs: 60000 }, name: 'Ace no fundo' });
  await render(<ClipEditor />);
  expect(screen.getByText('Ace no fundo')).toBeTruthy();
});
