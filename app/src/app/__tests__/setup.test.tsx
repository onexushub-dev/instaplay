import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Setup from '../setup';

jest.mock('../../../modules/replay-camera', () => {
  const { useEffect } = jest.requireActual('react');
  const mounts = { count: 0, style: undefined as unknown };
  return {
    __mounts: mounts,
    requestSpeechPermission: jest.fn(async () => true),
    isVoiceSupported: jest.fn(() => true),
    getSpeechPermission: jest.fn(() => 'granted'),
    getWatchStatus: jest.fn(() => 'unsupported'),
    isRemoteSupported: jest.fn(() => false),
    remoteHostStart: jest.fn(),
    remoteHostStop: jest.fn(),
    remoteHostPeers: jest.fn(() => []),
    addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
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
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(),
}));
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

/** The setup sheet opens collapsed: mode, triggers and alerts sit behind the summary row. */
async function openSettings() {
  await fireEvent.press(screen.getByRole('button', { name: /^Ajustes:/ }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.requireMock('../../data/mmkv').__reset();
  const module = jest.requireMock('../../../modules/replay-camera');
  module.isRemoteSupported.mockReturnValue(false);
  module.remoteHostPeers.mockReturnValue([]);
});

test('keeps the screen awake while the phone is being positioned', async () => {
  session({});
  await render(<Setup />);
  expect(jest.requireMock('expo-keep-awake').activateKeepAwakeAsync).toHaveBeenCalled();
});

test('under another screen (Minhas gravações, editor, Salvar) it releases the camera, the volume buttons and keep-awake', async () => {
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
  expect(s.prepare).toHaveBeenCalledWith('quadra'); // a pre-modes sport opens as Quadra
});

test('changing the lens reopens the camera with it', async () => {
  const s = session({});
  await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: '1x' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ modeSettings: { quadra: { lens: 'wide' } } });
  expect(s.prepare).toHaveBeenCalledTimes(2); // reopened with the mode's new lens
  await fireEvent.press(screen.getByRole('button', { name: '0.5x' }));
});

test('shows that the camera is opening', async () => {
  session({ camera: 'starting' });
  await render(<Setup />);
  expect(screen.getByRole('button', { name: 'Abrindo a câmera…' })).toBeDisabled();
});

test('choosing a mode stores it in prefs', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Academia' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ sport: 'academia' });
});

test('the gesture tile toggles the gesture preference', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: /Acenar com os braços/ }));
  expect(repo.setPrefs).toHaveBeenCalledWith(
    expect.objectContaining({ modeSettings: expect.objectContaining({ quadra: { gestureEnabled: false } }) }),
  );
});

test('Começar a gravar starts with the chosen sport and shows the recording controls on the same screen', async () => {
  const s = session({});
  const view = await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Academia' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Começar a gravar' }));
  expect(s.start).toHaveBeenCalledWith('academia');

  session({ phase: 'recording', sessionId: 's1', startedAt: Date.now() });
  await view.rerender(<Setup />);
  expect(screen.getByText('Toque na tela para salvar o clipe')).toBeTruthy();
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
  expect(screen.getByRole('button', { name: 'Começar a gravar' })).toBeEnabled();
});

test('the button is disabled while the camera starts', async () => {
  session({ phase: 'starting' });
  await render(<Setup />);
  expect(screen.getByRole('button', { name: 'Começar a gravar' })).toBeDisabled();
});

test('save feedback toggles: sound and flash', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
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
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: /^Voz/ }));
  expect(camera.requestSpeechPermission).toHaveBeenCalled();
  expect(repo.setPrefs).toHaveBeenCalledWith(
    expect.objectContaining({
      modeSettings: expect.objectContaining({ quadra: expect.objectContaining({ voiceEnabled: true }) }),
    }),
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
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: /^Voz/ }));
  expect(repo.setPrefs).not.toHaveBeenCalled();
  expect(screen.getByText('Libere o reconhecimento de fala em Ajustes.')).toBeTruthy();
});

test('the voice tile says when this phone cannot recognize speech offline', async () => {
  jest.requireMock('../../../modules/replay-camera').isVoiceSupported.mockReturnValueOnce(false);
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Voz, Indisponível neste celular')).toBeTruthy();
});

test('Minhas gravações opens the game list, and is hidden during a game', async () => {
  session({});
  const view = await render(<Setup />);
  await fireEvent.press(screen.getByRole('button', { name: 'Minhas gravações' }));
  expect(router.push).toHaveBeenCalledWith('/games');

  session({ phase: 'recording', sessionId: 's1', startedAt: Date.now() });
  await view.rerender(<Setup />);
  expect(screen.queryByRole('button', { name: 'Minhas gravações' })).toBeNull();
});

test('choosing Academia shows the gym tip and guide and reopens the camera for it', async () => {
  const s = session({});
  await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Academia' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ sport: 'academia' });
  expect(s.prepare).toHaveBeenLastCalledWith('academia');
  expect(screen.getByText('No chão ou no tripé, a 2–3 m, de lado para o exercício')).toBeTruthy();
  expect(screen.getByTestId('guide-person', { includeHiddenElements: true })).toBeTruthy();
});

test('only two modes to pick: Quadra and Academia', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByRole('button', { name: 'Quadra' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Futevôlei' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Musculação' })).toBeNull();
});

test('the gesture tile reflects the mode default (off in gym)', async () => {
  repo.setPrefs({ sport: 'academia' });
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Acenar com os braços, Desligado')).toBeTruthy();
});

test('a gym mode without speech permission shows Toque para permitir', async () => {
  repo.setPrefs({ sport: 'academia' });
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('undetermined');
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Voz, Toque para permitir')).toBeTruthy();
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('granted');
});

