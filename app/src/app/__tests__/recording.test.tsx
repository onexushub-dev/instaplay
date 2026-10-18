import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Recording from '../recording';

jest.mock('../../../modules/replay-camera', () => ({ ReplayCameraView: jest.fn(() => null) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
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

test('keeps the screen awake for the whole game', async () => {
  session({});
  await render(<Recording />);
  expect(jest.requireMock('expo-keep-awake').useKeepAwake).toHaveBeenCalled();
});

test('the camera preview is shown at full brightness', async () => {
  session({});
  await render(<Recording />);
  const { ReplayCameraView } = jest.requireMock('../../../modules/replay-camera');
  const { StyleSheet } = jest.requireActual('react-native');
  const style = StyleSheet.flatten(ReplayCameraView.mock.calls.at(-1)[0].style);
  expect(style.opacity ?? 1).toBe(1);
});

test('the count is shown in a small pill, not over the preview', async () => {
  session({ clipCount: 3 });
  await render(<Recording />);
  expect(screen.getByText('3 lances')).toBeTruthy();
});

test('tapping the screen saves a lance', async () => {
  const s = session({});
  await render(<Recording />);
  await fireEvent.press(screen.getByRole('button', { name: /Toque em qualquer lugar/ }));
  expect(s.trigger).toHaveBeenCalledWith('screen');
});

test('a saved lance shows the overlay with its number and source', async () => {
  session({ clipCount: 3, lastSaved: { clipId: 'c3', number: 3, source: 'gesture', at: Date.now() } });
  await render(<Recording />);
  expect(screen.getByText('LANCE #3 SALVO')).toBeTruthy();
  expect(screen.getByText('via Gesto X · últimos 30s')).toBeTruthy();
});

test('Desfazer undoes the last lance', async () => {
  const s = session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'screen', at: Date.now() } });
  await render(<Recording />);
  await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
  expect(s.undoLast).toHaveBeenCalled();
});

test('holding the footer ends the game and opens its summary', async () => {
  const s = session({});
  await render(<Recording />);
  await act(async () => {
    await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar o jogo' }), 'longPress');
  });
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

test('a native error says recording stopped and offers the saved lances', async () => {
  session({ phase: 'ended', error: 'ENCODER_FAILED', thermalStop: true });
  await render(<Recording />);
  expect(screen.getByText('A gravação parou: celular muito quente')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver lances' }));
  expect(router.replace).toHaveBeenCalledWith('/session/s1');
});
