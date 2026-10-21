import { fireEvent, render, screen } from '@testing-library/react-native';

import { setLocale } from '../../i18n';
import Games from '../games';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../components/useClipThumbnail', () => ({ useClipThumbnail: () => undefined }));
jest.mock('../../payments', () => ({
  payments: { subscribe: () => () => {}, version: () => 0, tierFor: jest.fn(() => 'free'), restore: jest.fn() },
}));
jest.mock('../../data/mmkv', () => ({
  repo: { lockedCount: jest.fn(() => 0), listSessions: jest.fn(), sessionStats: jest.fn(), subscribe: () => () => {}, version: () => 0 },
}));

const { repo } = jest.requireMock('../../data/mmkv');
const { payments } = jest.requireMock('../../payments');
const { router } = jest.requireMock('expo-router');

const clip = { id: 'c1', sessionId: 's1', createdAt: 1, source: 'screen', path: '/c1.mp4', durationMs: 1, trim: { startMs: 0, endMs: 1 } };

beforeEach(() => {
  jest.clearAllMocks();
  payments.tierFor.mockReturnValue('free');
  repo.lockedCount.mockReturnValue(0);
});

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

test('an English phone sees the list in English', async () => {
  setLocale('en');
  try {
    repo.listSessions.mockReturnValue([
      { session: { id: 's1', sport: 'futevolei', startedAt: new Date(2026, 9, 17, 18, 40).getTime() }, clips: 1, firstClip: clip },
    ]);
    repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 74 * 60_000 });
    await render(<Games />);
    expect(screen.getByText('MY RECORDINGS')).toBeTruthy();
    expect(screen.getByText('1 clip · 1h 14m')).toBeTruthy();
    expect(screen.getByText(/^Footvolley · 10\/17, 6:40\sPM$/)).toBeTruthy();
  } finally {
    setLocale('pt-BR');
  }
});

const oneGame = () => {
  repo.listSessions.mockReturnValue([{ session: { id: 's1', sport: 'outro', startedAt: 0 }, clips: 7, firstClip: clip }]);
  repo.sessionStats.mockReturnValue({ clips: 7, bytes: 1, recordedMs: 60_000 });
};

test('a free game shows how many clipes are locked', async () => {
  oneGame();
  repo.lockedCount.mockReturnValue(2);
  await render(<Games />);
  expect(screen.getByText(/ · 2 bloqueados$/)).toBeTruthy();
});

test('a pass game does not show locked clipes', async () => {
  oneGame();
  repo.lockedCount.mockReturnValue(2);
  payments.tierFor.mockReturnValue('pass');
  await render(<Games />);
  expect(screen.queryByText(/bloqueados/)).toBeNull();
});

test('Restaurar compras restores purchases', async () => {
  repo.listSessions.mockReturnValue([]);
  await render(<Games />);
  await fireEvent.press(screen.getByRole('button', { name: 'Restaurar compras' }));
  expect(payments.restore).toHaveBeenCalled();
});

test('a single locked clipe uses the singular', async () => {
  oneGame();
  repo.lockedCount.mockReturnValue(1);
  await render(<Games />);
  expect(screen.getByText(/ · 1 bloqueado$/)).toBeTruthy();
});
