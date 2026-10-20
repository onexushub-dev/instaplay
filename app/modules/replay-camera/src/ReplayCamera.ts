import ReplayCameraModule from './ReplayCameraModule';
import type {
  ExportClipOptions,
  ExportedClip,
  ReplayCameraModuleEvents,
  SaveClipOptions,
  RemotePairing,
  RemotePeer,
  SavedClip,
  SessionOptions,
  WatchStatus,
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

/** Whether a watch is paired and has the app (iOS; always 'unsupported' on Android for now). */
export function getWatchStatus(): WatchStatus {
  return ReplayCameraModule.getWatchStatus();
}

/** Tells the watch how the recording stands: it shows the time and clip count. */
export function watchSync(state: { recording: boolean; clipCount: number; startedAt?: number }): void {
  ReplayCameraModule.watchSync(state.recording, state.clipCount, state.startedAt ?? null);
}

/** Makes the watch vibrate for a clip that was saved (true) or a save that failed (false). */
export function watchSignal(saved: boolean): void {
  ReplayCameraModule.watchSignal(saved);
}

/** Listens for "salvar" or "gravar" in the game's audio (iOS; no-op on Android for now). */
export function setVoiceEnabled(enabled: boolean): void {
  ReplayCameraModule.setVoiceEnabled(enabled);
}

/** True when this phone can recognize "salvar"/"gravar" offline (iOS with the on-device pt-BR model). */
export function isVoiceSupported(): boolean {
  return ReplayCameraModule.isVoiceSupported();
}

/** Current speech-recognition permission, without asking. */
export function getSpeechPermission(): 'granted' | 'denied' | 'undetermined' {
  return ReplayCameraModule.getSpeechPermission();
}

/** Asks for speech recognition; resolves true when granted (always false on Android for now). */
export function requestSpeechPermission(): Promise<boolean> {
  return ReplayCameraModule.requestSpeechPermission();
}

/** Writes a JPEG frame of the clip at `atMs` next to it (<clip>.jpg, reused if present) and resolves its path. */
export function createThumbnail(clipPath: string, atMs: number): Promise<string> {
  return ReplayCameraModule.createThumbnail(clipPath, atMs);
}

/** Time in ms where the clip's picture begins after a black start; 0 when it starts with a picture (always 0 on Android for now). */
export async function findContentStart(clipPath: string): Promise<number> {
  return (await ReplayCameraModule.findContentStart?.(clipPath)) ?? 0;
}

/** Renders the cut (optionally slowed/muted) into a width×height video with the overlay on top. */
export function exportClip(opts: ExportClipOptions): Promise<ExportedClip> {
  return ReplayCameraModule.exportClip(opts);
}

/** Opens Instagram's Story composer with the video; 'unavailable' without a Meta App ID or Instagram. */
export function shareToInstagramStory(videoPath: string, metaAppId: string): Promise<'opened' | 'unavailable'> {
  return ReplayCameraModule.shareToInstagramStory(videoPath, metaAppId);
}

// ---- Second iPhone as a remote (iOS only). Without the native functions every call does nothing.

/** Whether this phone can pair with another one as camera or as remote. False on Android for now. */
export function isRemoteSupported(): boolean {
  return typeof ReplayCameraModule.remoteHostStart === 'function';
}

/** Camera phone: wait for paired remotes (and for an open pairing) while the setup screen is in front. */
export function remoteHostStart(): void {
  if (ReplayCameraModule.remoteHostStart) ReplayCameraModule.remoteHostStart();
}

export function remoteHostStop(): void {
  if (ReplayCameraModule.remoteHostStop) ReplayCameraModule.remoteHostStop();
}

/** Opens a pairing: the QR link, the 6-digit code and when they expire. Null when four remotes are already paired. */
export function remoteHostBeginPairing(): RemotePairing | null {
  return ReplayCameraModule.remoteHostBeginPairing ? ReplayCameraModule.remoteHostBeginPairing() : null;
}

export function remoteHostEndPairing(): void {
  if (ReplayCameraModule.remoteHostEndPairing) ReplayCameraModule.remoteHostEndPairing();
}

export function remoteHostPeers(): RemotePeer[] {
  return ReplayCameraModule.remoteHostPeers ? ReplayCameraModule.remoteHostPeers() : [];
}

export function remoteHostRemove(id: string): void {
  if (ReplayCameraModule.remoteHostRemove) ReplayCameraModule.remoteHostRemove(id);
}

/** Camera phone: how many remotes are connected right now. */
export function remoteHostControllers(): number {
  return ReplayCameraModule.remoteHostControllers ? ReplayCameraModule.remoteHostControllers() : 0;
}

/** Camera phone → remotes: the same state the watch gets. */
export function remoteSync(state: { recording: boolean; clipCount: number; startedAt?: number }): void {
  if (ReplayCameraModule.remoteSync) {
    ReplayCameraModule.remoteSync(state.recording, state.clipCount, state.startedAt === undefined ? null : state.startedAt);
  }
}

/** Camera phone → remotes: how the last save ended (they vibrate). */
export function remoteSignal(saved: boolean): void {
  if (ReplayCameraModule.remoteSignal) ReplayCameraModule.remoteSignal(saved);
}

/** Remote phone: look for the paired camera phone and keep the link up. */
export function remoteControllerStart(): void {
  if (ReplayCameraModule.remoteControllerStart) ReplayCameraModule.remoteControllerStart();
}

export function remoteControllerStop(): void {
  if (ReplayCameraModule.remoteControllerStop) ReplayCameraModule.remoteControllerStop();
}

/** The camera phone this remote is paired with, if any. */
export function remoteControllerHost(): RemotePeer | null {
  return ReplayCameraModule.remoteControllerHost ? ReplayCameraModule.remoteControllerHost() : null;
}

export function remoteControllerForget(): void {
  if (ReplayCameraModule.remoteControllerForget) ReplayCameraModule.remoteControllerForget();
}

/** Pairs with the camera phone named in a scanned `lance://pair` link; the result arrives as `onRemotePairing`. */
export function remoteControllerPairWithLink(hostId: string, secret: string, hostName: string): void {
  if (ReplayCameraModule.remoteControllerPairWithLink) {
    ReplayCameraModule.remoteControllerPairWithLink(hostId, secret, hostName);
  }
}

/** Pairs with whichever camera phone shows this 6-digit code; the result arrives as `onRemotePairing`. */
export function remoteControllerPairWithCode(code: string): void {
  if (ReplayCameraModule.remoteControllerPairWithCode) ReplayCameraModule.remoteControllerPairWithCode(code);
}

/** Remote phone: ask the camera phone to save a clip. */
export function remoteControllerSave(): void {
  if (ReplayCameraModule.remoteControllerSave) ReplayCameraModule.remoteControllerSave();
}

/** Remote phone: ask the camera phone to end the recording (what holding its own "Segure para encerrar" does). */
export function remoteControllerEndRecording(): void {
  if (ReplayCameraModule.remoteControllerEndRecording) ReplayCameraModule.remoteControllerEndRecording();
}

/** The name this phone shows to the other one while pairing ("iPhone XR#1234" unless the person renamed it). */
export function remoteDeviceName(): string {
  return ReplayCameraModule.remoteDeviceName ? ReplayCameraModule.remoteDeviceName() : '';
}

/** Renames this phone for the next pairings; an empty name goes back to the default. */
export function remoteSetDeviceName(name: string): void {
  if (ReplayCameraModule.remoteSetDeviceName) ReplayCameraModule.remoteSetDeviceName(name);
}

export function addReplayListener<E extends keyof ReplayCameraModuleEvents>(
  event: E,
  listener: ReplayCameraModuleEvents[E]
) {
  return ReplayCameraModule.addListener(event, listener);
}
