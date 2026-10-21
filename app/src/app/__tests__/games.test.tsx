import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Games from '../games';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../components/useClipThumbnail', () => ({ useClipThumbnail: () => undefined }));
jest.mock('../../data/mmkv', () => ({
  repo: {
    listSessions: jest.fn(),
    sessionStats: jest.fn(),
    deleteSession: jest.fn(() => ['/c1.mp4']),
    subscribe: () => () => {},
    version: () => 0,
  },
  removeFile: jest.fn(),
}));

const { repo } = jest.requireMock('../../data/mmkv');
const { router } = jest.requireMock('expo-router');

const clip = { id: 'c1', sessionId: 's1', createdAt: 1, source: 'screen', path: '/c1.mp4', durationMs: 1, trim: { startMs: 0, endMs: 1 } };

beforeEach(() => jest.clearAllMocks());

test('lists games with their label and clipe count', async () => {
  repo.listSessions.mockReturnValue([
    { session: { id: 's1', sport: 'futevolei', startedAt: 0, name: 'Final do torneio' }, clips: 3, firstClip: clip },
  ]);
  repo.sessionStats.mockReturnValue({ clips: 3, bytes: 1, recordedMs: 74 * 60_000 });
  await render(<Games />);
  expect(screen.getByText('Final do torneio')).toBeTruthy();
  expect(screen.getByText('3 clipes · 1h14')).toBeTruthy();
});

test('tapping a game opens its summary', async () => {
  repo.listSessions.mockReturnValue([{ session: { id: 's1', sport: 'outro', startedAt: 0 }, clips: 1, firstClip: clip }]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 60_000 });
  await render(<Games />);
  await fireEvent.press(screen.getByRole('button', { name: /1 clipe/ }));
  expect(router.push).toHaveBeenCalledWith('/session/s1');
});

test('empty state', async () => {
  repo.listSessions.mockReturnValue([]);
  await render(<Games />);
  expect(screen.getByText('Nenhuma gravação com clipes ainda.')).toBeTruthy();
});

test('holding a finished game offers to delete it, and deleting removes its files', async () => {
  repo.listSessions.mockReturnValue([
    { session: { id: 's1', sport: 'outro', startedAt: 0, endedAt: 5, name: 'Final' }, clips: 2, firstClip: clip },
  ]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 60_000 });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  await render(<Games />);
  await fireEvent(screen.getByRole('button', { name: /2 clipes/ }), 'longPress');
  expect(alert).toHaveBeenCalledTimes(1);
  expect(repo.deleteSession).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Apagar')!.onPress!());
  expect(repo.deleteSession).toHaveBeenCalledWith('s1');
  expect(jest.requireMock('../../data/mmkv').removeFile).toHaveBeenCalledWith('/c1.mp4');
  alert.mockRestore();
});

test('the trash button on a finished game asks to delete it', async () => {
  repo.listSessions.mockReturnValue([
    { session: { id: 's1', sport: 'outro', startedAt: 0, endedAt: 5, name: 'Final' }, clips: 2, firstClip: clip },
  ]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 60_000 });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  await render(<Games />);
  await fireEvent.press(screen.getByRole('button', { name: /Apagar gravação/ }));
  expect(alert).toHaveBeenCalledTimes(1);
  expect(repo.deleteSession).not.toHaveBeenCalled();
  alert.mockRestore();
});

test('a game still being recorded cannot be deleted from the list', async () => {
  repo.listSessions.mockReturnValue([{ session: { id: 's1', sport: 'outro', startedAt: 0 }, clips: 1, firstClip: clip }]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 0 });
  await render(<Games />);
  expect(screen.queryByRole('button', { name: /Apagar/ })).toBeNull();
});
