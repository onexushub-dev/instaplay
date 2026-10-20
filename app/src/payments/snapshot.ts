import { PASS_PRODUCT_ID, PRO_ENTITLEMENT, type Snapshot } from './types';

export type CustomerInfoLike = {
  entitlements: { active: Record<string, unknown> };
  nonSubscriptionTransactions: {
    transactionIdentifier: string;
    productIdentifier: string;
    purchaseDateMillis: number;
  }[];
};

export function toSnapshot(info: CustomerInfoLike): Snapshot {
  return {
    proActive: PRO_ENTITLEMENT in info.entitlements.active,
    passTransactions: info.nonSubscriptionTransactions
      .filter((t) => t.productIdentifier === PASS_PRODUCT_ID)
      .map((t) => ({ id: t.transactionIdentifier, productId: t.productIdentifier, purchasedAt: t.purchaseDateMillis })),
  };
}
