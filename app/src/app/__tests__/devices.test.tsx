import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Devices from '../devices';
import { clearRemotePress } from '../../devices/remoteTest';

jest.mock('../../triggers/useVolumeRemote', () => ({ useVolumeRemote: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('../../data/mmkv', () => {
  let prefs: any = {};
  return {
    __reset: () => (prefs = {}),
    repo: {
      getPrefs: () => prefs,
      setPrefs: jest.fn((p: object) => (prefs = { ...prefs, ...p })),
    },
  };
});

const { repo } = jest.requireMock('../../data/mmkv');
const { useVolumeRemote } = jest.requireMock('../../triggers/useVolumeRemote');
const { router } = jest.requireMock('expo-router');

const press = async () => {
  const onPress = useVolumeRemote.mock.calls.at(-1)[1];
  await act(async () => onPress());
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.requireMock('../../data/mmkv').__reset();
  clearRemotePress();
});

afterEach(() => jest.useRealTimers());

test('first time: tells how to pair the remote, step by step, and starts listening for a press', async () => {
  await render(<Devices />);
  expect(screen.getByText('Controle Bluetooth')).toBeTruthy();
  expect(screen.getByText('Toque para conectar')).toBeTruthy();
  expect(screen.getByText('Ligue o controle e deixe em modo de pareamento.')).toBeTruthy();
  expect(screen.getByText('Abra Ajustes > Bluetooth e toque no nome dele.')).toBeTruthy();
  expect(screen.getByText('Volte ao LANCE e aperte um botão do controle.')).toBeTruthy();
  expect(screen.getByText('Aperte um botão do controle…')).toBeTruthy();
  expect(useVolumeRemote).toHaveBeenLastCalledWith(true, expect.any(Function));
});

test('a press shows the remote as connected and remembers it for the next launch', async () => {
  await render(<Devices />);
  await press();
  expect(screen.getByText('Conectado')).toBeTruthy();
  expect(screen.getByText('Controle conectado')).toBeTruthy();
  expect(screen.queryByText('Aperte um botão do controle…')).toBeNull();
  expect(repo.setPrefs).toHaveBeenCalledWith({ remoteTestedAt: expect.any(Number) });
});

test('used in a previous launch: "Pareado", no steps, tells to press a button', async () => {
  repo.setPrefs({ remoteTestedAt: 123 });
  repo.setPrefs.mockClear();
  await render(<Devices />);
  expect(screen.getByText('Pareado · aperte um botão')).toBeTruthy();
  expect(screen.queryByText('Ligue o controle e deixe em modo de pareamento.')).toBeNull();
  expect(screen.getByText(/Confira se o controle aparece como Conectado em Ajustes > Bluetooth/)).toBeTruthy();
  await press();
  expect(repo.setPrefs).not.toHaveBeenCalled(); // already remembered
});

test('after 15 seconds without a press it adds the troubleshooting note and keeps the steps', async () => {
  await render(<Devices />);
  expect(screen.queryByText(/Confira se o controle aparece/)).toBeNull();
  await act(async () => jest.advanceTimersByTime(15_000));
  expect(screen.getByText(/Confira se o controle aparece como Conectado/)).toBeTruthy();
  expect(screen.getByText('Ligue o controle e deixe em modo de pareamento.')).toBeTruthy();
});

test('"Esquecer" asks first, explains how to remove it in Ajustes, then goes back to the first state', async () => {
  repo.setPrefs({ remoteTestedAt: 123 });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  await render(<Devices />);
  await fireEvent.press(screen.getByRole('button', { name: 'Esquecer controle' }));
  expect(repo.getPrefs().remoteTestedAt).toBe(123);
  expect(alert.mock.calls[0][1]).toMatch(/Ajustes > Bluetooth/);
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Esquecer')!.onPress!());
  expect(repo.getPrefs().remoteTestedAt).toBeUndefined();
  expect(screen.getByText('Toque para conectar')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Esquecer controle' })).toBeNull();
  alert.mockRestore();
});

test('there is no "Esquecer" before the remote was ever used', async () => {
  await render(<Devices />);
  expect(screen.queryByRole('button', { name: 'Esquecer controle' })).toBeNull();
});

test('"Pronto" closes the sheet', async () => {
  await render(<Devices />);
  await fireEvent.press(screen.getByRole('button', { name: 'Pronto' }));
  expect(router.back).toHaveBeenCalled();
});
