import type { Repo } from '../data/repo';
import type { PaymentsClient, PaywallOutcome } from './client';
import { availableCredit, creditCount, detectPurchase, planOf, startPlan } from './rules';
import { EMPTY_SNAPSHOT, type Plan, type Snapshot, type StartDecision } from './types';

/**
 * A paywall purchase not seen yet (SDK lag). Its Pass is a credit like any other; the marker only keeps it from being
 * taken for a restore (which never creates a credit) and makes a start re-read until it shows up.
 */
type Pending = { before: Snapshot };

export function createPaymentsStore(client: PaymentsClient, repo: Pick<Repo, 'getSession' | 'spentPasses' | 'spendPasses'>) {
  let current: Snapshot | null = null;
  // At most one paywall result we could not explain yet. A new paywall never opens while it exists unresolved.
  let pending: Pending | null = null;
  let open = false;
  let version = 0;
  let started = false;
  const listeners = new Set<() => void>();

  function notify() {
    version += 1;
    listeners.forEach((fn) => fn());
  }

  /** The oldest pass in `snapshot` that is neither in `before` nor in the ledger: what a purchase after `before` bought. */
  function purchasedSince(before: Snapshot, snapshot: Snapshot): string | undefined {
    const known = repo.spentPasses(); // the ledger: a spent or restored pass is never a purchase
    before.passTransactions.forEach((t) => known.add(t.id));
    const fresh = snapshot.passTransactions.filter((t) => !known.has(t.id));
    if (fresh.length === 0) return undefined;
    return fresh.reduce((x, y) => (y.purchasedAt < x.purchasedAt ? y : x)).id;
  }

  /**
   * Explains the pending purchase if `snapshot` shows it (oldest new pass tx): it stays a credit. Clears it on a new
   * pass or Pro. Returns the pass id it explained.
   */
  function resolvePending(snapshot: Snapshot): string | undefined {
    if (!pending) return undefined;
    const id = purchasedSince(pending.before, snapshot);
    if (id) {
      pending = null;
      return id;
    }
    if (detectPurchase(pending.before, snapshot).pro) pending = null;
    return undefined;
  }

  function apply(s: Snapshot) {
    current = s;
    resolvePending(s);
    notify();
  }

  /**
   * After a restore: explains a waiting purchase first (it is a purchase, not a restore), then puts every other pass
   * that is new against `before` (all unspent ones when `before` is unknown) in the ledger, so a restore never
   * creates a credit. `dropped` is a pending this paywall's pre-read dropped unexplained: its Pass is kept too. Notifies.
   */
  function applyRestored(s: Snapshot, before: Snapshot | null, dropped?: Pending | null): { droppedExplained: boolean } {
    current = s;
    const resolved = resolvePending(s);
    const droppedId = !resolved && dropped ? purchasedSince(dropped.before, s) : undefined;
    const kept = resolved ?? droppedId;
    const known = repo.spentPasses();
    before?.passTransactions.forEach((t) => known.add(t.id));
    if (kept) known.add(kept);
    const restored = s.passTransactions.filter((t) => !known.has(t.id)).map((t) => t.id);
    if (restored.length > 0) repo.spendPasses(restored);
    notify();
    return { droppedExplained: !!droppedId };
  }

  /** Never throws: a storage failure decides 'free'. */
  function decide(): StartDecision {
    try {
      const snap = current ?? EMPTY_SNAPSHOT;
      return startPlan({
        proActive: snap.proActive,
        credit: availableCredit(snap, repo.spentPasses()),
      });
    } catch {
      return { kind: 'free' };
    }
  }

  /**
   * The "before" of a restore: a fresh read when there is no snapshot or a purchase waits (it may explain it now);
   * the pending is kept, so the restore result still treats its Pass as a purchase. Null only if nothing is known.
   */
  async function restoreBefore(): Promise<Snapshot | null> {
    if (current === null || pending) {
      const fresh = await read(() => client.getSnapshot());
      if (fresh) apply(fresh);
    }
    return current;
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

    /**
     * The one (default) offering. A Pass bought here is a credit for a later start; a Pass that shows up by a restore
     * is never a credit: it goes to the ledger. Never throws.
     */
    async showPaywall(): Promise<PaywallOutcome> {
      if (open) return 'cancelled';
      open = true;
      let dropped: Pending | null = null;
      try {
        let before = current;
        if (pending || !before) {
          let fresh: Snapshot | null;
          try {
            fresh = await read(() => client.getSnapshot());
            if (fresh) apply(fresh); // explains the pending if its pass shows up now
          } catch {
            return 'error'; // storage failed before selling anything
          }
          if (fresh) {
            dropped = pending;
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
        try {
          if (outcome === 'restored') {
            // The listener may already have delivered the restored data during the paywall.
            const after = (await read(() => client.getSnapshot())) ?? current;
            if (after && applyRestored(after, before, dropped).droppedExplained) dropped = null;
            else if (!after) notify();
          } else if (outcome === 'purchased') {
            dropped = null; // the single slot now waits for this purchase
            // The marker keeps a lagging Pass a credit: a restore never spends it, a start re-reads.
            pending = { before: before ?? EMPTY_SNAPSHOT };
            const after = await read(() => client.getSnapshot());
            if (after) {
              current = after;
              resolvePending(after);
            } else if (current) {
              // The SDK listener may already have delivered the new data during the paywall.
              resolvePending(current);
            }
            notify();
          }
        } catch {
          // Storage failed after the store sold: the outcome stands, a waiting marker re-reads at the next start.
          notify();
        }
        return outcome;
      } finally {
        // Nothing was bought here: the dropped purchase is still unexplained, so it waits again (a restore must not
        // spend its Pass, a start must re-read). Checked against what is known now in case it already showed up.
        if (dropped && pending === null) {
          pending = dropped;
          try {
            if (current) resolvePending(current);
          } catch {
            // stays pending: the next read explains it
          }
        }
        open = false;
      }
    },

    /** Restores Pro. Passes it brings go to the ledger, never become credits. */
    async restore(): Promise<boolean> {
      try {
        // Taken before the call: the listener may deliver the restored data before `restore` resolves.
        const before = await restoreBefore();
        const s = await client.restore();
        applyRestored(s, before);
        return s.proActive;
      } catch {
        return false;
      }
    },

    /** "Começar gravação" with what is known now (the status line). */
    peekStart(): StartDecision {
      return decide();
    },

    /** The plan the next start would get: what the preparation shows and opens the camera with. */
    nextPlan(): Plan {
      return planOf(decide());
    },

    /**
     * "Começar gravação": reads first when there is no snapshot yet or a purchase waits (it may be a credit now).
     * Never blocks: a failed read decides with what is known (the empty snapshot at worst), any failure is 'free'.
     * Never spends a credit (the session start does).
     */
    async startDecision(): Promise<StartDecision> {
      try {
        if (current === null || pending) {
          const fresh = await read(() => client.getSnapshot());
          if (fresh && (current === null || pending)) apply(fresh);
        }
        return decide();
      } catch {
        return { kind: 'free' };
      }
    },

    /** Unused Passes, counted like `peekStart`. */
    credits(): number {
      try {
        return creditCount(current ?? EMPTY_SNAPSHOT, repo.spentPasses());
      } catch {
        return 0;
      }
    },
  };
}

export type PaymentsStore = ReturnType<typeof createPaymentsStore>;
