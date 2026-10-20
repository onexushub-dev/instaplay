import { toSnapshot } from '../snapshot';

const tx = (id: string, productIdentifier: string) => ({
  transactionIdentifier: id,
  productIdentifier,
  purchaseDateMillis: 1000,
});

describe('toSnapshot', () => {
  it('ignores products that are not the game pass', () => {
    const s = toSnapshot({
      entitlements: { active: {} },
      nonSubscriptionTransactions: [tx('a', 'game_pass'), tx('b', 'other')],
    });
    expect(s.passTransactions).toEqual([{ id: 'a', productId: 'game_pass', purchasedAt: 1000 }]);
  });

  it('proActive only with the pro entitlement', () => {
    const base = { nonSubscriptionTransactions: [] };
    expect(toSnapshot({ ...base, entitlements: { active: { pro: {} } } }).proActive).toBe(true);
    expect(toSnapshot({ ...base, entitlements: { active: { other: {} } } }).proActive).toBe(false);
  });
});
