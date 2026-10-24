import { getLocales } from 'expo-localization';
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

import { setLocale, syncLocale } from '..';
import { useLocaleSync, useT } from '../useT';

function Label() {
  const { t, locale } = useT();
  return <Text>{`${t('common.close')} ${locale}`}</Text>;
}

afterEach(() => setLocale('pt-BR'));

test('a mounted screen follows a language change made outside React (Android foreground)', async () => {
  await render(<Label />);
  expect(screen.getByText('Fechar pt-BR')).toBeTruthy();
  await act(async () => syncLocale(['en-US']));
  expect(screen.getByText('Close en')).toBeTruthy();
  await act(async () => syncLocale(['pt-BR']));
  expect(screen.getByText('Fechar pt-BR')).toBeTruthy();
});

test('coming back to the front re-reads the device languages', async () => {
  const listeners: ((s: string) => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
    listeners.push(fn as (s: string) => void);
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
  });
  function Root() {
    useLocaleSync();
    return <Label />;
  }
  await render(<Root />);
  jest.mocked(getLocales).mockReturnValueOnce([{ ...getLocales()[0], languageTag: 'en-US', languageCode: 'en' }]);
  await act(async () => listeners.forEach((fn) => fn('active')));
  expect(screen.getByText('Close en')).toBeTruthy();
  spy.mockRestore();
});
