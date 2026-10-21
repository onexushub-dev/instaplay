import type { Snapshot } from './types';

export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'error';

export interface PaymentsClient {
  configure(): void;
  getSnapshot(): Promise<Snapshot>;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  /**
   * The paywall performs the purchase itself; callers never purchase directly. Without `offering` it shows the
   * current (default) offering; with one, that offering, and 'error' if it is missing.
   */
  showPaywall(offering?: string): Promise<PaywallOutcome>;
  restore(): Promise<Snapshot>;
}
