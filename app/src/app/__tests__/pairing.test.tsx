import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Pairing from '../pairing';

jest.mock('../../../modules/replay-camera', () => ({
  isRemoteSupported: jest.fn(() => true),
  remoteHostBeginPairing: jest.fn(),
  remoteHostEndPairing: jest.fn(),
  remoteHostPeers: jest.fn(() => []),
  remoteHostRemove: jest.fn(),
  remoteHostCheck: jest.fn(),
  remoteDeviceName: jest.fn(() => 'iPhone 16 Pro Max#AB12'),
  remoteSetDeviceName: jest.fn(),
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const camera = () => jest.requireMock('../../../modules/replay-camera');
const NOW = 1_000_000;

const offer = (secondsLeft = 119, code = '042517') => ({
  url: 'lance://pair?h=h1&s=AAECAwQFBgcICQoLDA0ODw&n=Quadra%201',
  code,
  expiresAt: NOW + secondsLeft * 1000,
  qrPath: '/tmp/lance-pair.png',
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  camera().remoteHostBeginPairing.mockReturnValue(offer());
  camera().remoteHostPeers.mockReturnValue([]);
});

afterEach(() => jest.useRealTimers());

test('tells the player to read the code with the Camera app of the remote phone, above the code', async () => {
  await render(<Pairing />);
  expect(screen.getByText('Conectar um celular de controle')).toBeTruthy();
  expect(screen.getByText('ESTE IPHONE É A CÂMERA')).toBeTruthy();
  expect(screen.getByText('No outro celular, abra o LANCE e toque em “Usar este celular como controle”.')).toBeTruthy();
  expect(screen.getByText('Aponte a câmera dele para este código QR.')).toBeTruthy();
  expect(screen.getByText('042517')).toBeTruthy();
  expect(
    screen.getByText("Prefere digitar? No outro celular, digite este código:"),
  ).toBeTruthy();
  expect(screen.getByText('O LANCE precisa estar instalado no outro celular.')).toBeTruthy();
  expect(screen.getByLabelText('Código QR para parear')).toBeTruthy();
});

test('the instruction is there even when no code could be made', async () => {
  camera().remoteHostBeginPairing.mockReturnValue(null);
  await render(<Pairing />);
  expect(screen.getByText('No outro celular, abra o LANCE e toque em “Usar este celular como controle”.')).toBeTruthy();
});

test('while the code is good it shows that the camera phone is waiting for the remote', async () => {
  await render(<Pairing />);
  expect(screen.getByText('Aguardando o outro celular…')).toBeTruthy();
});

test('counts down the two minutes, and says when the code is no longer good', async () => {
  await render(<Pairing />);
  expect(screen.getByText('Válido por 1:59')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Válido por 0:59')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Código vencido. Gere um novo.')).toBeTruthy();
  expect(screen.queryByText('Aguardando o outro celular…')).toBeNull();
});

test('never shows more than the two minutes a code is good for, even if making the QR took a moment', async () => {
  camera().remoteHostBeginPairing.mockReturnValue(offer(121));
  await render(<Pairing />);
  expect(screen.getByText('Válido por 2:00')).toBeTruthy();
});

test('"Gerar novo código" opens a new pairing', async () => {
  await render(<Pairing />);
  camera().remoteHostBeginPairing.mockReturnValue(offer(119, '777888'));
  await fireEvent.press(screen.getByRole('button', { name: 'Gerar novo código' }));
  expect(camera().remoteHostBeginPairing).toHaveBeenCalledTimes(2);
  expect(screen.getByText('777888')).toBeTruthy();
});

const listener = (name: string) =>
  camera().addReplayListener.mock.calls.filter((c: any[]) => c[0] === name).map((c: any[]) => c[1]);

test('with remotes already paired it opens on the list and makes no code until asked', async () => {
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana', connected: true }]);
  await render(<Pairing />);
  expect(screen.getByText('Celulares de controle')).toBeTruthy();
  expect(screen.getByText('iPhone da Ana')).toBeTruthy();
  expect(camera().remoteHostBeginPairing).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Código QR para parear')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Parear outro celular' }));
  expect(camera().remoteHostBeginPairing).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Código QR para parear')).toBeTruthy();
  expect(screen.getByText('Válido por 1:59')).toBeTruthy();
  // Cancel goes back to the list and closes the pairing.
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  expect(camera().remoteHostEndPairing).toHaveBeenCalled();
  expect(screen.queryByLabelText('Código QR para parear')).toBeNull();
  expect(screen.getByRole('button', { name: 'Parear outro celular' })).toBeTruthy();
});

