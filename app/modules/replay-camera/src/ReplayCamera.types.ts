import type { StyleProp, ViewStyle } from 'react-native';

export type Lens = 'ultraWide' | 'wide';
export type Quality = '1080p60' | '1080p30' | '720p30';
export type TriggerSource = 'screen' | 'gesture' | 'remote' | 'watch' | 'voice' | 'phone';
export type ThermalLevel = 'nominal' | 'fair' | 'serious' | 'critical';
export type ReplayErrorCode =
  | 'LOW_STORAGE'
  | 'CAMERA_PERMISSION'
  | 'CAMERA_UNAVAILABLE'
  | 'ENCODER_FAILED'
  | 'NO_SESSION';

/** `bufferSeconds`: the rolling window kept for saves (default 60; gym modes use 120). */
export type SessionOptions = { lens: Lens; maxQuality: Quality; bufferSeconds?: number };
/** `at` = ms since epoch when the trigger happened. */
export type SaveClipOptions = { source: TriggerSource; at: number };
export type SavedClip = { clipPath: string; durationMs: number };

/** Apple Watch link: no paired watch · paired without the LANCE app · ready. */
export type WatchStatus = 'unsupported' | 'notInstalled' | 'ready';

/** Second iPhone as a remote: idle · looking for the other phone · talking to it · Local Network not allowed. */
export type RemoteLink = 'idle' | 'searching' | 'connected' | 'denied';
export type RemotePeer = { id: string; name: string };
/** What the camera phone shows to pair: the QR link, the 6-digit code, when both stop working (ms) and the QR image. */
export type RemotePairing = { url: string; code: string; expiresAt: number; qrPath: string };
export type RemotePairFailure = 'expired' | 'locked' | 'notFound' | 'wrong' | 'denied' | 'full';

export type ReplayCameraModuleEvents = {
  onTrigger: (e: { source: TriggerSource; at: number }) => void;
  onWatchStatus: (e: { status: WatchStatus }) => void;
  onRemoteStatus: (e: { link: RemoteLink; peerName?: string; controllers?: number }) => void;
  /** Remote phone only: what the camera phone is doing. */
  onRemoteState: (e: { recording: boolean; clipCount: number; startedAt?: number }) => void;
  /** Remote phone only: how the last save ended. */
  onRemoteResult: (e: { saved: boolean }) => void;
  onRemotePairing: (e: { phase: 'paired'; peer: RemotePeer } | { phase: 'failed'; reason: RemotePairFailure }) => void;
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
  /** Both wrists above the head line in at least one person (the cue for sampling faster). iOS only. */
  raised?: boolean;
  /** The wave gesture fired in this sample. iOS only. */
  waved?: boolean;
  orientation: number;
  samples: number;
  missing?: string;
  minConf?: number;
  wristsUp?: boolean;
  elbowsUp?: boolean;
  crossed?: boolean;
  /** Wrist distance in shoulder widths: positive = uncrossed, negative = crossed. */
  wristGap?: number;
};

export type ExportClipOptions = {
  clipPath: string;
  startMs: number;
  endMs: number;
  /** 0.5, 1, 1.5 or 2. Anything but 1 plays without sound. */
  speed: number;
  muted: boolean;
  /** The visible part of the video (0..1 of its size) after a zoom; omit for the whole video. iOS only for now. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Extra clockwise turn (0, 90, 180 or 270) on top of the clip's own. iOS only for now. */
  rotation?: number;
  width: number;
  height: number;
  /** Full-frame PNG drawn over the video (the Story template bands). */
  overlayPngPath?: string;
  /** '#RRGGBB' behind the video where the overlay is transparent. */
  background: string;
};

export type ExportedClip = { path: string; durationMs: number };

export type ReplayCameraViewProps = {
  style?: StyleProp<ViewStyle>;
};
