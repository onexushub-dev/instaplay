import { cutMsFor, MIN_CUT_MS } from '../cut';

test('the cut is the clip length when the previous clip is further back', () => {
  expect(cutMsFor(30, 107_000, 0)).toBe(30_000);
});

test('the cut stops at the previous clip', () => {
  expect(cutMsFor(30, 45_000, 30_000)).toBe(15_000);
  expect(cutMsFor(30, 3_000, 0)).toBe(3_000);
});

test('the cut is never shorter than the minimum', () => {
  expect(cutMsFor(30, 1_000, 0)).toBe(MIN_CUT_MS);
  expect(cutMsFor(30, 1_000, 5_000)).toBe(MIN_CUT_MS); // a clock that went backwards
});

test('a short clip length is respected even when the minimum is longer', () => {
  expect(cutMsFor(15, 100_000, 0)).toBe(15_000);
});
