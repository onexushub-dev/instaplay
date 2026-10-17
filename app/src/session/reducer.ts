import type { ReplayErrorCode, ThermalLevel } from '../../modules/replay-camera/src/ReplayCamera.types';
import type { TriggerSource } from '../data/schema';

export type Phase = 'idle' | 'starting' | 'recording' | 'stopping' | 'ended';

export type SessionState = {
  phase: Phase;
  sessionId?: string;
  startedAt?: number;
  clipCount: number;
  lastSaved?: { clipId: string; number: number; source: TriggerSource; at: number };
  saving: boolean;
  paused: boolean;
  thermal: { level: ThermalLevel; degraded: boolean };
  error?: ReplayErrorCode;
  /** The native side stopped because the phone got too hot. */
  thermalStop?: boolean;
};

export type SessionAction =
  | { type: 'startRequested' }
  | { type: 'started'; sessionId: string; startedAt: number }
  | { type: 'startFailed'; code: ReplayErrorCode }
  | { type: 'saveStarted' }
  | { type: 'saved'; clipId: string; source: TriggerSource; at: number }
  | { type: 'saveFailed' }
  | { type: 'undone'; clipId: string }
  | { type: 'interrupted' }
  | { type: 'resumed' }
  | { type: 'thermal'; level: ThermalLevel; degraded: boolean }
  | { type: 'nativeError'; code: ReplayErrorCode; thermal: boolean }
  | { type: 'stopRequested' }
  | { type: 'stopped' }
  | { type: 'reset' };

export const initialState: SessionState = {
  phase: 'idle',
  clipCount: 0,
  saving: false,
  paused: false,
  thermal: { level: 'nominal', degraded: false },
};

export function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'startRequested':
      return { ...initialState, phase: 'starting' };
    case 'started':
      return { ...state, phase: 'recording', sessionId: action.sessionId, startedAt: action.startedAt, clipCount: 0 };
    case 'startFailed':
      return { ...initialState, error: action.code };
    case 'saveStarted':
      return { ...state, saving: true };
    case 'saved': {
      const number = state.clipCount + 1;
      return {
        ...state,
        saving: false,
        clipCount: number,
        lastSaved: { clipId: action.clipId, number, source: action.source, at: action.at },
      };
    }
    case 'saveFailed':
      return { ...state, saving: false };
    case 'undone':
      return {
        ...state,
        clipCount: Math.max(0, state.clipCount - 1),
        lastSaved: state.lastSaved?.clipId === action.clipId ? undefined : state.lastSaved,
      };
    case 'interrupted':
      return { ...state, paused: true };
    case 'resumed':
      return { ...state, paused: false };
    case 'thermal':
      return { ...state, thermal: { level: action.level, degraded: action.degraded } };
    case 'nativeError':
      return { ...state, phase: 'ended', saving: false, error: action.code, thermalStop: action.thermal };
    case 'stopRequested':
      return { ...state, phase: 'stopping' };
    case 'stopped':
      return { ...state, phase: 'ended', saving: false };
    case 'reset':
      return initialState;
  }
}
