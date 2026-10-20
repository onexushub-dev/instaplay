import { SAVE_COOLDOWN } from './remoteScreen';

/** How long the remote waits for the camera phone to answer a save before saying it did not hear back. */
export const RESULT_TIMEOUT_MS = 4000;
/** How long "saved" and "failed" stay on screen. */
export const RESULT_SHOWN_MS = 1200;
/** The "no answer" notice stays a little longer: the player has to look at the camera phone. */
export const TIMEOUT_SHOWN_MS = 2500;

export type SavePhase = 'idle' | 'sending' | 'saved' | 'failed' | 'timeout';
export type SaveFeedback = { phase: SavePhase; since: number | null };

export const IDLE: SaveFeedback = { phase: 'idle', since: null };

/** A tap shows "sending" at once; the camera phone's answer arrives later. The 3 s gap between taps is `canSave`'s job. */
export function onTap(_feedback: SaveFeedback, nowMs: number): SaveFeedback {
  return { phase: 'sending', since: nowMs };
}

/** The camera phone answered (also when a late answer comes after the timeout, or the save was not started here). */
export function onResult(_feedback: SaveFeedback, saved: boolean, nowMs: number): SaveFeedback {
  return { phase: saved ? 'saved' : 'failed', since: nowMs };
}

/** Moves on with time: sending times out, and results clear by themselves. Returns the same object when nothing changed. */
export function tick(feedback: SaveFeedback, nowMs: number): SaveFeedback {
  if (feedback.since === null) return feedback;
  const elapsed = nowMs - feedback.since;
  if (feedback.phase === 'sending' && elapsed >= RESULT_TIMEOUT_MS) return { phase: 'timeout', since: nowMs };
  if ((feedback.phase === 'saved' || feedback.phase === 'failed') && elapsed >= RESULT_SHOWN_MS) return IDLE;
  if (feedback.phase === 'timeout' && elapsed >= TIMEOUT_SHOWN_MS) return IDLE;
  return feedback;
}

/** How much of the 3 s between saves is left, from 1 (just tapped) to 0 (ready): drives the ring around the button. */
export function cooldownLeft(lastSaveMs: number | null, nowMs: number): number {
  if (lastSaveMs === null) return 0;
  const left = 1 - (nowMs - lastSaveMs) / (SAVE_COOLDOWN * 1000);
  return Math.min(1, Math.max(0, left));
}
