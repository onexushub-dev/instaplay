import type { PaymentsClient, PaywallOutcome } from './client';
import { EMPTY_SNAPSHOT, type Snapshot } from './types';

export function createFakeClient() {
  const listeners = new Set<(s: Snapshot) => void>();
  const fake = {
    snapshot: EMPTY_SNAPSHOT as Snapshot,
    nextOutcome: 'cancelled' as PaywallOutcome,
    failSnapshot: false,
    configure() {},
    async getSnapshot(): Promise<Snapshot> {
      if (fake.failSnapshot) throw new Error('snapshot unavailable');
      return fake.snapshot;
    },
    onSnapshot(fn: (s: Snapshot) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    async showPaywall(): Promise<PaywallOutcome> {
      return fake.nextOutcome;
    },
    async restore(): Promise<Snapshot> {
      if (fake.failSnapshot) throw new Error('snapshot unavailable');
      return fake.snapshot;
    },
    emit(s: Snapshot) {
      fake.snapshot = s;
      listeners.forEach((fn) => fn(s));
    },
  };
  return fake satisfies PaymentsClient & Record<string, unknown>;
}
