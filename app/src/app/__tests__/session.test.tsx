import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SessionSummary from '../session/[id]';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 's1' }),
}));
jest.mock('../../components/useClipThumbnail', () => ({ useClipThumbnail: () => undefined }));
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    repo: {
      getSession: jest.fn(),
      listClips: jest.fn(),
      sessionStats: jest.fn(),
      renameSession: jest.fn(),
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      version: () => version,
      __change: () => {
        version += 1;
        listeners.forEach((fn) => fn());
      },
    },
  };
});

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
  useSession.mockReturnValue({ reset: jest.fn(), state: {} });
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

test('tapping a clipe opens it', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1)]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: /Clipe 1/ }));
  expect(router.push).toHaveBeenCalledWith('/clip/a');
});

test('re-reads the clipes when one is deleted elsewhere', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  expect(screen.getByRole('button', { name: /Clipe 2/ })).toBeTruthy();

  repo.listClips.mockReturnValue([clip('a', 'gesture', 1)]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 1 });
  await act(async () => repo.__change());

  expect(screen.queryByRole('button', { name: /Clipe 2/ })).toBeNull();
});

test('a game with no clipes says so', async () => {
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 60_000 });
  await render(<SessionSummary />);
  expect(screen.getByText('Nenhum clipe salvo nesta gravação.')).toBeTruthy();
});

test('Nova gravação resets the session and goes back to setup', async () => {
  const reset = jest.fn();
  useSession.mockReturnValue({ reset, state: { sessionId: 's1' } });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Nova gravação' }));
  expect(reset).toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith('/setup');
});

test('typing a name and submitting renames the game', async () => {
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  const input = screen.getByLabelText('Nome da gravação');
  await fireEvent.changeText(input, 'Final do torneio');
  await fireEvent(input, 'submitEditing');
  expect(repo.renameSession).toHaveBeenCalledWith('s1', 'Final do torneio');
});

test('a named game shows its name as the title', async () => {
  repo.getSession.mockReturnValue({ id: 's1', sport: 'futevolei', startedAt: 0, name: 'Final do torneio' });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  expect(screen.getByRole('header')).toHaveTextContent('Final do torneio');
});

test("Postar um clipe opens the newest clipe's editor", async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Postar um clipe' }));
  expect(router.push).toHaveBeenCalledWith('/clip/b');
});

test('Nova gravação from a past game goes back to the existing setup without touching the current session', async () => {
  const reset = jest.fn();
  useSession.mockReturnValue({ reset, state: { sessionId: 'other' } });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Nova gravação' }));
  expect(reset).not.toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith('/setup');
});

test('a named clip is identified by its name in the recording', async () => {
  repo.listClips.mockReturnValue([{ ...clip('a', 'gesture', 1), name: 'Ace no fundo' }, clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  expect(screen.getByText('Ace no fundo')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Clipe 1 · Ace no fundo/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Clipe 2,/ })).toBeTruthy();
});
