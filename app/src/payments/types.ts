export type Tier = 'free' | 'pass' | 'pro';

export type PassTransaction = { id: string; productId: string; purchasedAt: number };

export type Snapshot = { proActive: boolean; passTransactions: PassTransaction[] };

export const EMPTY_SNAPSHOT: Snapshot = { proActive: false, passTransactions: [] };

export const FREE_CLIPS = 5;
export const PRO_ENTITLEMENT = 'pro';
export const PASS_PRODUCT_ID = 'lance_game_pass';
