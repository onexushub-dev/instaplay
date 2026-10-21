import { clearRemotePress, hasRemotePress, markRemotePress, subscribeRemotePress } from '../remoteTest';

beforeEach(() => clearRemotePress());

test('starts without a press', () => {
  expect(hasRemotePress()).toBe(false);
});

test('a press is remembered for the rest of the launch', () => {
  markRemotePress();
  expect(hasRemotePress()).toBe(true);
});

test('listeners hear presses and clears, and stop hearing after unsubscribing', () => {
  const heard = jest.fn();
  const off = subscribeRemotePress(heard);
  markRemotePress();
  clearRemotePress();
  expect(heard).toHaveBeenCalledTimes(2);
  off();
  markRemotePress();
  expect(heard).toHaveBeenCalledTimes(2);
});
