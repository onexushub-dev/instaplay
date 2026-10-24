import type { Snapshot } from './types';

export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'error';

export interface PaymentsClient {
  configure(): void;
  getSnapshot(): Promise<Snapshot>;
  onSnapshot(fn: (s: Snapshot) => void): () => void;
  /** The paywall of the current (default) offering performs the purchase itself; callers never purchase directly. */
  showPaywall(): Promise<PaywallOutcome>;
  restore(): Promise<Snapshot>;
}