test('a denied speech permission shows the reason without a tap', async () => {
  repo.setPrefs({ sport: 'academia' });
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('denied');
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Voz, Negado · libere em Ajustes')).toBeTruthy();
  jest.requireMock('../../../modules/replay-camera').getSpeechPermission.mockReturnValue('granted');
});

test('opens collapsed: a summary of the mode and the start button, nothing else over the camera', async () => {
  session({});
  await render(<Setup />);
  expect(screen.getByRole('button', { name: /^Ajustes: Quadra/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Começar a gravar' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Futevôlei' })).toBeNull();
  expect(screen.queryByText('COMO SALVAR O CLIPE')).toBeNull();
});

test('the summary tells which triggers are on without opening', async () => {
  repo.setPrefs({ sport: 'academia' });
  session({});
  await render(<Setup />);
  expect(
    screen.getByRole('button', {
      name: 'Ajustes: Academia · voz ligada, acenar com os braços desligado, controle não testado',
    }),
  ).toBeTruthy();
});

test('a remote press while collapsed shows the remote works', async () => {
  session({});
  await render(<Setup />);
  const { useVolumeRemote } = jest.requireMock('../../triggers/useVolumeRemote');
  const onPress = useVolumeRemote.mock.calls.at(-1)[1];
  const { act } = jest.requireActual('@testing-library/react-native');
  await act(() => onPress());
  expect(screen.getByRole('button', { name: /controle funcionando$/ })).toBeTruthy();
});

test('choosing a mode closes the settings; the handle closes them too', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Academia' }));
  expect(screen.queryByRole('button', { name: 'Quadra' })).toBeNull();
  expect(screen.getByRole('button', { name: /^Ajustes: Academia/ })).toBeTruthy();

  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar ajustes' }));
  expect(screen.queryByText('COMO SALVAR O CLIPE')).toBeNull();
});

test('the positioning guide fits the camera area above the sheet', async () => {
  session({});
  await render(<Setup />);
  await fireEvent(screen.getByTestId('setup-sheet'), 'layout', { nativeEvent: { layout: { height: 210 } } });
  const { StyleSheet } = jest.requireActual('react-native');
  expect(StyleSheet.flatten(screen.getByTestId('guide-area', { includeHiddenElements: true }).props.style).bottom).toBe(
    210,
  );
});

const camera = () => jest.requireMock('../../../modules/replay-camera');

test.each([
  ['unsupported', 'Sem relógio pareado'],
  ['notInstalled', 'Instale o app no relógio'],
  ['ready', 'Pronto'],
])('the Relógio tile says %s as "%s"', async (status, text) => {
  camera().getWatchStatus.mockReturnValueOnce(status);
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText(`Relógio, ${text}`)).toBeTruthy();
});

test('a watch status event updates the tile', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Relógio, Sem relógio pareado')).toBeTruthy();
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onWatchStatus')[1];
  await act(async () => listener({ status: 'ready' }));
  expect(screen.getByLabelText('Relógio, Pronto')).toBeTruthy();
});

test('the collapsed summary mentions a ready watch, and only then', async () => {
  session({});
  const view = await render(<Setup />);
  expect(screen.getByRole('button', { name: /^Ajustes:/ }).props.accessibilityLabel).not.toMatch(/relógio/);
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onWatchStatus')[1];
  await act(async () => listener({ status: 'ready' }));
  expect(screen.getByRole('button', { name: /relógio pronto$/ })).toBeTruthy();
  view.unmount();
});

test('without a watch the other triggers behave as before', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Acenar com os braços, Ativo')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Começar a gravar' })).toBeEnabled();
});

// ---- Second iPhone as a remote ("Celular" tile)

function enableRemote(peers: { id: string; name: string }[]) {
  camera().isRemoteSupported.mockReturnValue(true);
  camera().remoteHostPeers.mockReturnValue(peers);
}

test('the Celular tile is hidden where the phone remote is not supported', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.queryByLabelText(/^Celular,/)).toBeNull();
  expect(camera().remoteHostStart).not.toHaveBeenCalled();
});

test('the Celular tile says that no remote is paired, and opens the pairing sheet', async () => {
  enableRemote([]);
  session({});
  await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Celular, Nenhum controle pareado' }));
  expect(router.push).toHaveBeenCalledWith('/pairing');
});

test('the Celular tile names the paired remote, and says when it is connected', async () => {
  enableRemote([{ id: 'a', name: 'iPhone da Ana' }]);
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Celular, Pareado: iPhone da Ana')).toBeTruthy();
  const listener = camera().addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onRemoteStatus')[1];
  await act(async () => listener({ link: 'connected', controllers: 1 }));
  expect(screen.getByLabelText('Celular, Conectado: iPhone da Ana')).toBeTruthy();
});

test('with several paired remotes the tile counts them', async () => {
  enableRemote([
    { id: 'a', name: 'iPhone da Ana' },
    { id: 'b', name: 'iPhone do Beto' },
  ]);
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.getByLabelText('Celular, 2 controles pareados')).toBeTruthy();
});

test('the phone waits for its remotes while the setup screen is in front, and stops when it leaves', async () => {
  enableRemote([]);
  session({});
  const view = await render(<Setup />);
  expect(camera().remoteHostStart).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(camera().remoteHostStop).toHaveBeenCalledTimes(1);
});

test('the entry to the remote is offered only where the phone remote is supported', async () => {
  session({});
  await render(<Setup />);
  await openSettings();
  expect(screen.queryByRole('button', { name: 'Usar este celular como controle' })).toBeNull();
});

test('"Usar este celular como controle" opens the remote screen', async () => {
  enableRemote([]);
  session({});
  await render(<Setup />);
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Usar este celular como controle' }));
  expect(router.push).toHaveBeenCalledWith('/remote');
});
