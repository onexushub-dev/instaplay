import type { StyleProp, ViewStyle } from 'react-native';

export type Lens = 'ultraWide' | 'wide';
export type Quality = '1080p60' | '720p30';
export type TriggerSource = 'screen' | 'gesture' | 'remote' | 'watch' | 'voice';
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
  /** Diagnostic (Etapa 0): what the gesture detector saw in the last second. iOS only for now. */
  onGestureDebug: (e: GestureDebug) => void;
};

export type GestureDebug = {
  people: number;
  isX: boolean;
  orientation: number;
  samples: number;
  missing?: string;
  minConf?: number;
  wristsUp?: boolean;
  crossed?: boolean;
  /** Wrist distance in shoulder widths: positive = uncrossed, negative = crossed. */
  wristGap?: number;
};

export type ReplayCameraViewProps = {
  style?: StyleProp<ViewStyle>;
};
