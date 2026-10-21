import { useEffect, useRef } from 'react';

type Gate = { recording: boolean; allowed: boolean };

/**
 * Whether the watch may save clips. The tier decides when a recording starts (and outside one); during a recording it is
 * never taken away, so a Pro that lapses mid-game keeps the watch's Save button until the game ends: no lance is lost.
 */
export function nextWatchGate(prev: Gate, tierAllowed: boolean, recording: boolean): boolean {
  if (recording && prev.recording) return prev.allowed || tierAllowed;
  return tierAllowed;
}

/** Tells the watch (via `send`) whether its Save button works, on mount and whenever that changes. */
export function useWatchTriggerGate(recording: boolean, tierAllowed: boolean, send: (allowed: boolean) => void): void {
  const prev = useRef<Gate | null>(null);
  useEffect(() => {
    const before = prev.current;
    const allowed = before === null ? tierAllowed : nextWatchGate(before, tierAllowed, recording);
    prev.current = { recording, allowed };
    if (before === null || before.allowed !== allowed) send(allowed);
  }, [recording, tierAllowed, send]);
}
