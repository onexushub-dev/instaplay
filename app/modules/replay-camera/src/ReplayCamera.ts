import ReplayCameraModule from './ReplayCameraModule';
import type {
  ExportClipOptions,
  ExportedClip,
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

/** Listens for "salvar" or "gravar" in the game's audio (iOS; no-op on Android for now). */
export function setVoiceEnabled(enabled: boolean): void {
  ReplayCameraModule.setVoiceEnabled(enabled);
}

/** True when this phone can recognize "salvar"/"gravar" offline (iOS with the on-device pt-BR model). */
export function isVoiceSupported(): boolean {
  return ReplayCameraModule.isVoiceSupported();
}

/** Asks for speech recognition; resolves true when granted (always false on Android for now). */
export function requestSpeechPermission(): Promise<boolean> {
  return ReplayCameraModule.requestSpeechPermission();
}

/** Writes a JPEG frame of the clip at `atMs` next to it (<clip>.jpg, reused if present) and resolves its path. */
export function createThumbnail(clipPath: string, atMs: number): Promise<string> {
  return ReplayCameraModule.createThumbnail(clipPath, atMs);
}

/** Renders the cut (optionally slowed/muted) into a width×height video with the overlay on top. */
export function exportClip(opts: ExportClipOptions): Promise<ExportedClip> {
  return ReplayCameraModule.exportClip(opts);
}

/** Opens Instagram's Story composer with the video; 'unavailable' without a Meta App ID or Instagram. */
export function shareToInstagramStory(videoPath: string, metaAppId: string): Promise<'opened' | 'unavailable'> {
  return ReplayCameraModule.shareToInstagramStory(videoPath, metaAppId);
}

export function addReplayListener<E extends keyof ReplayCameraModuleEvents>(
  event: E,
  listener: ReplayCameraModuleEvents[E]
) {
  return ReplayCameraModule.addListener(event, listener);
}
