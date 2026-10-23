import { NativeModule, requireNativeModule } from 'expo';

import type {
  DeviceUpright,
  ExportClipOptions,
  ExportedClip,
  ReplayCameraModuleEvents,
  SaveClipOptions,
  RemotePairing,
  RemotePeer,
  SavedClip,
  SessionOptions,
  WatchStatus,
  ZoomRange,
} from './ReplayCamera.types';

declare class ReplayCameraModule extends NativeModule<ReplayCameraModuleEvents> {
  startSession(opts: SessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  saveClip(opts: SaveClipOptions): Promise<SavedClip>;
  setGestureEnabled(enabled: boolean): void;
  // The phone's position (iOS only: missing on Android and in older builds).
  getUpright?(): DeviceUpright;
  // Step 0 Bluetooth LE spike (iOS only).
  bleSpikeCamera?(): void;
  bleSpikeRemote?(): void;
  bleSpikeThroughput?(): void;
  bleSpikeForget?(): void;
  bleSpikeStop?(): void;
  // Continuous zoom (iOS only: missing on Android and in older builds).
  getZoomRange?(): ZoomRange;
  setZoom?(factor: number, animated: boolean): void;
  requestPermissions(): Promise<boolean>;
  signalSaved(sound: boolean, flash: boolean): void;
  signalSaveFailed(sound: boolean): void;
  setVoiceEnabled(enabled: boolean): void;
  requestSpeechPermission(): Promise<boolean>;
  isVoiceSupported(): boolean;
  getSpeechPermission(): 'granted' | 'denied' | 'undetermined';
  createThumbnail(clipPath: string, atMs: number): Promise<string>;
  findContentStart?(clipPath: string): Promise<number>;
  exportClip(opts: ExportClipOptions): Promise<ExportedClip>;
  getWatchStatus(): WatchStatus;
  watchSync(recording: boolean, clipCount: number, startedAt: number | null): void;
  watchSignal(saved: boolean): void;
  // Second iPhone as a remote (iOS only: these are missing on Android).
  remoteHostStart?(): void;
  remoteHostStop?(): void;
  remoteHostBeginPairing?(): RemotePairing | null;
  remoteHostEndPairing?(): void;
  remoteHostPeers?(): RemotePeer[];
  remoteHostRemove?(id: string): void;
  remoteHostCheck?(id: string): void;
  remoteHostControllers?(): number;
  remoteSync?(recording: boolean, clipCount: number, startedAt: number | null): void;
  remoteSignal?(saved: boolean): void;
  remoteControllerStart?(): void;
  remoteControllerStop?(): void;
  remoteControllerHost?(): RemotePeer | null;
  remoteControllerForget?(): void;
  remoteControllerPairWithLink?(hostId: string, secret: string, hostName: string): void;
  remoteControllerPairWithCode?(code: string): void;
  remoteControllerSave?(): void;
  remoteControllerEndRecording?(): void;
  remoteControllerStartRecording?(): void;
  remoteControllerPreview?(on: boolean): void;
  remoteDeviceName?(): string;
  remoteSetDeviceName?(name: string): void;
  shareToInstagramStory(videoPath: string, metaAppId: string): Promise<'opened' | 'unavailable'>;
}

export default requireNativeModule<ReplayCameraModule>('ReplayCamera');
