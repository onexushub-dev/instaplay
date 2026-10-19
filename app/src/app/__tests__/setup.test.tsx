import { fireEvent, render, screen } from '@testing-library/react-native';

import Setup from '../setup';

jest.mock('../../../modules/replay-camera', () => {
  const { useEffect } = jest.requireActual('react');
  const mounts = { count: 0, style: undefined as unknown };
  return {
    __mounts: mounts,
    requestSpeechPermission: jest.fn(async () => true),
    isVoiceSupported: jest.fn(() => true),
    getSpeechPermission: jest.fn(() => 'granted'),
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
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useIsFocused: jest.fn(() => true),
}));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  const initial = {
    onboardingDone: true,
    sport: 'beachTennis',
    lens: 'ultraWide',
    gestureEnabled: true,
    soundOnSave: true,
    flashOnSave: true,
    voiceEnabled: false,
  };
  let prefs: any = { ...initial };
  return {
    __reset: () => (prefs = { ...initial }),
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
    release: jest.fn(async () => {}),
    trigger: jest.fn(),
    undoLast: jest.fn(),
    stop: jest.fn(async () => 's1'),
  };
  useSession.mockReturnValue(value);
  return value;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('../../data/mmkv').__reset();
});

test('keeps the screen awake while the phone is being positioned', async () => {
  session({});
  await render(<Setup />);
  expect(jest.requireMock('expo-keep-awake').activateKeepAwakeAsync).toHaveBeenCalled();
});

test('under another screen (Meus jogos, editor, Story) it releases the camera, the volume buttons and keep-awake', async () => {
  jest.requireMock('expo-router').useIsFocused.mockReturnValue(false);
  const { useVolumeRemote } = jest.requireMock('../../triggers/useVolumeRemote');
  const s = session({});
  await render(<Setup />);
  expect(s.prepare).not.toHaveBeenCalled();
  expect(s.release).toHaveBeenCalled();
  expect(useVolumeRemote).toHaveBeenLastCalledWith(false, expect.any(Function));
  expect(jest.requireMock('expo-keep-awake').activateKeepAwakeAsync).not.toHaveBeenCalled();
  jest.requireMock('expo-router').useIsFocused.mockReturnValue(true);
});

test('turns the camera on for the live preview', async () => {
  const s = session({ camera: 'off' });
  await render(<Setup />);
  expect(s.prepare).toHaveBeenCalledWith('beachTennis');
});

test('changing the lens reopens the camera with it', async () => {
  const s = session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: '1x' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ modeSettings: { beachTennis: { lens: 'wide' } } });
  expect(s.prepare).toHaveBeenCalledTimes(2); // reopened with the mode's new lens
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
  await fireEvent.press(screen.getByRole('button', { name: /Braços para cima/ }));
  expect(repo.setPrefs).toHaveBeenCalledWith(
    expect.objectContaining({ modeSettings: expect.objectContaining({ beachTennis: { gestureEnabled: false } }) })
  );
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

test('turning voice on asks for speech permission first', async () => {
  const camera = jest.requireMock('../../../modules/replay-camera');
  camera.getSpeechPermission.mockReturnValueOnce('undetermined');
  session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: /^Voz/ }));
  expect(camera.requestSpeechPermission).toHaveBeenCalled();
  expect(repo.setPrefs).toHaveBeenCalledWith(
    expect.objectContaining({ modeSettings: expect.objectContaining({ beachTennis: expect.objectContaining({ voiceEnabled: true }) }) })
  );
});

test('voice stays off when speech permission is denied', async () => {
  const camera = jest.requireMock('../../../modules/replay-camera');
  camera.getSpeechPermission.mockReturnValueOnce('undetermined');
  camera.requestSpeechPermission.mockResolvedValueOnce(false);
  repo.setPrefs({ voiceEnabled: false });
  jest.clearAllMocks();
  session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: /^Voz/ }));
  expect(repo.setPrefs).not.toHaveBeenCalled();
  expect(screen.getByText('Libere o reconhecimento de fala em Ajustes.')).toBeTruthy();
});

test('the voice tile says when this phone cannot recognize speech offline', async () => {
  jest.requireMock('../../../modules/replay-camera').isVoiceSupported.mockReturnValueOnce(false);
  session({});
  await render(<Setup />);
  expect(screen.getByLabelText('Voz, Indisponível neste celular')).toBeTruthy();
});

test('Meus jogos opens the game list, and is hidden during a game', async () => {
  session({});
  const view = await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Meus jogos' }));
  expect(router.push).toHaveBeenCalledWith('/games');

  session({ phase: 'recording', sessionId: 's1', startedAt: Date.now() });
  await view.rerender(<Setup />);
  expect(screen.queryByRole('button', { name: 'Meus jogos' })).toBeNull();
});

test('switching to Academia shows gym modes and the person guide tip', async () => {
  session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Academia' }));
  expect(screen.getByRole('button', { name: 'Musculação' })).toBeTruthy();
  expect(screen.getByText('No chão ou no tripé, a 2–3 m, de lado para o exercício')).toBeTruthy();
  expect(screen.getByTestId('guide-person', { includeHiddenElements: true })).toBeTruthy();
});

test('choosing Musculação stores the mode and reopens the camera for it', async () => {
  const s = session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Academia' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Musculação' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ sport: 'musculacao' });
  expect(s.prepare).toHaveBeenLastCalledWith('musculacao');
});

test('the gesture tile reflects the mode default (off in gym)', async () => {
  repo.setPrefs({ sport: 'crossfit' });
  session({});
  await render(<Setup />);
  expect(screen.getByLabelText('Braços para cima, Desligado')).toBeTruthy();
});

test('a gym mode without speech permission shows Toque para permitir', async () => {
  repo.setPrefs({ sport: 'funcional' });
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('undetermined');
  session({});
  await render(<Setup />);
  expect(screen.getByLabelText('Voz, Toque para permitir')).toBeTruthy();
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('granted');
});

test('a denied speech permission shows the reason without a tap', async () => {
  repo.setPrefs({ sport: 'musculacao' });
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('denied');
  session({});
  await render(<Setup />);
  expect(screen.getByLabelText('Voz, Negado · libere em Ajustes')).toBeTruthy();
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('granted');
});
