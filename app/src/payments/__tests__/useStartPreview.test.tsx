import { act, renderHook } from '@testing-library/react-native';

import { useStartPreview } from '../useStartPreview';

const mockRepo = { v: 0, left: 5, listeners: new Set<() => void>() };
const mockStore = { v: 0, listeners: new Set<() => void>() };

jest.mock('../../data/mmkv', () => ({
  repo: {
    subscribe: (l: () => void) => {
      mockRepo.listeners.add(l);
      return () => mockRepo.listeners.delete(l);
    },
    version: () => mockRepo.v,
  },
}));

jest.mock('..', () => ({
  payments: {
    subscribe: (l: () => void) => {
      mockStore.listeners.add(l);
      return () => mockStore.listeners.delete(l);
    },
    version: () => mockStore.v,
    peekStart: () => ({ kind: 'free' }),
    credits: () => 0,
    freeLeft: () => mockRepo.left,
  },
}));

test('freeLeft follows the repo when a free start is counted', async () => {
  mockRepo.left = 5;
  const { result } = await renderHook(() => useStartPreview());
  expect(result.current.freeLeft).toBe(5);
  await act(async () => {
    mockRepo.left = 4;
    mockRepo.v += 1;
    mockRepo.listeners.forEach((l) => l());
  });
  expect(result.current.freeLeft).toBe(4);
});
