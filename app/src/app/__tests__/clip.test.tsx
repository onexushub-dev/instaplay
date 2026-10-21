import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Image } from 'react-native';

import ClipEditor from '../clip/[id]';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ id: 'c1' }) }));
jest.mock('../../payments', () => ({
  payments: {
    subscribe: () => () => {},
    version: () => 0,
    tierFor: jest.fn(() => 'pro'),
    showPaywall: jest.fn(async () => 'dismissed'),
  },
}));
jest.mock('expo-video', () => {
  const mockPlayer = { addListener: () => ({ remove() {} }), play: jest.fn(), pause: jest.fn(), currentTime: 0, playbackRate: 1, muted: false };
  return { __player: mockPlayer, useVideoPlayer: () => mockPlayer, VideoView: () => null };
});
jest.mock('expo-file-system', () => ({ File: class { delete() {} }, Directory: class { list() { return []; } }, Paths: { cache: '' } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: jest.fn(async () => ({})) },
}));
jest.mock('../../share/captureOverlay', () => ({ captureOverlay: jest.fn(async () => '/tmp/overlay.png') }));
jest.mock('../../../modules/replay-camera', () => ({
  exportClip: jest.fn(async () => ({ path: '/exports/e1.mp4', durationMs: 30000 })),
  createThumbnail: jest.fn(async () => '/c1.jpg'),
  findContentStart: jest.fn(async () => 0),
}));
jest.mock('../../components/TrimBar', () => {
  const props: { last?: any } = {};
  return { __props: props, TrimBar: (p: any) => ((props.last = p), null) };
});
jest.mock('../../data/mmkv', () => {
  let clip: any;
  return {
    __setClip: (c: any) => (clip = c),
    removeFile: jest.fn(),
    repo: {
      getClip: () => clip,
      listClips: () => (clip ? [{ id: 'c0' }, clip] : []),
      getPrefs: () => jest.requireActual('../../data/schema').DEFAULT_PREFS,
      getSession: () => ({ id: 's1', sport: clip?.durationMs > 60000 ? 'musculacao' : 'beachTennis', startedAt: 0 }),
      updateClip: jest.fn((id: string, patch: object) => (clip = { ...clip, ...patch })),
      renameClip: jest.fn(),
      deleteClip: jest.fn(),
      subscribe: () => () => {},
      version: () => 0,
    },
  };
});

const { payments } = jest.requireMock('../../payments');
const { repo, __setClip, removeFile } = jest.requireMock('../../data/mmkv');
const { router } = jest.requireMock('expo-router');
const { __player: player } = jest.requireMock('expo-video');
const camera = jest.requireMock('../../../modules/replay-camera');
const sharing = jest.requireMock('expo-sharing');
const media = jest.requireMock('expo-media-library');

const base = {
  id: 'c1', sessionId: 's1', createdAt: new Date(2026, 9, 17, 19, 40).getTime(), source: 'gesture',
  path: '/c1.mp4', durationMs: 60000, trim: { startMs: 30000, endMs: 60000 }, contentStartMs: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  payments.tierFor.mockImplementation(() => 'pro');
  __setClip({ ...base });
  // jest-expo's ImageLoader mock predates RN 0.88's promise-based getSize.
  (jest.spyOn(Image, 'getSize') as jest.Mock).mockResolvedValue({ width: 1920, height: 1080 });
});

const open = async () => {
  await render(<ClipEditor />);
  await act(async () => {});
};
const pressAction = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

test('the name field shows which clip it is until the player names it', async () => {
  await open();
  const input = screen.getByLabelText('Nome do clipe');
  expect(input.props.placeholder).toBe('Clipe #2 · 19:40');
  expect(input.props.maxLength).toBe(40);
  expect(screen.getByText('Corte: 0:30')).toBeTruthy();
});

test('a named clip shows its name', async () => {
  __setClip({ ...base, name: 'Ace no fundo' });
  await open();
  expect(screen.getByLabelText('Nome do clipe').props.value).toBe('Ace no fundo');
});

test('the clip is renamed on the same screen, saved on blur', async () => {
  await open();
  const input = screen.getByLabelText('Nome do clipe');
  await fireEvent.changeText(input, 'Match point');
  await fireEvent(input, 'blur');
  expect(repo.renameClip).toHaveBeenCalledWith('c1', 'Match point');
});

