import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import Remote from '../remote';

jest.mock('../../../modules/replay-camera', () => ({
  remoteControllerStart: jest.fn(),
  remoteControllerStop: jest.fn(),
  remoteControllerHost: jest.fn(() => null),
  remoteControllerPairWithCode: jest.fn(),
  remoteControllerSave: jest.fn(),
  remoteControllerEndRecording: jest.fn(),
  remoteDeviceName: jest.fn(() => 'iPhone XR#1234'),
  remoteSetDeviceName: jest.fn(),
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy', Light: 'light' },
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

test('without a pair it says which iPhone is which and explains the steps', async () => {
  await render(<Remote />);
  expect(screen.getByText('ESTE IPHONE É O CONTROLE')).toBeTruthy();
  expect(screen.getByText("No celular da câmera, toque no tile 'Celular'.")).toBeTruthy();
  expect(screen.getByText('Neste iPhone, abra o app Câmera e aponte para o código que aparecer lá.')).toBeTruthy();
  expect(screen.getByText('Ou digite o código de 6 dígitos:')).toBeTruthy();
});

test('an incomplete code is not sent, and Conectar says what is missing', async () => {
  await render(<Remote />);
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '042 51');
  expect(camera().remoteControllerPairWithCode).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Conectar' }));
  expect(camera().remoteControllerPairWithCode).not.toHaveBeenCalled();
  expect(screen.getByText('Digite os 6 números do código.')).toBeTruthy();
});

test('the sixth digit connects by itself, and the button shows it is working', async () => {
  await render(<Remote />);
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '042 517');
  expect(camera().remoteControllerPairWithCode).toHaveBeenCalledWith('042517');
  expect(camera().remoteControllerPairWithCode).toHaveBeenCalledTimes(1);
  const busy = screen.getByRole('button', { name: 'Conectando…' });
  expect(busy).toBeDisabled();
  await emit('onRemotePairing', { phase: 'failed', reason: 'expired' });
  expect(screen.getByRole('button', { name: 'Conectar' })).toBeTruthy();
});

test('a code that never gets an answer stops spinning and says the camera was not found', async () => {
  await render(<Remote />);
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '042517');
  await act(async () => {
    jest.advanceTimersByTime(12_000);
  });
  expect(screen.getByRole('button', { name: 'Conectar' })).toBeTruthy();
  expect(
    screen.getByText('Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.'),
  ).toBeTruthy();
});

test('when the camera was not found, one tap tries the same code again', async () => {
  await render(<Remote />);
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '042517');
  await emit('onRemotePairing', { phase: 'failed', reason: 'notFound' });
  await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(camera().remoteControllerPairWithCode).toHaveBeenCalledTimes(2);
  expect(camera().remoteControllerPairWithCode).toHaveBeenLastCalledWith('042517');
});

test('an expired code offers no retry, only a new code', async () => {
  await render(<Remote />);
  await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '042517');
  await emit('onRemotePairing', { phase: 'failed', reason: 'expired' });
  expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
});

test('a shortcut opens the iPhone Camera app', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<Remote />);
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir app Câmera' }));
  expect(open).toHaveBeenCalledWith('camera://');
});

test('if the Camera app cannot be opened, it says to open it by hand', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no'));
  await render(<Remote />);
  await fireEvent.press(screen.getByRole('button', { name: 'Abrir app Câmera' }));
  await act(async () => {});
  expect(screen.getByText('Não consegui abrir. Abra o app Câmera do iPhone pela tela inicial.')).toBeTruthy();
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
  expect(screen.getByText('Conectado a Quadra 1. Inicie a gravação no outro dispositivo.')).toBeTruthy();
});

test('while recording it shows the clock and clips, and Salvar asks the camera phone', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 3, startedAt: NOW - (12 * 60 + 34) * 1000 });
  expect(screen.getByText('12:34 · 3 lances')).toBeTruthy();
  expect(screen.getByLabelText('Conectado a Quadra 1')).toBeTruthy();
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

async function recording() {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 1, startedAt: NOW });
}

