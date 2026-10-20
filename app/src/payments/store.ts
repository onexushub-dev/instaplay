import type { Repo } from '../data/repo';
import type { PaymentsClient, PaywallOutcome } from './client';
import { detectPurchase, tierFor as ruleTier } from './rules';
import { EMPTY_SNAPSHOT, type Snapshot, type Tier } from './types';

type Pending = { sessionId: string; before: Snapshot };

export function createPaymentsStore(client: PaymentsClient, repo: Pick<Repo, 'getSession' | 'setSessionPass'>) {
  let current: Snapshot | null = null;
  let pendings: Pending[] = [];
  const bound = new Set<string>(); // transaction ids this store already bound; never bind one twice
  let open = false;
  let version = 0;
  let started = false;
  const listeners = new Set<() => void>();

  function notify() {
    version += 1;
    listeners.forEach((fn) => fn());
  }

  /** Binds every pending purchase that `snapshot` can now explain; keeps the rest. */
  function resolvePendings(snapshot: Snapshot) {
    pendings = pendings.filter((p) => {
      const before: Snapshot = {
        ...p.before,
        passTransactions: [
          ...p.before.passTransactions,
          ...[...bound].map((id) => ({ id, productId: '', purchasedAt: 0 })),
        ],
      };
      const { pro, passTransactionId } = detectPurchase(before, snapshot);
      if (passTransactionId) {
        repo.setSessionPass(p.sessionId, passTransactionId);
        bound.add(passTransactionId);
        return false;
      }
      return !pro;
    });
  }

  function apply(s: Snapshot) {
    current = s;
    resolvePendings(s);
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
        if (s && current === null) apply(s); // a stale initial read must not overwrite newer data
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
        let beforeKnown = true;
        let before = current;
        if (!before) {
          before = await read(() => client.getSnapshot());
          if (before) apply(before);
        }
        if (!before) {
          beforeKnown = false;
          before = EMPTY_SNAPSHOT;
        }
        let outcome: PaywallOutcome;
        try {
          outcome = await client.showPaywall();
        } catch {
          return 'error';
        }
        if (outcome === 'purchased' || outcome === 'restored') {
          // Without a known "before", a restore could re-bind an old pass to the wrong game.
          if (beforeKnown || outcome === 'purchased') pendings.push({ sessionId, before });
          const after = await read(() => client.getSnapshot());
          if (after) apply(after);
          else if (current) {
            // The SDK listener may already have delivered the new data during the paywall.
            resolvePendings(current);
            notify();
          }
        }
        return outcome;
      } finally {
        open = false;
      }
    },

    async restore(): Promise<boolean> {
      try {
        const s = await client.restore();
        apply(s);
        return s.proActive;
      } catch {
        return false;
      }
    },
  };
}

export type PaymentsStore = ReturnType<typeof createPaymentsStore>;
