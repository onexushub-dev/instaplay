import type { StyleProp, ViewStyle } from 'react-native';

export type Lens = 'ultraWide' | 'wide';
export type Quality = '1080p60' | '720p30';
export type TriggerSource = 'screen' | 'gesture' | 'remote' | 'watch';
export type ThermalLevel = 'nominal' | 'fair' | 'serious' | 'critical';
export type ReplayErrorCode =
  | 'LOW_STORAGE'
  | 'CAMERA_PERMISSION'
  | 'CAMERA_UNAVAILABLE'
  | 'ENCODER_FAILED'
  | 'NO_SESSION';

export type SessionOptions = { lens: Lens; maxQuality: Quality };
/** `at` = ms since epoch when the trigger happened. */
export type SaveClipOptions = { source: TriggerSource; at: number };
export type SavedClip = { clipPath: string; durationMs: number };

export type ReplayCameraModuleEvents = {
  onTrigger: (e: { source: TriggerSource; at: number }) => void;
  onThermalChange: (e: { level: ThermalLevel; degraded: boolean }) => void;
  onInterrupted: () => void;
  onResumed: () => void;
  onError: (e: { code: ReplayErrorCode; message: string }) => void;
};

export type ReplayCameraViewProps = {
  style?: StyleProp<ViewStyle>;
};
