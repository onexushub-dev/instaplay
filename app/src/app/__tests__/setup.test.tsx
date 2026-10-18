import { fireEvent, render, screen } from '@testing-library/react-native';

import Setup from '../setup';

jest.mock('../../../modules/replay-camera', () => {
  const { useEffect } = jest.requireActual('react');
  const mounts = { count: 0, style: undefined as unknown };
  return {
    __mounts: mounts,
    ReplayCameraView: (props: { style?: unknown }) => {
      mounts.style = props.style;
      useEffect(() => {
        mounts.count += 1;
      }, []);
      return null;
    },
  };
});
jest.mock('../../triggers/useVolumeRemote', () => ({ useVolumeRemote: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  let prefs = {
    onboardingDone: true,
    sport: 'beachTennis',
    lens: 'ultraWide',
    gestureEnabled: true,
    soundOnSave: true,
    flashOnSave: true,
  };
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
    state: {
      phase: 'idle',
      camera: 'on',
      clipCount: 0,
      saving: false,
      paused: false,
      thermal: { level: 'nominal', degraded: false },
      ...state,
    },
    start: jest.fn(async () => {}),
    prepare: jest.fn(async () => true),
    trigger: jest.fn(),
    undoLast: jest.fn(),
    stop: jest.fn(async () => 's1'),
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

test('Começar jogo starts with the chosen sport and shows the recording controls on the same screen', async () => {
  const s = session({});
  const view = await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Vôlei de praia' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Começar jogo' }));
  expect(s.start).toHaveBeenCalledWith('voleiPraia');

  session({ phase: 'recording', sessionId: 's1', startedAt: Date.now() });
  await view.rerender(<Setup />);
  expect(screen.getByText('Toque na tela para salvar o lance')).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
});

test('the camera preview is shown at full brightness while recording', async () => {
  session({ phase: 'recording', sessionId: 's1', startedAt: Date.now() });
  await render(<Setup />);
  const { __mounts } = jest.requireMock('../../../modules/replay-camera');
  const { StyleSheet } = jest.requireActual('react-native');
  expect(StyleSheet.flatten(__mounts.style).opacity ?? 1).toBe(1);
});

test('one camera preview for the whole game: starting does not recreate it', async () => {
  const { __mounts } = jest.requireMock('../../../modules/replay-camera');
  __mounts.count = 0;
  session({});
  const view = await render(<Setup />);
  session({ phase: 'recording', sessionId: 's1', startedAt: Date.now() });
  await view.rerender(<Setup />);
  expect(__mounts.count).toBe(1);
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

test('save feedback toggles: sound and flash', async () => {
  session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ soundOnSave: false });
  await fireEvent.press(screen.getByRole('button', { name: 'Flash' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ flashOnSave: false });
});