test('the tap answers at once, before the camera phone does', async () => {
  await recording();
  expect(screen.getByText('SALVAR')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  expect(screen.getByText('ENVIANDO…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'SALVAR' }).props.accessibilityState).toMatchObject({ busy: true });
});

test('saved: the whole screen answers in green, with a vibration, then clears', async () => {
  await recording();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  await emit('onRemoteResult', { saved: true });
  expect(screen.getByText('SALVO!')).toBeTruthy();
  expect(haptics().notificationAsync).toHaveBeenCalledWith('success');
  expect(screen.queryByText('ENVIANDO…')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(1300);
  });
  expect(screen.queryByText('SALVO!')).toBeNull();
  expect(screen.getByText('SALVAR')).toBeTruthy();
});

test('failed: red, says what to do, vibrates as an error', async () => {
  await recording();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  await emit('onRemoteResult', { saved: false });
  expect(screen.getByText('NÃO SALVOU')).toBeTruthy();
  expect(screen.getByText('Toque de novo')).toBeTruthy();
  expect(haptics().notificationAsync).toHaveBeenCalledWith('error');
});

test('no answer in four seconds says so instead of spinning forever', async () => {
  await recording();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  await act(async () => {
    jest.advanceTimersByTime(3800);
  });
  expect(screen.getByText('ENVIANDO…')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(screen.getByText('SEM RESPOSTA')).toBeTruthy();
  expect(screen.getByText('Confira o celular da câmera')).toBeTruthy();
  expect(haptics().notificationAsync).toHaveBeenCalledWith('error');
});

test('an answer that arrives late is still shown', async () => {
  await recording();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  await act(async () => {
    jest.advanceTimersByTime(4500);
  });
  await emit('onRemoteResult', { saved: true });
  expect(screen.getByText('SALVO!')).toBeTruthy();
});

test('searching and waiting show a pulse and say where they are', async () => {
  paired();
  await render(<Remote />);
  expect(screen.getByLabelText('Reconectando a Quadra 1')).toBeTruthy();
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
  expect(jest.requireMock('expo-router').router.back).toHaveBeenCalled();
});

test('Fechar still leaves when there is nothing to go back to (opened straight from the QR code)', async () => {
  const { router } = jest.requireMock('expo-router');
  router.canGoBack.mockReturnValueOnce(false);
  await render(<Remote />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/');
});

test('without a pair the phone can be renamed', async () => {
  await render(<Remote />);
  expect(screen.getByLabelText('Nome deste celular').props.value).toBe('iPhone XR#1234');
});

test('connected before any state arrives it already says connected, not searching', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  expect(screen.getByText('Conectado a Quadra 1. Inicie a gravação no outro dispositivo.')).toBeTruthy();
  expect(screen.queryByText('Procurando Quadra 1…')).toBeNull();
});

test('after a save the button is clean again: no loading look, only a thin discreet marker for the 3 s gap', async () => {
  await recording();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  expect(screen.getByTestId('cooldown')).toBeTruthy();
  await emit('onRemoteResult', { saved: true });
  await act(async () => {
    jest.advanceTimersByTime(1300);
  });
  expect(screen.getByText('SALVAR')).toBeTruthy();
  expect(screen.queryByText('ENVIANDO…')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(screen.queryByTestId('cooldown')).toBeNull();
});

test('a tap inside the 3 s gap does not save and gives a light tap back', async () => {
  await recording();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  haptics().impactAsync.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'SALVAR' }));
  expect(camera().remoteControllerSave).toHaveBeenCalledTimes(1);
  expect(haptics().impactAsync).toHaveBeenCalledWith('light');
});

test('holding "Segure para encerrar a gravação" asks the camera phone to end the recording', async () => {
  await recording();
  const hold = screen.getByRole('button', { name: 'Segure para encerrar a gravação' });
  await fireEvent(hold, 'pressIn');
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  expect(camera().remoteControllerEndRecording).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(camera().remoteControllerEndRecording).toHaveBeenCalledTimes(1);
});

test('letting go early does not end the recording', async () => {
  await recording();
  const hold = screen.getByRole('button', { name: 'Segure para encerrar a gravação' });
  await fireEvent(hold, 'pressIn');
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await fireEvent(hold, 'pressOut');
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(camera().remoteControllerEndRecording).not.toHaveBeenCalled();
});

test('the end-recording button is only there while recording', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: false, clipCount: 0 });
  expect(screen.queryByRole('button', { name: 'Segure para encerrar a gravação' })).toBeNull();
});

test('"Tentar agora" starts the search over', async () => {
  paired();
  await render(<Remote />);
  await emit('onRemoteStatus', { link: 'connected', peerName: 'Quadra 1' });
  await emit('onRemoteState', { recording: true, clipCount: 2, startedAt: NOW });
  await act(async () => {
    jest.advanceTimersByTime(13_000);
  });
  camera().remoteControllerStop.mockClear();
  camera().remoteControllerStart.mockClear();
  await fireEvent.press(screen.getByRole('button', { name: 'Tentar agora' }));
  expect(camera().remoteControllerStop).toHaveBeenCalledTimes(1);
  expect(camera().remoteControllerStart).toHaveBeenCalledTimes(1);
});
