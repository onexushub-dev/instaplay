import { act, renderHook } from '@testing-library/react-native';

import { getDeviceUpright } from '../../../modules/replay-camera';
import { isLandscape, useDeviceLandscape } from '../useDeviceLandscape';

jest.mock('../../../modules/replay-camera', () => ({ getDeviceUpright: jest.fn(() => 'portrait') }));

const upright = getDeviceUpright as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  upright.mockReset();
  upright.mockReturnValue('portrait');
});
afterEach(() => jest.useRealTimers());

test('only the two sideways positions count as landscape', () => {
  expect(isLandscape('landscapeLeft')).toBe(true);
  expect(isLandscape('landscapeRight')).toBe(true);
  expect(isLandscape('portrait')).toBe(false);
  expect(isLandscape('portraitUpsideDown')).toBe(false);
});

test('a phone already on its side is landscape at once', async () => {
  upright.mockReturnValue('landscapeRight');
  const { result } = await renderHook(() => useDeviceLandscape(true));
  expect(result.current).toBe(true);
});

test('turning the phone changes the layout only after two matching reads', async () => {
  const { result } = await renderHook(() => useDeviceLandscape(true));
  expect(result.current).toBe(false);
  await act(async () => jest.advanceTimersByTime(300)); // first read, still upright
  upright.mockReturnValue('landscapeLeft');
  await act(async () => jest.advanceTimersByTime(300));
  expect(result.current).toBe(false);
  await act(async () => jest.advanceTimersByTime(300));
  expect(result.current).toBe(true);
});

test('a tilt in passing does not flip the layout', async () => {
  const { result } = await renderHook(() => useDeviceLandscape(true));
  await act(async () => jest.advanceTimersByTime(300));
  upright.mockReturnValue('landscapeLeft');
  await act(async () => jest.advanceTimersByTime(300));
  upright.mockReturnValue('portrait');
  await act(async () => jest.advanceTimersByTime(900));
  expect(result.current).toBe(false);
});

test('inactive means portrait layout and no reading', async () => {
  upright.mockReturnValue('landscapeLeft');
  const { result } = await renderHook(() => useDeviceLandscape(false));
  await act(async () => jest.advanceTimersByTime(1000));
  expect(result.current).toBe(false);
  expect(upright).not.toHaveBeenCalled();
});
