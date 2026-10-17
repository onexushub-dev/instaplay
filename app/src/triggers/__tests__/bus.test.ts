import { createTriggerBus } from '../bus';

function clock(start = 0) {
  let t = start;
  return { now: () => t, set: (v: number) => void (t = v) };
}

test('accepts the first trigger and notifies with source and time', () => {
  const c = clock(500);
  const bus = createTriggerBus({ now: c.now });
  const seen: [string, number][] = [];
  bus.subscribe((source, at) => seen.push([source, at]));

  expect(bus.fire('screen')).toBe(true);
  expect(seen).toEqual([['screen', 500]]);
});

test('drops a trigger inside the debounce window', () => {
  const c = clock();
  const bus = createTriggerBus({ now: c.now });
  expect(bus.fire('screen')).toBe(true);
  c.set(2999);
  expect(bus.fire('screen')).toBe(false);
  c.set(3000);
  expect(bus.fire('screen')).toBe(true);
});

test('debounce is shared across sources', () => {
  const c = clock();
  const bus = createTriggerBus({ now: c.now });
  bus.fire('screen');
  c.set(1000);
  expect(bus.fire('gesture')).toBe(false);
});

test('unsubscribe stops notifications', () => {
  const bus = createTriggerBus({ now: () => 0 });
  const fn = jest.fn();
  const off = bus.subscribe(fn);
  off();
  bus.fire('remote');
  expect(fn).not.toHaveBeenCalled();
});
