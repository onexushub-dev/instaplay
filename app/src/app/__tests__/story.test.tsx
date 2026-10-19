import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'react-native';

import StoryScreen from '../story/[clipId]';

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ clipId: 'c1' }) }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { metaAppId: '123' } } }));
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove() {} }), play() {} }), VideoView: () => null }));
jest.mock('expo-file-system', () => ({ File: class { delete() {} } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: jest.fn(async () => ({})) },
}));
jest.mock('../../story/captureOverlay', () => ({ captureOverlay: jest.fn(async () => '/tmp/overlay.png') }));
jest.mock('../../../modules/replay-camera', () => ({
  exportClip: jest.fn(async () => ({ path: '/exports/e1.mp4', durationMs: 30000 })),
  shareToInstagramStory: jest.fn(async () => 'opened'),
  createThumbnail: jest.fn(async () => '/c1.jpg'),
}));
jest.mock('../../data/mmkv', () => {
  let prefs: any = { storyTemplate: 'placar' };
  return {
    repo: {
      getClip: () => ({ id: 'c1', sessionId: 's1', createdAt: 0, source: 'screen', path: '/c1.mp4', durationMs: 60000,
        trim: { startMs: 30000, endMs: 60000 }, edit: { slowmo: true, muted: false } }),
      getSession: () => ({ id: 's1', sport: 'beachTennis', startedAt: new Date(2026, 9, 17, 19, 40).getTime() }),
      getPrefs: () => prefs,
      setPrefs: jest.fn((p: object) => (prefs = { ...prefs, ...p })),
    },
  };
});

const camera = jest.requireMock('../../../modules/replay-camera');
const sharing = jest.requireMock('expo-sharing');
const media = jest.requireMock('expo-media-library');
const { repo } = jest.requireMock('../../data/mmkv');

beforeEach(() => {
  jest.clearAllMocks();
  // jest-expo's ImageLoader mock predates RN 0.88's promise-based getSize.
  (jest.spyOn(Image, 'getSize') as jest.Mock).mockResolvedValue({ width: 1920, height: 1080 });
});

test("Postar no Story exports with the clip's cut and edits, then opens Instagram", async () => {
  await render(<StoryScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Postar no Story' })));
  expect(camera.exportClip).toHaveBeenCalledWith(
    expect.objectContaining({ clipPath: '/c1.mp4', startMs: 30000, endMs: 60000, speed: 0.5, muted: true,
      width: 1080, height: 1920, overlayPngPath: '/tmp/overlay.png' })
  );
  expect(camera.shareToInstagramStory).toHaveBeenCalledWith('/exports/e1.mp4', '123');
});

test('when Instagram is unavailable it falls back to the share sheet and says so', async () => {
  camera.shareToInstagramStory.mockResolvedValueOnce('unavailable');
  await render(<StoryScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Postar no Story' })));
  expect(sharing.shareAsync).toHaveBeenCalledWith('file:///exports/e1.mp4', expect.objectContaining({ mimeType: 'video/mp4' }));
  expect(screen.getByText('Instagram não encontrado. Escolha onde compartilhar.')).toBeTruthy();
});

test('ignores a second post while exporting', async () => {
  let finish: (v: unknown) => void = () => {};
  camera.exportClip.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  await render(<StoryScreen />);
  await act(async () => {});
  const post = screen.getByRole('button', { name: 'Postar no Story' });
  await act(async () => fireEvent.press(post));
  await act(async () => fireEvent.press(post));
  await act(async () => finish({ path: '/exports/e1.mp4', durationMs: 1 }));
  expect(camera.exportClip).toHaveBeenCalledTimes(1);
});

test('a failed export shows the error and re-enables the buttons', async () => {
  camera.exportClip.mockRejectedValueOnce(new Error('disk full'));
  await render(<StoryScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Postar no Story' })));
  expect(screen.getByText('Não foi possível preparar o vídeo. Tente de novo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Postar no Story' })).toBeEnabled();
});

test('Salvar na galeria asks for photo access and saves the export', async () => {
  await render(<StoryScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Salvar na galeria' })));
  expect(media.requestPermissionsAsync).toHaveBeenCalledWith(true, ['video']);
  expect(media.Asset.create).toHaveBeenCalledWith('file:///exports/e1.mp4');
  expect(screen.getByText('Salvo na galeria.')).toBeTruthy();
});

test('choosing a template and typing the arena stores them in prefs', async () => {
  await render(<StoryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Minimal' }));
  expect(repo.setPrefs).toHaveBeenCalledWith({ storyTemplate: 'minimal' });
  await fireEvent.changeText(screen.getByLabelText('Nome da arena (opcional)'), 'Arena Sol');
  await fireEvent(screen.getByLabelText('Nome da arena (opcional)'), 'blur');
  expect(repo.setPrefs).toHaveBeenCalledWith({ arenaName: 'Arena Sol' });
});

test('actions wait until the video shape is known', async () => {
  let resolve: (v: unknown) => void = () => {};
  (Image.getSize as jest.Mock).mockReturnValueOnce(new Promise((r) => (resolve = r)));
  await render(<StoryScreen />);
  expect(screen.getByRole('button', { name: 'Salvar na galeria' })).toBeDisabled();
  await act(async () => resolve({ width: 1080, height: 1920 }));
  expect(screen.getByRole('button', { name: 'Salvar na galeria' })).toBeEnabled();
});

test('an arena typed without closing the keyboard is used and saved', async () => {
  await render(<StoryScreen />);
  await act(async () => {});
  await fireEvent.changeText(screen.getByLabelText('Nome da arena (opcional)'), 'Serrinha');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Salvar na galeria' })));
  expect(repo.setPrefs).toHaveBeenCalledWith({ arenaName: 'Serrinha' });
});