test('the top bar has icon buttons for delete, save to Photos and share, and no text "Salvar"', async () => {
  await open();
  const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
  expect(labels).toEqual(expect.arrayContaining(['Voltar', 'Apagar clipe', 'Salvar na galeria', 'Compartilhar']));
  expect(screen.queryByText('Salvar')).toBeNull();
  expect(screen.queryByText('Apagar clipe')).toBeNull();
  expect(screen.queryByText(/Story/)).toBeNull();
});

test('choosing a speed stores it on the clip', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 2x' }));
  expect(repo.updateClip).toHaveBeenCalledWith('c1', { edit: { speed: 2, muted: false } });
});

test('toggling sound stores muted', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { speed: 1, muted: true } });
});

test('at any speed but 1x the sound shows as off and cannot be turned on', async () => {
  __setClip({ ...base, edit: { speed: 1.5, muted: false } });
  await open();
  expect(screen.getByRole('button', { name: 'Som' })).toBeDisabled();
  expect(screen.getByText('Sem som')).toBeTruthy();
});

test('a clip saved with the old slow motion switch opens at 0.5x', async () => {
  __setClip({ ...base, edit: { slowmo: true, muted: false } });
  await open();
  expect(screen.getByRole('button', { name: 'Velocidade 0.5x' })).toBeSelected();
  expect(screen.getByText('Corte: 1:00')).toBeTruthy();
});

test('the cut label shows the length of the result, so 2x halves it', async () => {
  __setClip({ ...base, edit: { speed: 2, muted: false } });
  await open();
  expect(screen.getByText('Corte: 0:15')).toBeTruthy();
});

test('dragging a handle updates the time and shows that edge in the preview', async () => {
  await open();
  const bar = jest.requireMock('../../components/TrimBar').__props;
  await act(async () => bar.last.onChange({ startMs: 40000, endMs: 60000 }, 'start'));
  expect(screen.getByText('Corte: 0:20')).toBeTruthy();
  expect(player.pause).toHaveBeenCalled();
  expect(player.currentTime).toBe(40);
  await act(async () => bar.last.onChange({ startMs: 40000, endMs: 52000 }, 'end'));
  expect(player.currentTime).toBe(51.5);
});

test('letting go of a handle saves the cut and plays it from the start', async () => {
  await open();
  const bar = jest.requireMock('../../components/TrimBar').__props;
  await act(async () => bar.last.onChange({ startMs: 40000, endMs: 60000 }, 'start'));
  player.play.mockClear();
  await act(async () => bar.last.onCommit({ startMs: 40000, endMs: 60000 }));
  expect(repo.updateClip).toHaveBeenCalledWith('c1', { trim: { startMs: 40000, endMs: 60000 } });
  expect(player.currentTime).toBe(40);
  expect(player.play).toHaveBeenCalled();
});

test('the play button pauses and resumes, and a paused clip stays paused after a cut', async () => {
  await open();
  await pressAction('Pausar');
  expect(player.pause).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeTruthy();
  const bar = jest.requireMock('../../components/TrimBar').__props;
  await act(async () => bar.last.onChange({ startMs: 40000, endMs: 60000 }, 'start'));
  player.play.mockClear();
  await act(async () => bar.last.onCommit({ startMs: 40000, endMs: 60000 }));
  expect(player.play).not.toHaveBeenCalled();
  await pressAction('Reproduzir');
  expect(player.play).toHaveBeenCalled();
});

test('a gym clip allows cuts up to 120s', async () => {
  __setClip({ ...base, durationMs: 120000, trim: { startMs: 60000, endMs: 120000 } });
  await open();
  expect(jest.requireMock('../../components/TrimBar').__props.last.maxMs).toBe(120000);
});

test('a missing clip shows the message instead of the editor', async () => {
  __setClip(undefined);
  await open();
  expect(screen.getByText('Este clipe não está mais no celular.')).toBeTruthy();
});

test('deleting asks first, then removes the file and the clip', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await open();
  await pressAction('Apagar clipe');
  const confirm = alert.mock.calls[0][2]!.find((b) => b.text === 'Apagar')!;
  confirm.onPress!();
  expect(removeFile).toHaveBeenCalledWith('/c1.mp4');
  expect(repo.deleteClip).toHaveBeenCalledWith('c1');
  expect(router.back).toHaveBeenCalled();
});