test('each remote says whether it is linked right now', async () => {
  camera().remoteHostPeers.mockReturnValue([
    { id: 'a', name: 'iPhone da Ana', connected: true },
    { id: 'b', name: 'iPhone do Beto', connected: false },
  ]);
  await render(<Pairing />);
  expect(screen.getByText('Conectado')).toBeTruthy();
  expect(screen.getByText('Offline')).toBeTruthy();
  expect(screen.getByText('Pronto para salvar lances')).toBeTruthy();
  expect(screen.getByText('Abra o LANCE neste celular para reconectar')).toBeTruthy();
  expect(screen.getByText('2 de 4')).toBeTruthy();
  // The list follows the link: when the status changes it is read again.
  camera().remoteHostPeers.mockReturnValue([
    { id: 'a', name: 'iPhone da Ana', connected: true },
    { id: 'b', name: 'iPhone do Beto', connected: true },
  ]);
  await act(async () => listener('onRemoteStatus').forEach((l: any) => l({ link: 'connected', controllers: 2 })));
  expect(screen.queryByText('Offline')).toBeNull();
  expect(screen.getAllByText('Conectado')).toHaveLength(2);
});

test('"Verificar conexão" opens the popup, then shows how fast the remote answered', async () => {
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana', connected: true }]);
  await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Verificar conexão de iPhone da Ana' }));
  expect(camera().remoteHostCheck).toHaveBeenCalledWith('a');
  expect(screen.getByText('Verificando iPhone da Ana…')).toBeTruthy();
  // One check at a time: the button waits for the answer.
  expect(screen.getByRole('button', { name: 'Verificar conexão de iPhone da Ana' }).props.accessibilityState.disabled).toBe(true);
  await act(async () => listener('onRemoteCheck').forEach((l: any) => l({ id: 'a', ok: true, ms: 120 })));
  expect(screen.getByText('iPhone da Ana respondeu')).toBeTruthy();
  expect(screen.getByText('120 ms')).toBeTruthy();
  expect(screen.queryByText('Verificando iPhone da Ana…')).toBeNull();
  // It closes by itself after 2 s.
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(screen.queryByText('iPhone da Ana respondeu')).toBeNull();
});

test('a remote that does not answer says so in the popup, which stays 4 s and closes with a tap too', async () => {
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana', connected: false }]);
  await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Verificar conexão de iPhone da Ana' }));
  await act(async () => listener('onRemoteCheck').forEach((l: any) => l({ id: 'a', ok: false, ms: 0 })));
  expect(screen.getByText('iPhone da Ana não respondeu')).toBeTruthy();
  expect(screen.getByText('Abra o LANCE nesse celular e tente de novo.')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(3900);
  });
  expect(screen.getByText('iPhone da Ana não respondeu')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  expect(screen.queryByText('iPhone da Ana não respondeu')).toBeNull();
  // A tap on the popup closes it before that.
  await fireEvent.press(screen.getByRole('button', { name: 'Verificar conexão de iPhone da Ana' }));
  await act(async () => listener('onRemoteCheck').forEach((l: any) => l({ id: 'a', ok: false, ms: 0 })));
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar aviso' }));
  expect(screen.queryByText('iPhone da Ana não respondeu')).toBeNull();
});

