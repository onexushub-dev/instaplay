import { detectPurchase, isClipLocked, shouldLockOnSave, tierFor } from '../rules';
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

test('shouldLockOnSave locks free clips from the eleventh on', () => {
  expect(shouldLockOnSave('free', 9)).toBe(false);
  expect(shouldLockOnSave('free', 10)).toBe(true);
  expect(shouldLockOnSave('free', 19)).toBe(true);
  expect(shouldLockOnSave('pass', 99)).toBe(false);
  expect(shouldLockOnSave('pro', 99)).toBe(false);
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