test('Compartilhar exports with the cut, speed, zoom and no app mark (pro), then opens the share sheet', async () => {
  const zoom = { scale: 2, cx: 0.25, cy: 0.75 };
  __setClip({ ...base, edit: { speed: 2, muted: false, zoom } });
  await open();
  await pressAction('Compartilhar');
  expect(camera.exportClip).toHaveBeenCalledWith(
    expect.objectContaining({
      clipPath: '/c1.mp4', startMs: 30000, endMs: 60000, speed: 2, muted: true,
      crop: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      width: 1080, height: 1920, overlayPngPath: '/tmp/overlay.png', watermark: false,
    }),
  );
  expect(sharing.shareAsync).toHaveBeenCalledWith('file:///exports/e1.mp4', expect.objectContaining({ mimeType: 'video/mp4' }));
});

test.each(['pass', 'pro'])('on %s the overlay has no app mark', async (tier) => {
  payments.tierFor.mockImplementation(() => tier);
  await open();
  expect(screen.queryByText('feito com LANCE')).toBeNull();
});

test('Salvar na galeria asks for photo access and saves the export', async () => {
  await open();
  await pressAction('Salvar na galeria');
  expect(media.requestPermissionsAsync).toHaveBeenCalledWith(true, ['video']);
  expect(media.Asset.create).toHaveBeenCalledWith('file:///exports/e1.mp4');
  expect(screen.getByText('Salvo na galeria.')).toBeTruthy();
});

test('saving then sharing the same look exports only once', async () => {
  await open();
  await pressAction('Salvar na galeria');
  await pressAction('Compartilhar');
  expect(camera.exportClip).toHaveBeenCalledTimes(1);
});

test('ignores a second tap while exporting', async () => {
  let finish: (v: unknown) => void = () => {};
  camera.exportClip.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  await open();
  const share = screen.getByRole('button', { name: 'Compartilhar' });
  await act(async () => fireEvent.press(share));
  await act(async () => fireEvent.press(share));
  await act(async () => finish({ path: '/exports/e1.mp4', durationMs: 1 }));
  expect(camera.exportClip).toHaveBeenCalledTimes(1);
});

test('a failed export shows the error and re-enables the buttons', async () => {
  camera.exportClip.mockRejectedValueOnce(new Error('disk full'));
  await open();
  await pressAction('Compartilhar');
  expect(screen.getByText('Não foi possível preparar o vídeo. Tente de novo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeEnabled();
});

test('actions wait until the video shape is known', async () => {
  let resolve: (v: unknown) => void = () => {};
  (Image.getSize as jest.Mock).mockReturnValueOnce(new Promise((r) => (resolve = r)));
  await render(<ClipEditor />);
  expect(screen.getByRole('button', { name: 'Salvar na galeria' })).toBeDisabled();
  await act(async () => resolve({ width: 1080, height: 1920 }));
  expect(screen.getByRole('button', { name: 'Salvar na galeria' })).toBeEnabled();
});

test('a name typed without closing the keyboard is saved when the player shares', async () => {
  await open();
  await fireEvent.changeText(screen.getByLabelText('Nome do clipe'), 'Match point');
  await pressAction('Compartilhar');
  expect(repo.renameClip).toHaveBeenCalledWith('c1', 'Match point');
});

test('full screen shows only the video and a way out, then brings the editor back', async () => {
  await open();
  await pressAction('Tela cheia');
  expect(screen.getByRole('button', { name: 'Sair da tela cheia' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
  await pressAction('Sair da tela cheia');
  expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy();
});

test('a zoomed clip shows its zoom and can go back to 1x', async () => {
  __setClip({ ...base, edit: { speed: 1, muted: false, zoom: { scale: 2.5, cx: 0.5, cy: 0.5 } } });
  await open();
  expect(screen.getByText('2.5x  ✕')).toBeTruthy();
  await pressAction('Voltar zoom para 1x');
  expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { speed: 1, muted: false } });
});

test('Girar turns the video a quarter, stored on the clip, and starts the zoom over', async () => {
  __setClip({ ...base, edit: { speed: 1, muted: false, zoom: { scale: 2, cx: 0.5, cy: 0.5 } } });
  await open();
  await pressAction('Girar vídeo');
  expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { speed: 1, muted: false, rotation: 90 } });
});

test('turning a clip already turned three times brings it back to upright', async () => {
  __setClip({ ...base, edit: { speed: 1, muted: false, rotation: 270 } });
  await open();
  await pressAction('Girar vídeo');
  expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { speed: 1, muted: false } });
});

