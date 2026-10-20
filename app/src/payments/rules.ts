import { FREE_CLIPS, type Snapshot, type Tier } from './types';

export function tierFor(snapshot: Snapshot, session?: { passTransactionId?: string }): Tier {
  if (snapshot.proActive) return 'pro';
  if (session?.passTransactionId) return 'pass';
  return 'free';
}

export function isClipLocked(clip: { locked?: boolean }, tier: Tier): boolean {
  return !!clip.locked && tier === 'free';
}

export function shouldLockOnSave(tier: Tier, unlockedCount: number): boolean {
  return tier === 'free' && unlockedCount >= FREE_CLIPS;
}

export function detectPurchase(before: Snapshot, after: Snapshot): { pro: boolean; passTransactionId?: string } {
  const pro = !before.proActive && after.proActive;
  const known = new Set(before.passTransactions.map((t) => t.id));
  const fresh = after.passTransactions.filter((t) => !known.has(t.id));
  if (fresh.length === 0) return { pro };
  const latest = fresh.reduce((a, b) => (b.purchasedAt > a.purchasedAt ? b : a));
  return { pro, passTransactionId: latest.id };
}
