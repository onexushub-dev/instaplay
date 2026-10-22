import type { Repo } from '../data/repo';
import type { PaymentsClient, PaywallOutcome } from './client';
import { availableCredit, creditCount, detectPurchase, startGate, tierFor as ruleTier } from './rules';
import { EMPTY_SNAPSHOT, PRO_ONLY_OFFERING, type Snapshot, type StartDecision, type Tier } from './types';

/** A paywall purchase not seen yet (SDK lag). With `sessionId` its Pass binds to that game; without one it is a credit. */
type Pending = { sessionId?: string; before: Snapshot };

export function createPaymentsStore(
  client: PaymentsClient,
  repo: Pick<Repo, 'getSession' | 'setSessionPass' | 'isFirstSessionUsed' | 'spentPasses' | 'spendPasses'>,
) {
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
    const known = repo.spentPasses(); // the ledger: a pass already tied to a game is never bound again
    before.passTransactions.forEach((t) => known.add(t.id));
    const fresh = snapshot.passTransactions.filter((t) => !known.has(t.id));
    if (fresh.length === 0) return undefined;
    return fresh.reduce((x, y) => (y.purchasedAt < x.purchasedAt ? y : x)).id;
  }

  /**
   * Explains the pending purchase if `snapshot` shows it (oldest new pass tx): binds it to its game, or leaves it as a
   * credit when it has none. Clears it on a new pass or Pro. Returns the pass id it explained.
   */
  function resolvePending(snapshot: Snapshot): string | undefined {
    if (!pending) return undefined;
    const id = purchasedSince(pending.before, snapshot);
    if (id) {
      if (pending.sessionId) repo.setSessionPass(pending.sessionId, id);
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
  function applyRestored(s: Snapshot, before: Snapshot | null, dropped?: Pending | null) {
    current = s;
    const kept = resolvePending(s) ?? (dropped ? purchasedSince(dropped.before, s) : undefined);
    const known = repo.spentPasses();
    before?.passTransactions.forEach((t) => known.add(t.id));
    if (kept) known.add(kept);
    const restored = s.passTransactions.filter((t) => !known.has(t.id)).map((t) => t.id);
    if (restored.length > 0) repo.spendPasses(restored);
    notify();
  }

  /** The ledger plus, while a purchase waits to bind, every pass the snapshot has beyond its "before": it is that game's. */
  function effectiveSpent(): Set<string> {
    const spent = repo.spentPasses();
    if (pending && current) {
      const before = new Set(pending.before.passTransactions.map((t) => t.id));
      current.passTransactions.forEach((t) => {
        if (!before.has(t.id)) spent.add(t.id);
      });
    }
    return spent;
  }

  /** Never throws: a storage failure decides 'paywall' (blocks rather than gives a start away). */
  function decide(): StartDecision {
    try {
      const snap = current ?? EMPTY_SNAPSHOT;
      return startGate({
        firstSessionUsed: repo.isFirstSessionUsed(),
        proActive: snap.proActive,
        credit: availableCredit(snap, effectiveSpent()),
      });
    } catch {
      return { kind: 'paywall' };
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

    tierFor(sessionId?: string): Tier {
      let session;
      try {
        session = sessionId ? repo.getSession(sessionId) : undefined;
      } catch {
        session = undefined;
      }
      return ruleTier(current ?? EMPTY_SNAPSHOT, session);
    },

    /**
     * The default offering. With `sessionId` a new Pass bought here is bound to that game; without one it stays a
     * credit. A Pass that shows up by a restore is never bound nor a credit: it goes to the ledger.
     */
    async showPaywall(sessionId?: string): Promise<PaywallOutcome> {
      if (open) return 'cancelled';
      open = true;
      try {
        let before = current;
        let dropped: Pending | null = null;
        if (pending || !before) {
          const fresh = await read(() => client.getSnapshot());
          if (fresh) {
            apply(fresh); // binds the pending to its own session if its pass shows up now
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
        if (outcome === 'restored') {
          // The listener may already have delivered the restored data during the paywall.
          const after = (await read(() => client.getSnapshot())) ?? current;
          if (after) applyRestored(after, before, dropped);
          else notify();
        } else if (outcome === 'purchased') {
          // Without a game, the marker keeps a lagging Pass a credit: a restore never spends it, a start re-reads.
          pending = { ...(sessionId ? { sessionId } : {}), before: before ?? EMPTY_SNAPSHOT };
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
        const before = await restoreBefore();
        let outcome: PaywallOutcome;
        try {
          outcome = await client.showPaywall(PRO_ONLY_OFFERING);
        } catch {
          return 'error';
        }
        if (outcome === 'purchased') {
          const after = await read(() => client.getSnapshot());
          if (after) apply(after);
        } else if (outcome === 'restored') {
          const after = (await read(() => client.getSnapshot())) ?? current;
          if (after) applyRestored(after, before);
        }
        return outcome;
      } finally {
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

    /**
     * "Começar gravação": reads first when there is no snapshot yet or a purchase waits to bind (it may bind now).
     * A failed read decides with what is known (the empty snapshot at worst). Never throws; never spends a credit.
     */
    async startDecision(): Promise<StartDecision> {
      try {
        if (current === null || pending) {
          const fresh = await read(() => client.getSnapshot());
          if (fresh && (current === null || pending)) apply(fresh);
        }
        return decide();
      } catch {
        return { kind: 'paywall' };
      }
    },

    /** Unused Passes, counted like `peekStart`. */
    credits(): number {
      try {
        return creditCount(current ?? EMPTY_SNAPSHOT, effectiveSpent());
      } catch {
        return 0;
      }
    },
  };
}

export type PaymentsStore = ReturnType<typeof createPaymentsStore>;
