import { fireEvent, render, screen } from '@testing-library/react-native';

import SessionSummary from '../session/[id]';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 's1' }),
}));
jest.mock('../../components/useClipThumbnail', () => ({ useClipThumbnail: () => undefined }));
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('../../data/mmkv', () => ({
  repo: { getSession: jest.fn(), listClips: jest.fn(), sessionStats: jest.fn() },
}));

const { repo } = jest.requireMock('../../data/mmkv');
const { router } = jest.requireMock('expo-router');
const { useSession } = jest.requireMock('../../session/SessionContext');

const clip = (id: string, source: string, createdAt: number) => ({
  id,
  sessionId: 's1',
  createdAt,
  source,
  path: `/${id}.mp4`,
  durationMs: 60000,
  trim: { startMs: 30000, endMs: 60000 },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.mockReturnValue({ reset: jest.fn() });
  repo.getSession.mockReturnValue({ id: 's1', sport: 'futevolei', startedAt: new Date(2026, 9, 17, 18, 40).getTime() });
});

test('shows the game stats', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 4, bytes: 92_000_000, recordedMs: (2 * 60 + 14) * 60_000 });
  await render(<SessionSummary />);
  expect(screen.getByText('2h14')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.getByText('92 MB')).toBeTruthy();
  expect(screen.getByText(/Futevôlei ·/)).toBeTruthy();
});

test('tapping a lance opens it', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1)]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: /Lance 1/ }));
  expect(router.push).toHaveBeenCalledWith('/clip/a');
});

test('a game with no lances says so', async () => {
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 60_000 });
  await render(<SessionSummary />);
  expect(screen.getByText('Nenhum lance salvo neste jogo.')).toBeTruthy();
});

test('Novo jogo resets the session and goes back to setup', async () => {
  const reset = jest.fn();
  useSession.mockReturnValue({ reset });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Novo jogo' }));
  expect(reset).toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/setup');
});