test('if the camera phone never reports, the popup gives up by itself and says there was no answer', async () => {
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana', connected: true }]);
  await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Verificar conexão de iPhone da Ana' }));
  expect(screen.getByText('Verificando iPhone da Ana…')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(screen.getByText('iPhone da Ana não respondeu')).toBeTruthy();
});

test('an answer about another remote does not change the popup', async () => {
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana', connected: true }]);
  await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Verificar conexão de iPhone da Ana' }));
  await act(async () => listener('onRemoteCheck').forEach((l: any) => l({ id: 'zzz', ok: true, ms: 9 })));
  expect(screen.getByText('Verificando iPhone da Ana…')).toBeTruthy();
});

test('removing a remote asks first, naming it, and only then removes it', async () => {
  camera().remoteHostPeers.mockReturnValue([
    { id: 'a', name: 'iPhone da Ana' },
    { id: 'b', name: 'iPhone do Beto' },
  ]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Remover iPhone da Ana' }));
  expect(alert).toHaveBeenCalledTimes(1);
  expect(alert.mock.calls[0][0]).toBe('Remover iPhone da Ana?');
  expect(camera().remoteHostRemove).not.toHaveBeenCalled();
  camera().remoteHostPeers.mockReturnValue([{ id: 'b', name: 'iPhone do Beto' }]);
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Remover')!.onPress!());
  expect(camera().remoteHostRemove).toHaveBeenCalledWith('a');
  expect(screen.queryByText('iPhone da Ana')).toBeNull();
  expect(screen.getByText('iPhone do Beto')).toBeTruthy();
  alert.mockRestore();
});

test('says who is linking up, and what happened when the tries ran out', async () => {
  await render(<Pairing />);
  await act(async () => listener('onRemotePairing').forEach((l: any) => l({ phase: 'connecting', peer: { id: 'a', name: 'iPhone da Ana' } })));
  expect(screen.getByText('Conectando com iPhone da Ana…')).toBeTruthy();
  await act(async () => listener('onRemotePairing').forEach((l: any) => l({ phase: 'released' })));
  expect(screen.getByText('Aguardando o outro celular…')).toBeTruthy();
  await act(async () => listener('onRemotePairing').forEach((l: any) => l({ phase: 'offerEnded', reason: 'locked' })));
  expect(screen.getByText('Muitas tentativas erradas. Gere um novo código.')).toBeTruthy();
  expect(screen.queryByText('Aguardando o outro celular…')).toBeNull();
});

test('the pairing screen lists what both phones need', async () => {
  await render(<Pairing />);
  expect(screen.getByText('Para conectar, confira:')).toBeTruthy();
  expect(screen.getByText(/Não precisa de internet nem da mesma rede/)).toBeTruthy();
});

test('with four remotes paired there is no new code, only the way out', async () => {
  camera().remoteHostBeginPairing.mockReturnValue(null);
  camera().remoteHostPeers.mockReturnValue(['a', 'b', 'c', 'd'].map((id) => ({ id, name: `iPhone ${id}` })));
  await render(<Pairing />);
  expect(screen.getByText('Você já tem 4 celulares de controle. Remova um para conectar outro.')).toBeTruthy();
  expect(screen.queryByText('042517')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Gerar novo código' })).toBeNull();
});

test('shows that a remote paired as soon as the camera phone says so', async () => {
  await render(<Pairing />);
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana' }]);
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onRemoteStatus')[1];
  await act(async () => listener({ link: 'connected', controllers: 1 }));
  expect(screen.getByText('Pronto! iPhone da Ana agora é um controle.')).toBeTruthy();
  expect(screen.queryByText('Aguardando o outro celular…')).toBeNull();
});

test('pairing a remote that was already in the list still counts as paired', async () => {
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana' }]);
  await render(<Pairing />);
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onRemotePairing')[1];
  await act(async () => listener({ phase: 'paired', peer: { id: 'a', name: 'iPhone da Ana' } }));
  expect(screen.getByText('Pronto! iPhone da Ana agora é um controle.')).toBeTruthy();
});

test('after pairing the sheet closes by itself', async () => {
  await render(<Pairing />);
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana' }]);
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onRemoteStatus')[1];
  await act(async () => listener({ link: 'connected', controllers: 1 }));
  expect(jest.requireMock('expo-router').router.back).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  expect(jest.requireMock('expo-router').router.back).toHaveBeenCalledTimes(1);
});

test('closes the pairing when the sheet goes away, and the button leaves', async () => {
  const view = await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
  expect(jest.requireMock('expo-router').router.back).toHaveBeenCalled();
  await view.unmount();
  expect(camera().remoteHostEndPairing).toHaveBeenCalled();
});

test('the camera phone can be renamed from the pairing sheet', async () => {
  await render(<Pairing />);
  expect(screen.getByLabelText('Nome deste celular').props.value).toBe('iPhone 16 Pro Max#AB12');
});
