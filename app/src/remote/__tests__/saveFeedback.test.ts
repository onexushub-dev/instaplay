import {
  cooldownLeft,
  IDLE,
  onResult,
  onTap,
  RESULT_SHOWN_MS,
  RESULT_TIMEOUT_MS,
  TIMEOUT_SHOWN_MS,
  tick,
  type SaveFeedback,
} from '../saveFeedback';

test('the constants', () => {
  expect(RESULT_TIMEOUT_MS).toBe(4000);
  expect(RESULT_SHOWN_MS).toBe(1200);
  expect(TIMEOUT_SHOWN_MS).toBe(2500);
});

test('a tap goes straight to sending, without waiting for the camera phone', () => {
  expect(onTap(IDLE, 1000)).toEqual({ phase: 'sending', since: 1000 });
});

test('a tap while still sending starts the wait over (the 3 s gap between taps lives in canSave)', () => {
  const sending: SaveFeedback = { phase: 'sending', since: 1000 };
  expect(onTap(sending, 4000)).toEqual({ phase: 'sending', since: 4000 });
});

test('a tap after a result starts a new send', () => {
  expect(onTap({ phase: 'saved', since: 1000 }, 5000)).toEqual({ phase: 'sending', since: 5000 });
});

test('the answer of the camera phone replaces sending', () => {
  const sending: SaveFeedback = { phase: 'sending', since: 1000 };
  expect(onResult(sending, true, 1300)).toEqual({ phase: 'saved', since: 1300 });
  expect(onResult(sending, false, 1300)).toEqual({ phase: 'failed', since: 1300 });
});

test('a late answer after the timeout is still shown', () => {
  expect(onResult({ phase: 'timeout', since: 5000 }, true, 6000)).toEqual({ phase: 'saved', since: 6000 });
});

test('an answer with no tap (a save started by the camera phone itself) is shown too', () => {
  expect(onResult(IDLE, true, 2000)).toEqual({ phase: 'saved', since: 2000 });
});

test('no answer in 4 seconds becomes a timeout', () => {
  const sending: SaveFeedback = { phase: 'sending', since: 1000 };
  expect(tick(sending, 4999)).toBe(sending);
  expect(tick(sending, 5000)).toEqual({ phase: 'timeout', since: 5000 });
});

test('results clear by themselves, the timeout stays longer', () => {
  const saved: SaveFeedback = { phase: 'saved', since: 1000 };
  expect(tick(saved, 2199)).toBe(saved);
  expect(tick(saved, 2200)).toEqual(IDLE);
  expect(tick({ phase: 'failed', since: 1000 }, 2200)).toEqual(IDLE);
  const timeout: SaveFeedback = { phase: 'timeout', since: 1000 };
  expect(tick(timeout, 3499)).toBe(timeout);
  expect(tick(timeout, 3500)).toEqual(IDLE);
});

test('idle stays idle', () => {
  expect(tick(IDLE, 99_999)).toBe(IDLE);
});

test('the cooldown ring empties over 3 seconds', () => {
  expect(cooldownLeft(null, 10_000)).toBe(0);
  expect(cooldownLeft(10_000, 10_000)).toBe(1);
  expect(cooldownLeft(10_000, 11_500)).toBeCloseTo(0.5);
  expect(cooldownLeft(10_000, 13_000)).toBe(0);
  expect(cooldownLeft(10_000, 20_000)).toBe(0);
});
