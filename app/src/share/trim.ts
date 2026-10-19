export const MIN_CUT_MS = 3_000;
export const MAX_CUT_MS = 60_000;

type Cut = { startMs: number; endMs: number };

/**
 * Keeps an edited cut valid: inside the clip, between 3s and `maxMs` (the mode's buffer) long. When the length is out of bounds,
 * the handle the player dragged is the one moved back, so the other edge stays where they left it.
 */
export function clampTrim(next: Cut, durationMs: number, moved: 'start' | 'end', maxMs: number = MAX_CUT_MS): Cut {
  if (durationMs <= MIN_CUT_MS) return { startMs: 0, endMs: durationMs };
  let startMs = Math.min(Math.max(0, next.startMs), durationMs);
  let endMs = Math.min(Math.max(0, next.endMs), durationMs);
  const length = endMs - startMs;

  if (length < MIN_CUT_MS) {
    if (moved === 'start') startMs = endMs - MIN_CUT_MS;
    else endMs = startMs + MIN_CUT_MS;
  } else if (length > maxMs) {
    if (moved === 'start') startMs = endMs - maxMs;
    else endMs = startMs + maxMs;
  }
  // Pushing past an end slides the window back inside.
  if (startMs < 0) [startMs, endMs] = [0, endMs - startMs];
  if (endMs > durationMs) [startMs, endMs] = [startMs - (endMs - durationMs), durationMs];
  return { startMs, endMs };
}
