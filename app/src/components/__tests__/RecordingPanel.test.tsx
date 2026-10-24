import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RecordingPanel as Recording } from '../RecordingPanel';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('../../data/mmkv', () => ({
  repo: { listClips: jest.fn(() => [{ id: 'c1' }]), deleteSession: jest.fn(() => []) },
  removeFile: jest.fn(),
}));
jest.mock('../../../modules/replay-camera', () => ({ addReplayListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));

const { useSession } = jest.requireMock('../../session/SessionContext');
const { router } = jest.requireMock('expo-router');
const { repo } = jest.requireMock('../../data/mmkv');

function session(state: object) {
  const value = {
    state: {
      phase: 'recording',
      sessionId: 's1',
      startedAt: Date.now(),
      clipCount: 0,
      saving: false,
      paused: false,
      thermal: { level: 'nominal', degraded: false },
      ...state,
    },
    trigger: jest.fn(),
    undoLast: jest.fn(),
    stop: jest.fn(async () => 's1'),
    reset: jest.fn(),
  };
  useSession.mockReturnValue(value);
  return value;
}

beforeEach(() => jest.clearAllMocks());

test('the count is shown in a small pill, not over the preview', async () => {
  session({ clipCount: 3 });
  await render(<Recording />);
  expect(screen.getByText('3 clipes')).toBeTruthy();
});

test('tells the player clearly how to save', async () => {
  session({});
  await render(<Recording />);
  expect(screen.getByText('Toque na tela para salvar o clipe')).toBeTruthy();
});

test('tapping the screen saves a clipe', async () => {
  const s = session({});
  await render(<Recording />);
  await fireEvent.press(screen.getByRole('button', { name: /Toque em qualquer lugar/ }));
  expect(s.trigger).toHaveBeenCalledWith('screen');
});

test('a saved clipe shows the overlay with its number and source', async () => {
  session({ clipCount: 3, lastSaved: { clipId: 'c3', number: 3, source: 'gesture', at: Date.now(), cutMs: 30000 } });
  await render(<Recording />);
  expect(screen.getByText('CLIPE #3 SALVO')).toBeTruthy();
  expect(screen.getByText('via Acenar com os braços · 30s')).toBeTruthy();
});

test('Desfazer undoes the last clipe', async () => {
  const s = session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'screen', at: Date.now(), cutMs: 30000 } });
  await render(<Recording />);
  await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
  expect(s.undoLast).toHaveBeenCalled();
});

test('holding the footer ends the game and opens its summary', async () => {
  const s = session({});
  await render(<Recording />);
  jest.useFakeTimers();
  await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar a gravação' }), 'pressIn');
  await act(async () => jest.advanceTimersByTime(1000));
  jest.useRealTimers();
  expect(s.stop).toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/session/s1');
});

test('a hot phone shows the heat banner', async () => {
  session({ thermal: { level: 'serious', degraded: true } });
  await render(<Recording />);
  expect(screen.getByText(/Passamos para 720p\/30/)).toBeTruthy();
});

test('an interrupted game shows the paused banner', async () => {
  session({ paused: true });
  await render(<Recording />);
  expect(screen.getByText('Gravação pausada. Volte para o app para continuar.')).toBeTruthy();
});

test('a native error says recording stopped and offers the saved clipes', async () => {
  session({ phase: 'ended', error: 'ENCODER_FAILED', thermalStop: true });
  await render(<Recording />);
  expect(screen.getByText('A gravação parou: celular muito quente')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver clipes' }));
  expect(router.replace).toHaveBeenCalledWith('/session/s1');
});

test('a clipe saved by voice says so', async () => {
  session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'voice', at: Date.now(), cutMs: 30000 } });
  await render(<Recording />);
  expect(screen.getByText('via Voz · 30s')).toBeTruthy();
});

test('the saved popup tells the length the clip really has, not the length asked for', async () => {
  session({ clipCount: 2, lastSaved: { clipId: 'c2', number: 2, source: 'screen', at: Date.now(), cutMs: 7000 } });
  await render(<Recording clipSeconds={30} />);
  expect(screen.getByText('via Tela · 7s')).toBeTruthy();
  expect(screen.queryByText(/60s guardados/)).toBeNull();
});

test('the hint lists the triggers that are on and the clip length', async () => {
  session({});
  await render(<Recording clipSeconds={45} gesture={false} voice />);
  expect(screen.getByText('Últimos 45s prontos · ou diga “salvar” · ou use o controle')).toBeTruthy();
});

test('the arms-up hint shows when the gesture is on', async () => {
  session({});
  await render(<Recording clipSeconds={30} gesture voice={false} />);
  expect(screen.getByText('Últimos 30s prontos · ou acene com os braços · ou use o controle')).toBeTruthy();
});

test('a remote phone asking to end the recording ends it like the hold button does', async () => {
  const s = session({});
  await render(<Recording />);
  const calls = jest.requireMock('../../../modules/replay-camera').addReplayListener.mock.calls;
  const ask = calls.filter((c: any[]) => c[0] === 'onRemoteStop').pop()[1];
  await act(async () => ask());
  expect(s.stop).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/session/s1');
});

test('a stop asked outside a recording is ignored', async () => {
  const s = session({ phase: 'idle' });
  await render(<Recording />);
  const calls = jest.requireMock('../../../modules/replay-camera').addReplayListener.mock.calls;
  const ask = calls.filter((c: any[]) => c[0] === 'onRemoteStop').pop()[1];
  await act(async () => ask());
  expect(s.stop).not.toHaveBeenCalled();
});

describe('a recording without any clip', () => {
  test('ending it removes it and opens Minhas gravações', async () => {
    repo.listClips.mockReturnValue([]);
    const s = session({});
    await render(<Recording />);
    jest.useFakeTimers();
    await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar a gravação' }), 'pressIn');
    await act(async () => jest.advanceTimersByTime(1000));
    jest.useRealTimers();
    await act(async () => {});
    expect(repo.deleteSession).toHaveBeenCalledWith('s1');
    expect(s.reset).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/games');
    expect(router.replace).not.toHaveBeenCalled();
    repo.listClips.mockReturnValue([{ id: 'c1' }]);
  });

  test('stopped by an error, it offers Minhas gravações instead of an empty summary', async () => {
    repo.listClips.mockReturnValue([]);
    const s = session({ phase: 'ended', error: 'ENCODER_FAILED', clipCount: 0 });
    await render(<Recording />);
    await fireEvent.press(screen.getByRole('button', { name: 'Minhas gravações' }));
    expect(repo.deleteSession).toHaveBeenCalledWith('s1');
    expect(s.reset).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/games');
    repo.listClips.mockReturnValue([{ id: 'c1' }]);
  });
});
