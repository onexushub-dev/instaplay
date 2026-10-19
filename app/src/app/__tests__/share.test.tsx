import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'react-native';

import ShareScreen from '../share/[clipId]';

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ clipId: 'c1' }) }));
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove() {} }), play() {} }), VideoView: () => null }));
jest.mock('expo-file-system', () => ({ File: class { delete() {} } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: jest.fn(async () => ({})) },
}));
jest.mock('../../share/captureOverlay', () => ({ captureOverlay: jest.fn(async () => '/tmp/overlay.png') }));
jest.mock('../../../modules/replay-camera', () => ({
  exportClip: jest.fn(async () => ({ path: '/exports/e1.mp4', durationMs: 30000 })),
  createThumbnail: jest.fn(async () => '/c1.jpg'),
}));
jest.mock('../../data/mmkv', () => {
  return {
    repo: {
      getClip: () => ({ id: 'c1', sessionId: 's1', createdAt: 0, source: 'screen', path: '/c1.mp4', durationMs: 60000,
        trim: { startMs: 30000, endMs: 60000 }, edit: { slowmo: true, muted: false } }),
      getSession: jest.fn(() => ({ id: 's1', sport: 'quadra', startedAt: new Date(2026, 9, 17, 19, 40).getTime() })),
    },
  };
});

const camera = jest.requireMock('../../../modules/replay-camera');
const sharing = jest.requireMock('expo-sharing');
const media = jest.requireMock('expo-media-library');

beforeEach(() => {
  jest.clearAllMocks();
  // jest-expo's ImageLoader mock predates RN 0.88's promise-based getSize.
  (jest.spyOn(Image, 'getSize') as jest.Mock).mockResolvedValue({ width: 1920, height: 1080 });
});

test('Compartilhar exports with the clip\'s cut, edits and the app mark, then opens the share sheet', async () => {
  await render(<ShareScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' })));
  expect(camera.exportClip).toHaveBeenCalledWith(
    expect.objectContaining({ clipPath: '/c1.mp4', startMs: 30000, endMs: 60000, speed: 0.5, muted: true,
      width: 1080, height: 1920, overlayPngPath: '/tmp/overlay.png', watermark: true })
  );
  expect(sharing.shareAsync).toHaveBeenCalledWith('file:///exports/e1.mp4', expect.objectContaining({ mimeType: 'video/mp4' }));
});

test('the screen offers exactly two actions: Salvar na galeria and Compartilhar', async () => {
  await render(<ShareScreen />);
  await act(async () => {});
  const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel).filter(Boolean);
  expect(labels.filter((l: string) => l !== 'Voltar').sort()).toEqual(['Compartilhar', 'Salvar na galeria']);
  expect(screen.queryByText(/Story/)).toBeNull();
  expect(screen.queryByLabelText(/arena|Exercício/i)).toBeNull();
});

test('ignores a second tap while exporting', async () => {
  let finish: (v: unknown) => void = () => {};
  camera.exportClip.mockImplementationOnce(() => new Promise((r) => (finish = r)));
  await render(<ShareScreen />);
  await act(async () => {});
  const share = screen.getByRole('button', { name: 'Compartilhar' });
  await act(async () => fireEvent.press(share));
  await act(async () => fireEvent.press(share));
  await act(async () => finish({ path: '/exports/e1.mp4', durationMs: 1 }));
  expect(camera.exportClip).toHaveBeenCalledTimes(1);
});

test('a failed export shows the error and re-enables the buttons', async () => {
  camera.exportClip.mockRejectedValueOnce(new Error('disk full'));
  await render(<ShareScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' })));
  expect(screen.getByText('Não foi possível preparar o vídeo. Tente de novo.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeEnabled();
});

test('Salvar na galeria asks for photo access and saves the export', async () => {
  await render(<ShareScreen />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Salvar na galeria' })));
  expect(media.requestPermissionsAsync).toHaveBeenCalledWith(true, ['video']);
  expect(media.Asset.create).toHaveBeenCalledWith('file:///exports/e1.mp4');
  expect(screen.getByText('Salvo na galeria.')).toBeTruthy();
});

test('actions wait until the video shape is known', async () => {
  let resolve: (v: unknown) => void = () => {};
  (Image.getSize as jest.Mock).mockReturnValueOnce(new Promise((r) => (resolve = r)));
  await render(<ShareScreen />);
  expect(screen.getByRole('button', { name: 'Salvar na galeria' })).toBeDisabled();
  await act(async () => resolve({ width: 1080, height: 1920 }));
  expect(screen.getByRole('button', { name: 'Salvar na galeria' })).toBeEnabled();
});
