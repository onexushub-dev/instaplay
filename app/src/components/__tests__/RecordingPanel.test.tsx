import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RecordingPanel as Recording } from '../RecordingPanel';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../../../modules/replay-camera', () => ({ addReplayListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));

const { useSession } = jest.requireMock('../../session/SessionContext');
const { router } = jest.requireMock('expo-router');

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
  session({ clipCount: 3, lastSaved: { clipId: 'c3', number: 3, source: 'gesture', at: Date.now() } });
  await render(<Recording />);
  expect(screen.getByText('CLIPE #3 SALVO')).toBeTruthy();
  expect(screen.getByText('via Acenar com os braços · últimos 30s')).toBeTruthy();
});

test('Desfazer undoes the last clipe', async () => {
  const s = session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'screen', at: Date.now() } });
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
  session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'voice', at: Date.now() } });
  await render(<Recording />);
  expect(screen.getByText('via Voz · últimos 30s')).toBeTruthy();
});

test('the hint lists the triggers on in this mode and the buffer length', async () => {
  session({});
  await render(<Recording bufferSeconds={120} gesture={false} voice />);
  expect(screen.getByText('Últimos 120s prontos · ou diga “salvar” · ou use o controle')).toBeTruthy();
});

test('a court game keeps the arms-up hint', async () => {
  session({});
  await render(<Recording bufferSeconds={60} gesture voice={false} />);
  expect(screen.getByText('Últimos 60s prontos · ou acene com os braços · ou use o controle')).toBeTruthy();
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

test('the tenth free clip says it was the last free one', async () => {
  session({ clipCount: 10, lastSaved: { clipId: 'c10', number: 10, source: 'screen', at: Date.now(), locked: false, lastFree: true } });
  await render(<Recording />);
  expect(screen.getByText('Último clipe grátis deste jogo.')).toBeTruthy();
});

test('a locked clip says it is saved and unlocks after the game', async () => {
  session({ clipCount: 11, lastSaved: { clipId: 'c11', number: 11, source: 'screen', at: Date.now(), locked: true, lastFree: false } });
  await render(<Recording />);
  expect(screen.getByText('Guardado. Libere no fim do jogo.')).toBeTruthy();
});

test('before the limit the usual hint stays', async () => {
  session({ clipCount: 2, lastSaved: { clipId: 'c2', number: 2, source: 'screen', at: Date.now(), locked: false, lastFree: false } });
  await render(<Recording />);
  expect(screen.queryByText('Último clipe grátis deste jogo.')).toBeNull();
  expect(screen.queryByText('Guardado. Libere no fim do jogo.')).toBeNull();
});

test('in a workout the notes say treino', async () => {
  session({ clipCount: 10, lastSaved: { clipId: 'c10', number: 10, source: 'screen', at: Date.now(), locked: false, lastFree: true } });
  await render(<Recording group="academia" />);
  expect(screen.getByText('Último clipe grátis deste treino.')).toBeTruthy();
});

test('a locked clip in a workout unlocks after the treino', async () => {
  session({ clipCount: 11, lastSaved: { clipId: 'c11', number: 11, source: 'screen', at: Date.now(), locked: true, lastFree: false } });
  await render(<Recording group="academia" />);
  expect(screen.getByText('Guardado. Libere no fim do treino.')).toBeTruthy();
});