test('a turned clip exports with its rotation', async () => {
  __setClip({ ...base, edit: { speed: 1, muted: false, rotation: 90 } });
  await open();
  await pressAction('Compartilhar');
  expect(camera.exportClip).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
});

describe('a black start', () => {
  const short = { ...base, durationMs: 57000, trim: { startMs: 0, endMs: 54000 }, contentStartMs: undefined };

  test('is found when the editor first opens the clip and the cut moves past it', async () => {
    camera.findContentStart.mockResolvedValueOnce(11000);
    __setClip(short);
    await open();
    expect(camera.findContentStart).toHaveBeenCalledWith('/c1.mp4');
    expect(repo.updateClip).toHaveBeenCalledWith('c1', {
      contentStartMs: 10750,
      trim: { startMs: 10750, endMs: 54000 },
    });
    expect(player.currentTime).toBe(10.75);
  });

  test('is remembered as nothing to skip when the clip starts with a picture', async () => {
    __setClip(short);
    await open();
    expect(repo.updateClip).toHaveBeenCalledWith('c1', { contentStartMs: 0 });
  });

  test('is not looked for again once known', async () => {
    __setClip({ ...short, contentStartMs: 10750, trim: { startMs: 10750, endMs: 54000 } });
    await open();
    expect(camera.findContentStart).not.toHaveBeenCalled();
  });

  test('the track starts at the useful video: the left label shows its length, not the whole file', async () => {
    __setClip({ ...short, contentStartMs: 10750, trim: { startMs: 10750, endMs: 54000 } });
    await open();
    expect(screen.getByText('-0:46')).toBeTruthy();
    expect(jest.requireMock('../../components/TrimBar').__props.last.floorMs).toBe(10750);
  });
});

describe('on the free plan', () => {
  beforeEach(() => payments.tierFor.mockImplementation(() => 'free'));

  test('the export overlay carries the app mark and the export asks for it', async () => {
    await open();
    expect(screen.getAllByText('feito com LANCE').length).toBe(2); // preview + capture copy
    await pressAction('Compartilhar');
    expect(camera.exportClip).toHaveBeenCalledWith(expect.objectContaining({ watermark: true }));
  });

  test('a locked clip shows the lock and Liberar instead of the editor', async () => {
    __setClip({ ...base, locked: true });
    await open();
    expect(screen.getByText('Este clipe está bloqueado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar na galeria' })).toBeNull();
    await pressAction('Liberar');
    expect(payments.showPaywall).toHaveBeenCalledWith('s1');
    expect(camera.exportClip).not.toHaveBeenCalled();
  });

  test('the same locked clip opens the editor on the pro plan', async () => {
    payments.tierFor.mockImplementation(() => 'pro');
    __setClip({ ...base, locked: true });
    await open();
    expect(screen.queryByText('Este clipe está bloqueado')).toBeNull();
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeTruthy();
  });

  test('0.5x opens the paywall and leaves the speed alone', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 0.5x' }));
    expect(payments.showPaywall).toHaveBeenCalledWith('s1');
    expect(repo.updateClip).not.toHaveBeenCalled();
  });

  test('1.5x and 2x still work', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 1.5x' }));
    expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { speed: 1.5, muted: false } });
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 2x' }));
    expect(repo.updateClip).toHaveBeenLastCalledWith('c1', { edit: { speed: 2, muted: false } });
    expect(payments.showPaywall).not.toHaveBeenCalled();
  });
});

test('on pro, 0.5x changes the speed', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 0.5x' }));
  expect(repo.updateClip).toHaveBeenCalledWith('c1', { edit: { speed: 0.5, muted: false } });
  expect(payments.showPaywall).not.toHaveBeenCalled();
});
