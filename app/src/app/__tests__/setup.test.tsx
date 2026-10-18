import { fireEvent, render, screen } from '@testing-library/react-native';

import Setup from '../setup';

jest.mock('../../../modules/replay-camera', () => ({ ReplayCameraView: () => null }));
jest.mock('../../triggers/useVolumeRemote', () => ({ useVolumeRemote: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  let prefs = { onboardingDone: true, sport: 'beachTennis', lens: 'ultraWide', gestureEnabled: true };
  return {
    repo: {
      getPrefs: () => prefs,
      setPrefs: jest.fn((p: object) => (prefs = { ...prefs, ...p })),
    },
  };
});
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));

const { repo } = jest.requireMock('../../data/mmkv');
const { useSession } = jest.requireMock('../../session/SessionContext');
const { router } = jest.requireMock('expo-router');

function session(state: object) {
  const value = {
    state: { phase: 'idle', camera: 'on', ...state },
    start: jest.fn(async () => {}),
    prepare: jest.fn(async () => true),
  };
  useSession.mockReturnValue(value);
  return value;
}

beforeEach(() => jest.clearAllMocks());

test('keeps the screen awake while the phone is being positioned', async () => {
  session({});
  await render(<Setup />);
  expect(jest.requireMock('expo-keep-awake').useKeepAwake).toHaveBeenCalled();
});

test('turns the camera on for the live preview', async () => {
  const s = session({ camera: 'off' });
  await render(<Setup />);
  expect(s.prepare).toHaveBeenCalledWith('ultraWide');
});

test('changing the lens reopens the camera with it', async () => {
  const s = session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: '1x' }));
  expect(s.prepare).toHaveBeenLastCalledWith('wide');
  await fireEvent.press(screen.getByRole('button', { name: '0.5x' }));
});

test('shows that the camera is opening', async () => {
  session({ camera: 'starting' });
  await render(<Setup />);
  expect(screen.getByRole('button', { name: 'Abrindo a câmera…' })).toBeDisabled();
});

test('choosing a sport stores it in prefs', async () => {
  session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Futevôlei' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ sport: 'futevolei' });
});

test('the gesture tile toggles the gesture preference', async () => {
  session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: /Gesto X/ }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ gestureEnabled: false });
});

test('Começar jogo starts with the chosen sport and goes to recording once it runs', async () => {
  const s = session({});
  const view = await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Vôlei de praia' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Começar jogo' }));
  expect(s.start).toHaveBeenCalledWith('voleiPraia');

  session({ phase: 'recording' });
  await view.rerender(<Setup />);
  expect(router.replace).toHaveBeenCalledWith('/recording');
});

test('a low-storage refusal shows its copy and the button works again', async () => {
  session({ phase: 'idle', error: 'LOW_STORAGE' });
  await render(<Setup />);
  expect(screen.getByText('Pouco espaço no celular. Libere pelo menos 500 MB para gravar.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Começar jogo' })).toBeEnabled();
});

test('the button is disabled while the camera starts', async () => {
  session({ phase: 'starting' });
  await render(<Setup />);
  expect(screen.getByRole('button', { name: 'Começar jogo' })).toBeDisabled();
});
