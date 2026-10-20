import { useSyncExternalStore } from 'react';

import { payments } from '../payments';
import type { Tier } from '../payments/types';

export type { Tier };

/**
 * The single place that decides what a player may use (HD, no watermark, slow motion, templates).
 * Reads the payments store, so it re-renders when a purchase or restore changes the tier.
 */
export function useEntitlement(sessionId?: string): { tier: Tier } {
  useSyncExternalStore(payments.subscribe, payments.version);
  return { tier: payments.tierFor(sessionId) };
}
