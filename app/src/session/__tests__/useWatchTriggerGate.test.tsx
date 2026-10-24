import { renderHook } from '@testing-library/react-native';

import { nextWatchGate, useWatchTriggerGate } from '../useWatchTriggerGate';

describe('nextWatchGate', () => {
  it('outside a recording it follows the tier', () => {
    expect(nextWatchGate({ recording: false, allowed: true }, false, false)).toBe(false);
    expect(nextWatchGate({ recording: false, allowed: false }, true, false)).toBe(true);
  });

  it('a recording starts with what the tier allows', () => {
    expect(nextWatchGate({ recording: false, allowed: false }, true, true)).toBe(true);
    expect(nextWatchGate({ recording: false, allowed: true }, false, true)).toBe(false);
  });

  it('mid-recording it is never taken away (Pro lapsing mid-game keeps the Save button)', () => {
    expect(nextWatchGate({ recording: true, allowed: true }, false, true)).toBe(true);
  });

  it('mid-recording it can still be granted', () => {
    expect(nextWatchGate({ recording: true, allowed: false }, true, true)).toBe(true);
  });

  it('once the recording ends a lapsed tier applies again', () => {
    expect(nextWatchGate({ recording: true, allowed: true }, false, false)).toBe(false);
  });
});

type Props = { recording: boolean; tierAllowed: boolean };

describe('useWatchTriggerGate', () => {
  it('tells the watch on mount and on each change, and not again for the same value', async () => {
    const send = jest.fn();
    const view = await renderHook(
      ({ recording, tierAllowed }: Props) => useWatchTriggerGate(recording, tierAllowed, send),
      { initialProps: { recording: false, tierAllowed: false } },
    );
    expect(send.mock.calls).toEqual([[false]]);
    await view.rerender({ recording: false, tierAllowed: true });
    expect(send).toHaveBeenLastCalledWith(true);
    await view.rerender({ recording: true, tierAllowed: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a tier that lapses mid-recording keeps the watch allowed until the recording ends', async () => {
    const send = jest.fn();
    const view = await renderHook(
      ({ recording, tierAllowed }: Props) => useWatchTriggerGate(recording, tierAllowed, send),
      { initialProps: { recording: true, tierAllowed: true } },
    );
    await view.rerender({ recording: true, tierAllowed: false });
    expect(send.mock.calls).toEqual([[true]]);
    await view.rerender({ recording: false, tierAllowed: false });
    expect(send).toHaveBeenLastCalledWith(false);
  });
});
