// Jest stand-in for the RevenueCat paywall UI module (native).
const PAYWALL_RESULT = {
  NOT_PRESENTED: 'NOT_PRESENTED',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
  PURCHASED: 'PURCHASED',
  RESTORED: 'RESTORED',
} as const;

const RevenueCatUI = {
  PAYWALL_RESULT,
  presentPaywall: jest.fn(async () => PAYWALL_RESULT.CANCELLED as string),
};

export { PAYWALL_RESULT };
export default RevenueCatUI;
