import type { Repo } from '../data/repo';
import type { PaymentsClient, PaywallOutcome } from './client';
import { detectPurchase, tierFor as ruleTier } from './rules';
import { EMPTY_SNAPSHOT, type Snapshot, type Tier } from './types';

type Pending = { sessionId: string; before: Snapshot };

export function createPaymentsStore(client: PaymentsClient, repo: Pick<Repo, 'getSession' | 'setSessionPass'>) {
  let current: Snapshot | null = null;
  let pending: Pending | undefined;
  let open = false;
  let version = 0;
  let started = false;
  const listeners = new Set<() => void>();

  function notify() {
    version += 1;
    listeners.forEach((fn) => fn());
  }

  /** Binds a newly bought pass (if any) to the session. */
  function bindFrom(p: Pending, after: Snapshot): void {
    const { passTransactionId } = detectPurchase(p.before, after);
    if (passTransactionId) repo.setSessionPass(p.sessionId, passTransactionId);
  }

  function apply(s: Snapshot) {
    current = s;
    if (pending) {
      const p = pending;
      pending = undefined;
      bindFrom(p, s);
    }
    notify();
  }

  async function read(fresh: () => Promise<Snapshot>): Promise<Snapshot | null> {
    try {
      return await fresh();
    } catch {
      return null;
    }
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      client.onSnapshot(apply);
      void read(() => client.getSnapshot()).then((s) => {
        if (s) apply(s);
      });
    },

    getSnapshot(): Snapshot {
      return current ?? EMPTY_SNAPSHOT;
    },

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    version(): number {
      return version;
    },

    tierFor(sessionId?: string): Tier {
      let session;
      try {
        session = sessionId ? repo.getSession(sessionId) : undefined;
      } catch {
        session = undefined;
      }
      return ruleTier(current ?? EMPTY_SNAPSHOT, session);
    },

    async showPaywall(sessionId: string): Promise<PaywallOutcome> {
      if (open) return 'cancelled';
      open = true;
      try {
        const before = current ?? (await read(() => client.getSnapshot())) ?? EMPTY_SNAPSHOT;
        const outcome = await client.showPaywall();
        if (outcome === 'purchased' || outcome === 'restored') {
          const p: Pending = { sessionId, before };
          const after = await read(() => client.getSnapshot());
          if (after) {
            bindFrom(p, after);
            current = after;
            notify();
          } else {
            pending = p;
          }
        }
        return outcome;
      } finally {
        open = false;
      }
    },

    async restore(): Promise<boolean> {
      const s = await client.restore();
      apply(s);
      return s.proActive;
    },
  };
}

export type PaymentsStore = ReturnType<typeof createPaymentsStore>;
