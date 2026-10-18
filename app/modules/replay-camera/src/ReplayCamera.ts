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

/** Short "saved" chime and/or two blinks of the rear torch, so a player far from the phone knows. */
export function signalSaved({ sound, flash }: { sound: boolean; flash: boolean }): void {
  ReplayCameraModule.signalSaved(sound, flash);
}

/** Distinct low double beep when a save fails. */
export function signalSaveFailed({ sound }: { sound: boolean }): void {
  ReplayCameraModule.signalSaveFailed(sound);
}

/** Listens for "salva lance" in the game's audio (iOS; no-op on Android for now). */
export function setVoiceEnabled(enabled: boolean): void {
  ReplayCameraModule.setVoiceEnabled(enabled);
}

/** Asks for speech recognition; resolves true when granted (always false on Android for now). */
export function requestSpeechPermission(): Promise<boolean> {
  return ReplayCameraModule.requestSpeechPermission();
}

/** Writes a JPEG frame of the clip at `atMs` next to it (<clip>.jpg, reused if present) and resolves its path. */
export function createThumbnail(clipPath: string, atMs: number): Promise<string> {
  return ReplayCameraModule.createThumbnail(clipPath, atMs);
}

export function addReplayListener<E extends keyof ReplayCameraModuleEvents>(
  event: E,
  listener: ReplayCameraModuleEvents[E]
) {
  return ReplayCameraModule.addListener(event, listener);
}
