import type { Repo } from '../data/repo';
import type { PaymentsClient, PaywallOutcome } from './client';
import { detectPurchase, tierFor as ruleTier } from './rules';
import { EMPTY_SNAPSHOT, PRO_ONLY_OFFERING, type Snapshot, type Tier } from './types';

type Pending = { sessionId: string; before: Snapshot };

export function createPaymentsStore(client: PaymentsClient, repo: Pick<Repo, 'getSession' | 'setSessionPass'>) {
  let current: Snapshot | null = null;
  // At most one paywall result we could not explain yet. A new paywall never opens while it exists unresolved.
  let pending: Pending | null = null;
  const bound = new Set<string>(); // transaction ids this store already bound; never bind one twice
  let open = false;
  let version = 0;
  let started = false;
  const listeners = new Set<() => void>();

  function notify() {
    version += 1;
    listeners.forEach((fn) => fn());
  }

  /** Binds the pending purchase if `snapshot` explains it (oldest new pass tx); clears it on a new pass or Pro. */
  function resolvePending(snapshot: Snapshot) {
    if (!pending) return;
    const known = new Set([...pending.before.passTransactions.map((t) => t.id), ...bound]);
    const fresh = snapshot.passTransactions.filter((t) => !known.has(t.id));
    if (fresh.length > 0) {
      const oldest = fresh.reduce((x, y) => (y.purchasedAt < x.purchasedAt ? y : x));
      repo.setSessionPass(pending.sessionId, oldest.id);
      bound.add(oldest.id);
      pending = null;
    } else if (detectPurchase(pending.before, snapshot).pro) {
      pending = null;
    }
  }

  function apply(s: Snapshot) {
    current = s;
    resolvePending(s);
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
        let before = current;
        if (pending || !before) {
          const fresh = await read(() => client.getSnapshot());
          if (fresh) {
            apply(fresh); // binds the pending to its own session if its pass shows up now
            pending = null; // still unexplained: dropped so it cannot capture this paywall's purchase
            before = fresh;
          } else if (pending) {
            return 'error'; // never sell another pass while an earlier purchase is unexplained
          }
        }
        let outcome: PaywallOutcome;
        try {
          outcome = await client.showPaywall();
        } catch {
          return 'error';
        }
        if (outcome === 'purchased' || outcome === 'restored') {
          // Without a known "before", a restore could re-bind an old pass to the wrong game.
          if (before || outcome === 'purchased') pending = { sessionId, before: before ?? EMPTY_SNAPSHOT };
          const after = await read(() => client.getSnapshot());
          if (after) {
            current = after;
            resolvePending(after);
            // A restore that shows nothing new leaves no pending; a purchase may just be SDK lag.
            if (outcome === 'restored') pending = null;
          } else if (current) {
            // The SDK listener may already have delivered the new data during the paywall.
            resolvePending(current);
          }
          notify();
        }
        return outcome;
      } finally {
        open = false;
      }
    },

    /**
     * Pro only (the `pro_only` offering), for a feature with no game yet to bind a Pass to (the watch trigger, at setup).
     * A purchase reaches the tier through the customerInfo listener; a fresh read here covers SDK lag.
     */
    async showProPaywall(): Promise<PaywallOutcome> {
      if (open) return 'cancelled';
      open = true;
      try {
        let outcome: PaywallOutcome;
        try {
          outcome = await client.showPaywall(PRO_ONLY_OFFERING);
        } catch {
          return 'error';
        }
        if (outcome === 'purchased' || outcome === 'restored') {
          const after = await read(() => client.getSnapshot());
          if (after) apply(after);
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
