export const MIN_CUT_MS = 3_000;
export const MAX_CUT_MS = 60_000;

type Cut = { startMs: number; endMs: number };

/**
 * Keeps an edited cut valid: inside the clip, between 3s and `maxMs` long. When the length is out of bounds,
 * the handle the player dragged is the one moved back, so the other edge stays where they left it.
 * `floorMs`: where the useful video starts (a black start is not part of the clip); the cut never begins before it.
 */
export function clampTrim(
  next: Cut,
  durationMs: number,
  moved: 'start' | 'end',
  maxMs: number = MAX_CUT_MS,
  floorMs: number = 0,
): Cut {
  if (durationMs - floorMs <= MIN_CUT_MS) return { startMs: floorMs, endMs: durationMs };
  let startMs = Math.min(Math.max(floorMs, next.startMs), durationMs);
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
  if (startMs < floorMs) [startMs, endMs] = [floorMs, endMs + (floorMs - startMs)];
  if (endMs > durationMs) [startMs, endMs] = [startMs - (endMs - durationMs), durationMs];
  return { startMs, endMs };
}

/**
 * The part of a clip's file the player may cut from: the clip as it was first saved (never the rest of the buffer,
 * which holds moments already in other clips), after any black start at `floorMs`. Clips saved before
 * `bounds` existed can use the whole file.
 */
export function clipWindow(clip: { durationMs: number; bounds?: Cut }, floorMs: number = 0): Cut {
  const endMs = clip.bounds ? Math.min(clip.bounds.endMs, clip.durationMs) : clip.durationMs;
  const startMs = Math.min(Math.max(floorMs, clip.bounds ? clip.bounds.startMs : 0), endMs);
  return { startMs, endMs };
}
