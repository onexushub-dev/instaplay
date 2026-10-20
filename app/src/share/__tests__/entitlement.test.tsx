import { act, renderHook } from '@testing-library/react-native';

import { useEntitlement } from '../entitlement';

const mockStore = {
  v: 0,
  tier: 'free' as 'free' | 'pass' | 'pro',
  listeners: new Set<() => void>(),
};

jest.mock('../../payments', () => ({
  payments: {
    subscribe: (l: () => void) => {
      mockStore.listeners.add(l);
      return () => mockStore.listeners.delete(l);
    },
    version: () => mockStore.v,
    tierFor: jest.fn((id?: string) => (id === 's1' ? mockStore.tier : 'free')),
  },
}));

test('returns the tier the store gives for the session', async () => {
  const { result } = await renderHook(() => useEntitlement('s1'));
  expect(result.current.tier).toBe('free');
});

test('re-renders when the store notifies', async () => {
  const { result } = await renderHook(() => useEntitlement('s1'));
  expect(result.current.tier).toBe('free');
  await act(async () => {
    mockStore.tier = 'pass';
    mockStore.v += 1;
    mockStore.listeners.forEach((l) => l());
  });
  expect(result.current.tier).toBe('pass');
});
