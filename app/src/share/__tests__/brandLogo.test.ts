import { Image } from 'react-native';

import { LOGO_WAIT_MS, logoAspect, preloadLogo } from '../brandLogo';

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('the aspect comes from the image itself, so a new logo with another shape is not stretched', () => {
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'x', width: 1200, height: 300, scale: 1 });
  expect(logoAspect()).toBe(4);
});

test('without a readable size the aspect falls back to a sane number', () => {
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue(undefined as never);
  expect(logoAspect()).toBeGreaterThan(1);
});

test('preloading asks the image cache for the logo and waits for it', async () => {
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'file:///logo.png', width: 10, height: 2, scale: 1 });
  const prefetch = jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  await preloadLogo();
  expect(prefetch).toHaveBeenCalledWith('file:///logo.png');
});

test('a failing preload never blocks the export', async () => {
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'file:///logo.png', width: 10, height: 2, scale: 1 });
  jest.spyOn(Image, 'prefetch').mockRejectedValue(new Error('boom'));
  await expect(preloadLogo()).resolves.toBeUndefined();
});

test('a preload that never finishes is given up on after the wait limit', async () => {
  jest.useFakeTimers();
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({ uri: 'file:///logo.png', width: 10, height: 2, scale: 1 });
  jest.spyOn(Image, 'prefetch').mockReturnValue(new Promise<boolean>(() => {}));
  let done = false;
  const pending = preloadLogo().then(() => {
    done = true;
  });
  await jest.advanceTimersByTimeAsync(LOGO_WAIT_MS - 1);
  expect(done).toBe(false);
  await jest.advanceTimersByTimeAsync(2);
  await pending;
  expect(done).toBe(true);
});
