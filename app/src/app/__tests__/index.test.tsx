import { render, screen } from '@testing-library/react-native';

import Index from '../index';

jest.mock('../../data/mmkv', () => ({ repo: { getPrefs: jest.fn() } }));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: T } = jest.requireActual('react-native');
    return <T>{`redirect:${href}`}</T>;
  },
}));

const { repo } = jest.requireMock('../../data/mmkv');

test('first run goes to onboarding', async () => {
  repo.getPrefs.mockReturnValue({ onboardingDone: false });
  await render(<Index />);
  expect(screen.getByText('redirect:/onboarding')).toBeTruthy();
});

test('returning user goes straight to setup', async () => {
  repo.getPrefs.mockReturnValue({ onboardingDone: true });
  await render(<Index />);
  expect(screen.getByText('redirect:/setup')).toBeTruthy();
});
