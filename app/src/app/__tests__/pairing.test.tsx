import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Pairing from '../pairing';

jest.mock('../../../modules/replay-camera', () => ({
  isRemoteSupported: jest.fn(() => true),
  remoteHostBeginPairing: jest.fn(),
  remoteHostEndPairing: jest.fn(),
  remoteHostPeers: jest.fn(() => []),
  remoteHostRemove: jest.fn(),
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
  expect(screen.getByText('Parear um celular como controle')).toBeTruthy();
  expect(
    screen.getByText(
      "No celular que vai ser o controle, abra o app Câmera do iPhone (o da câmera normal) e aponte para este código. Depois toque em 'Abrir no LANCE'.",
    ),
  ).toBeTruthy();
  expect(screen.getByText('042517')).toBeTruthy();
  expect(
    screen.getByText("Não leu? Abra o LANCE no controle, toque em 'Usar este celular como controle' e digite o código:"),
  ).toBeTruthy();
  expect(screen.getByText('O LANCE precisa estar instalado no celular controle.')).toBeTruthy();
  expect(screen.getByLabelText('Código QR para parear')).toBeTruthy();
});

test('the instruction is there even when no code could be made', async () => {
  camera().remoteHostBeginPairing.mockReturnValue(null);
  await render(<Pairing />);
  expect(screen.getByText(/abra o app Câmera do iPhone/)).toBeTruthy();
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
});

test('"Gerar novo código" opens a new pairing', async () => {
  await render(<Pairing />);
  camera().remoteHostBeginPairing.mockReturnValue(offer(119, '777888'));
  await fireEvent.press(screen.getByRole('button', { name: 'Gerar novo código' }));
  expect(camera().remoteHostBeginPairing).toHaveBeenCalledTimes(2);
  expect(screen.getByText('777888')).toBeTruthy();
});

test('lists the paired remotes and removes one', async () => {
  camera().remoteHostPeers.mockReturnValue([
    { id: 'a', name: 'iPhone da Ana' },
    { id: 'b', name: 'iPhone do Beto' },
  ]);
  await render(<Pairing />);
  expect(screen.getByText('Controles pareados')).toBeTruthy();
  camera().remoteHostPeers.mockReturnValue([{ id: 'b', name: 'iPhone do Beto' }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Remover iPhone da Ana' }));
  expect(camera().remoteHostRemove).toHaveBeenCalledWith('a');
  expect(screen.queryByText('iPhone da Ana')).toBeNull();
  expect(screen.getByText('iPhone do Beto')).toBeTruthy();
});

test('with four remotes paired there is no new code, only the way out', async () => {
  camera().remoteHostBeginPairing.mockReturnValue(null);
  camera().remoteHostPeers.mockReturnValue(['a', 'b', 'c', 'd'].map((id) => ({ id, name: `iPhone ${id}` })));
  await render(<Pairing />);
  expect(screen.getByText('Limite de 4 controles. Remova um para parear outro.')).toBeTruthy();
  expect(screen.queryByText('042517')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Gerar novo código' })).toBeNull();
});

test('shows that a remote paired as soon as the camera phone says so', async () => {
  await render(<Pairing />);
  camera().remoteHostPeers.mockReturnValue([{ id: 'a', name: 'iPhone da Ana' }]);
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onRemoteStatus')[1];
  await act(async () => listener({ link: 'connected', controllers: 1 }));
  expect(screen.getByText('Pronto! iPhone da Ana agora é um controle.')).toBeTruthy();
});

test('closes the pairing when the sheet goes away, and the button leaves', async () => {
  const view = await render(<Pairing />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
  expect(jest.requireMock('expo-router').router.back).toHaveBeenCalled();
  await view.unmount();
  expect(camera().remoteHostEndPairing).toHaveBeenCalled();
});
