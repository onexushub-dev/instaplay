import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import Remote from '../remote';

jest.mock('../../../modules/replay-camera', () => ({
  remoteControllerStart: jest.fn(),
  remoteControllerStop: jest.fn(),
  remoteControllerHost: jest.fn(() => null),
  remoteControllerPairWithCode: jest.fn(),
  remoteControllerSave: jest.fn(),
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const camera = () => jest.requireMock('../../../modules/replay-camera');
const haptics = () => jest.requireMock('expo-haptics');
const NOW = 1_000_000_000;

function emit(name: string, payload: unknown) {
  const calls = camera().addReplayListener.mock.calls.filter((c: any[]) => c[0] === name);
  return act(async () => {
    calls.forEach((c: any[]) => c[1](payload));
  });
}

const paired = () => camera().remoteControllerHost.mockReturnValue({ id: 'h1', name: 'Quadra 1' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  camera().remoteControllerHost.mockReturnValue(null);
});

afterEach(() => jest.useRealTimers());

test('looks for the camera phone while open, and lets go on leaving', async () => {
  paired();
  const view = await render(<Remote />);
  expect(camera().remoteControllerStart).toHaveBeenCalledTimes(1);
  expect(jest.requireMock('expo-keep-awake').activateKeepAwakeAsync).toHaveBeenCalled();
  await view.unmount();
  expect(camera().remoteControllerStop).toHaveBeenCalledTimes(1);
  expect(jest.requireMock('expo-keep-awake').deactivateKeepAwake).toHaveBeenCalled();
});

test('without a pair it explains how to pair and takes the code by hand', async () => {
  await render(<Remote />);
  expect(
    screen.getByText(
      "Para parear: no celular da câmera, toque no tile 'Celular'. Depois, abra o app Câmera deste iPhone e aponte para o código que aparecer lá. Se preferir, digite o código abaixo.",
    ),
  ).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '042 517');
  await fireEvent.press(screen.getByRole('button', { name: 'Conectar' }));
  expect(camera().remoteControllerPairWithCode).toHaveBeenCalledWith('042517');
});

test('a code that is not six digits is not sent', async () => {
  await render(<Remote />);
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '1234');
  await fireEvent.press(screen.getByRole('button', { name: 'Conectar' }));
  expect(camera().remoteControllerPairWithCode).not.toHaveBeenCalled();
  expect(screen.getByText('Digite os 6 números do código.')).toBeTruthy();
});

test('a failed pairing by code says why', async () => {
  await render(<Remote />);
  await emit('onRemotePairing', { phase: 'failed', reason: 'notFound' });
  expect(
    screen.getByText('Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.'),
  ).toBeTruthy();
  await emit('onRemotePairing', { phase: 'failed', reason: 'expired' });
  expect(screen.getByText('Código vencido. Peça um novo no celular da câmera.')).toBeTruthy();
  await emit('onRemotePairing', { phase: 'failed', reason: 'locked' });
  expect(screen.getByText('Muitas tentativas. Gere um novo código.')).toBeTruthy();
});

test('after pairing by code the screen switches to the connection', async () => {
  await render(<Remote />);
  camera().remoteControllerHost.mockReturnValue({ id: 'h1', name: 'Quadra 1' });
  await emit('onRemotePairing', { phase: 'paired', peer: { id: 'h1', name: 'Quadra 1' } });
  expect(screen.getByText('Procurando Quadra 1…')).toBeTruthy();
});

test('connected and waiting for the game', async () => {
  paired();
  await render(<Remote />);
  expect(screen.getByText('Procurando Quadra 1…')).toBeTruthy();
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: false, clipCount: 0 });
  expect(screen.getByText('Conectado a Quadra 1. Aguardando o jogo começar.')).toBeTruthy();
});

test('while recording it shows the clock and clips, and Salvar asks the camera phone', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 3, startedAt: NOW - (12 * 60 + 34) * 1000 });
  expect(screen.getByText('12:34 · 3 lances')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  expect(camera().remoteControllerSave).toHaveBeenCalledTimes(1);
  expect(haptics().impactAsync).toHaveBeenCalled();
});

test('a double tap on Salvar asks for one clip only', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 0, startedAt: NOW });
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  expect(camera().remoteControllerSave).toHaveBeenCalledTimes(1);
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  expect(camera().remoteControllerSave).toHaveBeenCalledTimes(2);
});

test('the result of a save is shown with a vibration', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 1, startedAt: NOW });
  await emit('onRemoteResult', { saved: true });
  expect(screen.getByText('Salvo!')).toBeTruthy();
  expect(haptics().notificationAsync).toHaveBeenCalledWith('success');
  await emit('onRemoteResult', { saved: false });
  expect(screen.getByText('Não salvou')).toBeTruthy();
  expect(haptics().notificationAsync).toHaveBeenCalledWith('error');
});

test('news older than twelve seconds is not believed', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 2, startedAt: NOW });
  await act(async () => {
    jest.advanceTimersByTime(13_000);
  });
  expect(screen.getByText('Sem conexão com Quadra 1')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'SALVAR' })).toBeNull();
});

test('denied local network sends the player to Settings', async () => {
  paired();
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'denied' });
  expect(screen.getByText('Libere a rede local nos Ajustes para usar o controle.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir Ajustes' }));
  expect(open).toHaveBeenCalled();
});

test('when the camera phone forgot this remote, it says so and offers to pair again', async () => {
  paired();
  await render(<Remote />);
  camera().remoteControllerHost.mockReturnValue(null);
  await emit('onRemotePairing', { phase: 'failed', reason: 'denied' });
  expect(screen.getByText('Este controle não está mais pareado')).toBeTruthy();
  expect(screen.getByLabelText('Código de 6 dígitos')).toBeTruthy();
});

test('Fechar goes back', async () => {
  await render(<Remote />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
  expect(require('expo-router').router.back).toHaveBeenCalled();
});
