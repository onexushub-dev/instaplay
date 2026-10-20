import type { TriggerSource } from '../data/schema';
import { type AppLocale, currentLocale, translate } from '../i18n';

/** Every way of saving a clip (the ids stored with each clip). */
export const SOURCE_IDS: TriggerSource[] = ['screen', 'gesture', 'remote', 'watch', 'voice', 'phone'];

/** How a way of saving reads on screen. */
export function sourceLabel(source: TriggerSource, locale: AppLocale = currentLocale()): string {
  return translate(locale, `sources.${source}`);
}
