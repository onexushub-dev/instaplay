import { PASS_PRODUCT_ID, type PassTransaction, type Snapshot, type StartDecision, type Tier } from './types';

export function tierFor(snapshot: Snapshot, session?: { passTransactionId?: string }): Tier {
  if (snapshot.proActive) return 'pro';
  if (session?.passTransactionId) return 'pass';
  return 'free';
}

// Clip no longer declares `locked`; clips stored before still may carry it, so read it structurally (removed in Task 8).
export function isClipLocked(clip: object, tier: Tier): boolean {
  return !!(clip as { locked?: boolean }).locked && tier === 'free';
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

/** Decides "Começar gravação": the first session is free, then Pro, then the oldest unused Pass, else the paywall. */
export function startGate(input: { firstSessionUsed: boolean; proActive: boolean; credit?: PassTransaction }): StartDecision {
  if (!input.firstSessionUsed) return { kind: 'firstSession' };
  if (input.proActive) return { kind: 'pro' };
  if (input.credit) return { kind: 'credit', passTransactionId: input.credit.id };
  return { kind: 'paywall' };
}

export function detectPurchase(before: Snapshot, after: Snapshot): { pro: boolean; passTransactionId?: string } {
  const pro = !before.proActive && after.proActive;
  const known = new Set(before.passTransactions.map((t) => t.id));
  const fresh = after.passTransactions.filter((t) => !known.has(t.id));
  if (fresh.length === 0) return { pro };
  const latest = fresh.reduce((a, b) => (b.purchasedAt > a.purchasedAt ? b : a));
  return { pro, passTransactionId: latest.id };
}
