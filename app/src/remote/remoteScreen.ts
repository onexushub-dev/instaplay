import type { RemoteLink } from '../../modules/replay-camera/src/ReplayCamera.types';

/** A recording state older than this many seconds is not believed: the camera phone is gone even if the link looks up. */
export const STALE_AFTER = 12;
/** One save per this many seconds from the remote: a double tap must not ask for two clips. */
export const SAVE_COOLDOWN = 3;

const GENERIC_HOST = 'Celular da câmera';

export type RemoteState = { recording: boolean; clipCount: number; startedAt: number | null; ageSec: number };
export type RemoteInput = { link: RemoteLink; hostName: string | null; state: RemoteState | null };

export type RemoteScreen =
  | { kind: 'denied' }
  | { kind: 'searching'; hostName: string | null }
  | { kind: 'waiting'; hostName: string }
  | { kind: 'recording'; hostName: string; clipCount: number; startedAt: number | null }
  | { kind: 'stale'; hostName: string };

/** What the remote phone shows, from the link and the last state the camera phone sent. */
export function remoteScreen(input: RemoteInput): RemoteScreen {
  if (input.link === 'denied') return { kind: 'denied' };
  const state = input.state;
  const hostName = input.hostName === null ? GENERIC_HOST : input.hostName;
  // Linked but the first state has not been heard yet (it can arrive while the pairing screen was still open): the link
  // is up, so say so instead of "searching".
  if (state === null) return input.link === 'connected' ? { kind: 'waiting', hostName } : { kind: 'searching', hostName: input.hostName };
  if (input.link !== 'connected' || state.ageSec > STALE_AFTER) return { kind: 'stale', hostName };
  if (!state.recording) return { kind: 'waiting', hostName };
  return { kind: 'recording', hostName, clipCount: state.clipCount, startedAt: state.startedAt };
}

export type ConnectionTone = 'ok' | 'warn' | 'bad';

/** The colour of the connection dot: green when the camera phone is there, amber while looking or lost, red when denied. */
export function connectionTone(screen: RemoteScreen): ConnectionTone {
  if (screen.kind === 'denied') return 'bad';
  if (screen.kind === 'searching' || screen.kind === 'stale') return 'warn';
  return 'ok';
}

export function canSave(nowMs: number, lastSaveMs: number | null): boolean {
  return lastSaveMs === null || nowMs - lastSaveMs >= SAVE_COOLDOWN * 1000;
}
