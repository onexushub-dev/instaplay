/** The shortest cut a save can make: same as the trigger debounce, so any accepted trigger still yields a clip. */
export const MIN_CUT_MS = 3000;

/**
 * How much of a saved clip is kept as its cut: the clip length the player picked, but never reaching back
 * before `sinceMs`, the moment the previous clip ended (or the recording started). That way two saves close
 * together do not show the same moment twice.
 */
export function cutMsFor(clipSeconds: number, atMs: number, sinceMs: number): number {
  const sinceLast = atMs - sinceMs;
  return Math.max(MIN_CUT_MS, Math.min(clipSeconds * 1000, sinceLast));
}
