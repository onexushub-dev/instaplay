import { NativeModule, requireNativeModule } from 'expo';

import type {
  ExportClipOptions,
  ExportedClip,
  ReplayCameraModuleEvents,
  SaveClipOptions,
  SavedClip,
  SessionOptions,
  WatchStatus,
} from './ReplayCamera.types';

declare class ReplayCameraModule extends NativeModule<ReplayCameraModuleEvents> {
  startSession(opts: SessionOptions): Promise<void>;
  stopSession(): Promise<void>;
  saveClip(opts: SaveClipOptions): Promise<SavedClip>;
  setGestureEnabled(enabled: boolean): void;
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
  shareToInstagramStory(videoPath: string, metaAppId: string): Promise<'opened' | 'unavailable'>;
}

export default requireNativeModule<ReplayCameraModule>('ReplayCamera');
