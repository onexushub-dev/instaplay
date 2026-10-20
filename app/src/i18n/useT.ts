import { useLocales } from 'expo-localization';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { type AppLocale, currentLocale, type MessageKey, type MessageParams, subscribeLocale, syncLocale, translate } from '.';

/**
 * The current language and a `t` bound to it. Re-renders when the language changes; `t` is a new function per
 * language, so memoized values that use it (React Compiler) are recomputed.
 */
export function useT(): { t: (key: MessageKey, params?: MessageParams) => string; locale: AppLocale } {
  const locale = useSyncExternalStore(subscribeLocale, currentLocale);
  const t = useCallback((key: MessageKey, params?: MessageParams) => translate(locale, key, params), [locale]);
  return { t, locale };
}

/**
 * Keeps the app language in step with the device: mount once at the root. iOS restarts the app when its language
 * changes; Android does not, so the languages are read again on every change event and every return to the front.
 */
export function useLocaleSync(): void {
  const locales = useLocales();
  useEffect(() => {
    syncLocale(locales.map((l) => l.languageTag));
  }, [locales]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncLocale();
    });
    return () => sub.remove();
  }, []);
}
