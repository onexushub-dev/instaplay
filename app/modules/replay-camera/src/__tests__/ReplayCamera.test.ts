/// <reference types="jest" />
jest.mock('expo', () => {
  const mockNative = {
    startSession: jest.fn(),
    stopSession: jest.fn(),
    saveClip: jest.fn(),
    setGestureEnabled: jest.fn(),
    addListener: jest.fn(),
    requestPermissions: jest.fn(),
  };
  return { requireNativeModule: () => mockNative, NativeModule: class {} };
});

import { requestPermissions, saveClip, startSession } from '../ReplayCamera';

const mockNative = jest.requireMock('expo').requireNativeModule();

beforeEach(() => jest.clearAllMocks());

test('saveClip forwards the trigger and resolves the native result', async () => {
  mockNative.saveClip.mockResolvedValue({ clipPath: '/clips/a.mp4', durationMs: 60000 });

  await expect(saveClip({ source: 'screen', at: 1 })).resolves.toEqual({
    clipPath: '/clips/a.mp4',
    durationMs: 60000,
  });
  expect(mockNative.saveClip).toHaveBeenCalledWith({ source: 'screen', at: 1 });
});

test('startSession rejects with LOW_STORAGE when native refuses for space', async () => {
  mockNative.startSession.mockRejectedValue(
    Object.assign(new Error('Not enough space'), { code: 'LOW_STORAGE' })
  );

  await expect(startSession({ lens: 'ultraWide', maxQuality: '1080p60' })).rejects.toMatchObject({
    code: 'LOW_STORAGE',
  });
  expect(mockNative.startSession).toHaveBeenCalledWith({ lens: 'ultraWide', maxQuality: '1080p60' });
});

test('requestPermissions resolves whether camera and microphone were granted', async () => {
  mockNative.requestPermissions.mockResolvedValue(false);

  await expect(requestPermissions()).resolves.toBe(false);
});
