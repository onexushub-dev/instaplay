import { availableCredit, creditCount, detectPurchase, isClipLocked, startGate, tierFor, watchTriggerAllowed } from '../rules';
import { EMPTY_SNAPSHOT, type PassTransaction, type Snapshot } from '../types';

const tx = (id: string, purchasedAt: number): PassTransaction => ({ id, productId: 'single_pass', purchasedAt });
const snap = (proActive: boolean, passTransactions: PassTransaction[] = []): Snapshot => ({ proActive, passTransactions });

test('tierFor: Pro beats pass, pass beats free', () => {
  expect(tierFor(snap(true), { passTransactionId: 'A' })).toBe('pro');
  expect(tierFor(EMPTY_SNAPSHOT, { passTransactionId: 'A' })).toBe('pass');
  expect(tierFor(EMPTY_SNAPSHOT, {})).toBe('free');
  expect(tierFor(EMPTY_SNAPSHOT)).toBe('free');
});

test('isClipLocked only locks on the free tier', () => {
  expect(isClipLocked({ locked: true }, 'free')).toBe(true);
  expect(isClipLocked({ locked: true }, 'pass')).toBe(false);
  expect(isClipLocked({ locked: true }, 'pro')).toBe(false);
  expect(isClipLocked({}, 'free')).toBe(false);
});

test('detectPurchase', () => {
  expect(detectPurchase(EMPTY_SNAPSHOT, snap(true))).toEqual({ pro: true });
  expect(detectPurchase(snap(false, [tx('A', 1)]), snap(false, [tx('A', 1), tx('B', 2)]))).toEqual({
    pro: false,
    passTransactionId: 'B',
  });
  const same = detectPurchase(snap(false, [tx('A', 1)]), snap(false, [tx('A', 1)]));
  expect(same).toEqual({ pro: false });
  expect('passTransactionId' in same).toBe(false);
  expect(detectPurchase(snap(true), snap(true)).pro).toBe(false);
  expect(detectPurchase(EMPTY_SNAPSHOT, snap(false, [tx('X', 5), tx('Y', 9), tx('Z', 7)])).passTransactionId).toBe('Y');
});

test('watchTriggerAllowed: the watch saves clips on Pro only', () => {
  expect(watchTriggerAllowed('pro')).toBe(true);
  expect(watchTriggerAllowed('pass')).toBe(false);
  expect(watchTriggerAllowed('free')).toBe(false);
});

test('availableCredit: the oldest single_pass not spent', () => {
  const A = tx('A', 1);
  const B = tx('B', 2);
  expect(availableCredit(EMPTY_SNAPSHOT, new Set())).toBeUndefined();
  expect(availableCredit(snap(false, [B, A]), new Set())).toBe(A);
  expect(availableCredit(snap(false, [B, A]), new Set(['A']))).toBe(B);
  expect(availableCredit(snap(false, [B, A]), new Set(['A', 'B']))).toBeUndefined();
  const other: PassTransaction = { id: 'O', productId: 'other', purchasedAt: 0 };
  expect(availableCredit(snap(false, [other]), new Set())).toBeUndefined();
});

test('creditCount counts unspent Passes', () => {
  expect(creditCount(snap(false, [tx('A', 1), tx('B', 2)]), new Set(['A']))).toBe(1);
});

test('startGate: free first session, then Pro, then credit, else paywall', () => {
  const A = tx('A', 1);
  expect(startGate({ firstSessionUsed: false, proActive: false })).toEqual({ kind: 'firstSession' });
  expect(startGate({ firstSessionUsed: false, proActive: true, credit: A })).toEqual({ kind: 'firstSession' });
  expect(startGate({ firstSessionUsed: true, proActive: true, credit: A })).toEqual({ kind: 'pro' });
  expect(startGate({ firstSessionUsed: true, proActive: false, credit: A })).toEqual({ kind: 'credit', passTransactionId: 'A' });
  expect(startGate({ firstSessionUsed: true, proActive: false })).toEqual({ kind: 'paywall' });
});
