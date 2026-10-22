import { Alert } from 'react-native';

import { translate } from '../../i18n';
import { openPaywall, openProPaywall, restorePurchases } from '../feedback';
import { payments } from '..';

jest.mock('..', () => ({ payments: { showPaywall: jest.fn(), showProPaywall: jest.fn(), restore: jest.fn() } }));

const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
const showPaywall = payments.showPaywall as jest.Mock;
const showProPaywall = payments.showProPaywall as jest.Mock;
const restore = payments.restore as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('openPaywall', () => {
  it('tells the user when the paywall fails', async () => {
    showPaywall.mockResolvedValue('error');
    await openPaywall('s1', t);
    expect(showPaywall).toHaveBeenCalledWith('s1');
    expect(Alert.alert).toHaveBeenCalledWith(t('payments.paywallError'));
  });
  it.each(['cancelled', 'purchased', 'restored'])('stays silent on %s', async (outcome) => {
    showPaywall.mockResolvedValue(outcome);
    await openPaywall('s1', t);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  it.each(['cancelled', 'purchased', 'restored', 'error'])('without a session opens the default paywall and returns %s', async (outcome) => {
    showPaywall.mockResolvedValue(outcome);
    await expect(openPaywall(undefined, t)).resolves.toBe(outcome);
    expect(showPaywall).toHaveBeenCalledWith(undefined);
  });
  it('without a session tells the user when the paywall fails', async () => {
    showPaywall.mockResolvedValue('error');
    await openPaywall(undefined, t);
    expect(Alert.alert).toHaveBeenCalledWith(t('payments.paywallError'));
  });
});

describe('openProPaywall', () => {
  it('tells the user when the Pro paywall fails (missing offering included)', async () => {
    showProPaywall.mockResolvedValue('error');
    await openProPaywall(t);
    expect(showProPaywall).toHaveBeenCalledWith();
    expect(Alert.alert).toHaveBeenCalledWith(t('payments.paywallError'));
  });
  it.each(['cancelled', 'purchased', 'restored'])('stays silent on %s', async (outcome) => {
    showProPaywall.mockResolvedValue(outcome);
    await openProPaywall(t);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('restorePurchases', () => {
  it('confirms a restore', async () => {
    restore.mockResolvedValue(true);
    await restorePurchases(t);
    expect(Alert.alert).toHaveBeenCalledWith(t('payments.restored'));
  });
  it('says when there was nothing to restore', async () => {
    restore.mockResolvedValue(false);
    await restorePurchases(t);
    expect(Alert.alert).toHaveBeenCalledWith(t('payments.nothingToRestore'));
  });
});
