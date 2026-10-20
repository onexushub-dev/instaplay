import { act, render, screen } from '@testing-library/react-native';

import Pair from '../pair';

jest.mock('../../../modules/replay-camera', () => ({
  remoteControllerStart: jest.fn(),
  remoteControllerStop: jest.fn(),
  remoteControllerPairWithLink: jest.fn(),
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));

const camera = () => jest.requireMock('../../../modules/replay-camera');
const router = () => jest.requireMock('expo-router').router;
const params = (p: Record<string, string>) => jest.requireMock('expo-router').useLocalSearchParams.mockReturnValue(p);
const GOOD = { h: 'h1', s: 'AAECAwQFBgcICQoLDA0ODw', n: 'Quadra 1' };

function emit(payload: unknown) {
  const calls = camera().addReplayListener.mock.calls.filter((c: any[]) => c[0] === 'onRemotePairing');
  return act(async () => {
    calls.forEach((c: any[]) => c[1](payload));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  params(GOOD);
});

afterEach(() => jest.useRealTimers());

test('opening the link starts pairing with the camera phone it names', async () => {
  await render(<Pair />);
  expect(screen.getByText('Conectando a Quadra 1…')).toBeTruthy();
  expect(camera().remoteControllerStart).toHaveBeenCalledTimes(1);
  expect(camera().remoteControllerPairWithLink).toHaveBeenCalledWith('h1', 'AAECAwQFBgcICQoLDA0ODw', 'Quadra 1');
});

test('on success it says so and goes to the remote', async () => {
  await render(<Pair />);
  await emit({ phase: 'paired', peer: { id: 'h1', name: 'Quadra 1' } });
  expect(screen.getByText('Pronto! Este celular agora controla Quadra 1')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  expect(router().replace).toHaveBeenCalledWith('/remote');
  expect(camera().remoteControllerStop).not.toHaveBeenCalled();
});

test('each failure says what happened', async () => {
  await render(<Pair />);
  await emit({ phase: 'failed', reason: 'expired' });
  expect(screen.getByText('Código vencido. Peça um novo no celular da câmera.')).toBeTruthy();
  await emit({ phase: 'failed', reason: 'locked' });
  expect(screen.getByText('Muitas tentativas. Gere um novo código.')).toBeTruthy();
  await emit({ phase: 'failed', reason: 'notFound' });
  expect(
    screen.getByText('Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.'),
  ).toBeTruthy();
  await emit({ phase: 'failed', reason: 'denied' });
  expect(screen.getByText('Libere a rede local nos Ajustes para usar o controle.')).toBeTruthy();
});

test('a broken link does not try to pair', async () => {
  params({ h: 'h1', s: 'curto' });
  await render(<Pair />);
  expect(screen.getByText('Este link de pareamento não é válido. Peça um novo código no celular da câmera.')).toBeTruthy();
  expect(camera().remoteControllerPairWithLink).not.toHaveBeenCalled();
});

test('leaving without pairing lets the search go', async () => {
  const view = await render(<Pair />);
  await view.unmount();
  expect(camera().remoteControllerStop).toHaveBeenCalledTimes(1);
});
