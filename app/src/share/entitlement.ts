export type Tier = 'free' | 'pro';

/**
 * The single place that decides what a player may use (HD, no watermark, slow motion, templates).
 * Everything is unlocked until the payments stage (Marcus, 2026-10-18), which wires this to purchases.
 */
export function useEntitlement(): { tier: Tier } {
  return { tier: 'pro' };
}
