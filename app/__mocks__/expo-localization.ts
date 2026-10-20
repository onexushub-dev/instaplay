// Jest stand-in for expo-localization: a phone set to Brazilian Portuguese, so the app's tests run in pt-BR.
// Tests that need English call setLocale('en') from src/i18n.
const PT_BR = {
  languageTag: 'pt-BR',
  languageCode: 'pt',
  languageScriptCode: 'Latn',
  regionCode: 'BR',
  languageRegionCode: 'BR',
  currencyCode: 'BRL',
  currencySymbol: 'R$',
  languageCurrencyCode: 'BRL',
  languageCurrencySymbol: 'R$',
  decimalSeparator: ',',
  digitGroupingSeparator: '.',
  textDirection: 'ltr' as const,
  measurementSystem: 'metric' as const,
  temperatureUnit: 'celsius' as const,
};

const CALENDAR = { calendar: 'gregory', uses24hourClock: true, firstWeekday: 1, timeZone: 'America/Sao_Paulo' };

// Same array every call, like the real hook between OS changes.
const LOCALES = [PT_BR];
const CALENDARS = [CALENDAR];

export const getLocales = jest.fn(() => LOCALES);
export const useLocales = jest.fn(() => LOCALES);
export const getCalendars = jest.fn(() => CALENDARS);
export const useCalendars = jest.fn(() => CALENDARS);
