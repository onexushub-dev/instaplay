export type Tier = 'free' | 'pass' | 'pro';

export type PassTransaction = { id: string; productId: string; purchasedAt: number };

export type Snapshot = { proActive: boolean; passTransactions: PassTransaction[] };

export const EMPTY_SNAPSHOT: Snapshot = { proActive: false, passTransactions: [] };

export const FREE_CLIPS = 10;
export const PRO_ENTITLEMENT = 'pro';
export const PASS_PRODUCT_ID = 'single_pass';
/** RevenueCat offering with the Pro package only, for features with no game to bind a Pass to (the watch trigger). */
export const PRO_ONLY_OFFERING = 'pro_only';

export type StartDecision =
  | { kind: 'firstSession' }
  | { kind: 'pro' }
  | { kind: 'credit'; passTransactionId: string }
  | { kind: 'paywall' };
