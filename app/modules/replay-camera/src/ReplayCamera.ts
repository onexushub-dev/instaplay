import ReplayCameraModule from './ReplayCameraModule';
import type {
  ReplayCameraModuleEvents,
  SaveClipOptions,
  SavedClip,
  SessionOptions,
} from './ReplayCamera.types';

// Native rejections carry `code` (a ReplayErrorCode), so callers can branch on it.

/** Asks for camera and microphone; resolves true when the camera is granted. */
export function requestPermissions(): Promise<boolean> {
  return ReplayCameraModule.requestPermissions();
}

export function startSession(opts: SessionOptions): Promise<void> {
  return ReplayCameraModule.startSession(opts);
}

export function stopSession(): Promise<void> {
  return ReplayCameraModule.stopSession();
}

export function saveClip(opts: SaveClipOptions): Promise<SavedClip> {
  return ReplayCameraModule.saveClip(opts);
}

export function setGestureEnabled(enabled: boolean): void {
  ReplayCameraModule.setGestureEnabled(enabled);
}

export function addReplayListener<E extends keyof ReplayCameraModuleEvents>(
  event: E,
  listener: ReplayCameraModuleEvents[E]
) {
  return ReplayCameraModule.addListener(event, listener);
}
