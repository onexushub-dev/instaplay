import { PASS_PRODUCT_ID, type PassTransaction, type Plan, type Snapshot, type StartDecision, type Tier } from './types';

export function tierFor(snapshot: Snapshot, session?: { passTransactionId?: string }): Tier {
  if (snapshot.proActive) return 'pro';
  if (session?.passTransactionId) return 'pass';
  return 'free';
}

/** The watch as a save trigger is Pro only (global tier). Gates turning it on, never a tap mid-recording. */
export function watchTriggerAllowed(tier: Tier): boolean {
  return tier === 'pro';
}

export function availableCredit(snapshot: Snapshot, spent: ReadonlySet<string>): PassTransaction | undefined {
  return snapshot.passTransactions
    .filter((t) => t.productId === PASS_PRODUCT_ID && !spent.has(t.id))
    .reduce<PassTransaction | undefined>((a, b) => (a === undefined || b.purchasedAt < a.purchasedAt ? b : a), undefined);
}

export function creditCount(snapshot: Snapshot, spent: ReadonlySet<string>): number {
  return snapshot.passTransactions.filter((t) => t.productId === PASS_PRODUCT_ID && !spent.has(t.id)).length;
}

/** Decides "Começar gravação": Pro, else the oldest unused Pass, else the free plan. A credit is not spent with Pro. */
export function startPlan(input: { proActive: boolean; credit?: PassTransaction }): StartDecision {
  if (input.proActive) return { kind: 'pro' };
  if (input.credit) return { kind: 'credit', passTransactionId: input.credit.id };
  return { kind: 'free' };
}

export function planOf(d: StartDecision): Plan {
  return d.kind === 'free' ? 'free' : 'paid';
}

/** The plan a stored session ran with: an explicit `paid` wins, else a bound Pass means paid. */
export function sessionPlan(s: { paid?: boolean; passTransactionId?: string }): Plan {
  if (s.paid !== undefined) return s.paid ? 'paid' : 'free';
  return s.passTransactionId ? 'paid' : 'free';
}

export function detectPurchase(before: Snapshot, after: Snapshot): { pro: boolean; passTransactionId?: string } {
  const pro = !before.proActive && after.proActive;
  const known = new Set(before.passTransactions.map((t) => t.id));
  const fresh = after.passTransactions.filter((t) => !known.has(t.id));
  if (fresh.length === 0) return { pro };
  const latest = fresh.reduce((a, b) => (b.purchasedAt > a.purchasedAt ? b : a));
  return { pro, passTransactionId: latest.id };
}
