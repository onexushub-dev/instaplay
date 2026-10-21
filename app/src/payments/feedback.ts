import { Alert } from 'react-native';

import type { TFunction } from '../i18n';
import { payments } from '.';

/** Opens the paywall. A cancel is silent; a failure (no key, load error, unreadable purchases) gets a short notice. */
export async function openPaywall(sessionId: string, t: TFunction): Promise<void> {
  const outcome = await payments.showPaywall(sessionId);
  if (outcome === 'error') Alert.alert(t('payments.paywallError'));
}

/** Restores purchases and says what happened. */
export async function restorePurchases(t: TFunction): Promise<void> {
  const restored = await payments.restore();
  if (restored === true) Alert.alert(t('payments.restored'));
  else if (restored === false) Alert.alert(t('payments.nothingToRestore'));
}
