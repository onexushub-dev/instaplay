import { act, renderHook } from '@testing-library/react-native';

import { useVolumeRemote } from '../useVolumeRemote';

type Listener = (r: { volume: number }) => void;

jest.mock('react-native-volume-manager', () => {
  const state = { listeners: new Set<Listener>(), volume: 0.5 };
  return {
    __state: state,
    VolumeManager: {
      getVolume: jest.fn(async () => ({ volume: state.volume })),
      setVolume: jest.fn(async (v: number) => {
        state.volume = v;
        state.listeners.forEach((l) => l({ volume: v })); // the OS reports our own reset too
      }),
      showNativeVolumeUI: jest.fn(async () => {}),
      addVolumeListener: jest.fn((l: Listener) => {
        state.listeners.add(l);
        return { remove: () => state.listeners.delete(l) };
      }),
    },
  };
});

const lib = jest.requireMock('react-native-volume-manager');
const press = (volume: number) => lib.__state.listeners.forEach((l: Listener) => l({ volume }));

beforeEach(() => {
  jest.clearAllMocks();
  lib.__state.listeners.clear();
  lib.__state.volume = 0.5;
});

test('a volume press calls onPress once and restores the starting level', async () => {
  const onPress = jest.fn();
  await renderHook(() => useVolumeRemote(true, onPress));

  expect(lib.VolumeManager.showNativeVolumeUI).toHaveBeenCalledWith({ enabled: false });
  expect(lib.__state.listeners.size).toBe(1);

  await act(async () => press(0.5625));

  expect(onPress).toHaveBeenCalledTimes(1);
  expect(lib.VolumeManager.setVolume).toHaveBeenLastCalledWith(0.5, expect.anything());
});

test('a phone at max volume is moved down so presses still register', async () => {
  lib.__state.volume = 1;
  await renderHook(() => useVolumeRemote(true, jest.fn()));
  expect(lib.VolumeManager.setVolume).toHaveBeenCalledWith(0.5, expect.anything());
});

test('unmounting stops listening and shows the system volume UI again', async () => {
  const onPress = jest.fn();
  const { unmount } = await renderHook(() => useVolumeRemote(true, onPress));
  await act(async () => unmount());

  expect(lib.__state.listeners.size).toBe(0);
  expect(lib.VolumeManager.showNativeVolumeUI).toHaveBeenLastCalledWith({ enabled: true });
});

test('disabled does nothing', async () => {
  await renderHook(() => useVolumeRemote(false, jest.fn()));
  expect(lib.VolumeManager.addVolumeListener).not.toHaveBeenCalled();
});
