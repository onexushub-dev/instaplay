import { act, renderHook } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import type { FocusTrack } from '../../data/focusFile';
import { useFocusFraming } from '../useFocusFraming';

const track: FocusTrack = {
  startMs: 0,
  stepMs: 100,
  rects: Array.from({ length: 300 }, (_, i) => [i / 600, 0.1, 0.5, 0.5] as [number, number, number, number]),
};

function fakePlayer() {
  let listener: ((e: { currentTime: number }) => void) | undefined;
  return {
    currentTime: 0,
    playbackRate: 1,
    addListener: (_: string, fn: (e: { currentTime: number }) => void) => {
      listener = fn;
      return { remove: () => (listener = undefined) };
    },
    emit(currentTime: number) {
      this.currentTime = currentTime;
      if (listener) listener({ currentTime });
    },
  };
}

test('playing on glides to the next framing; a jump (loop back, seek) moves there at once', async () => {
  const glide = jest.spyOn(Reanimated, 'withTiming');
  const player = fakePlayer();
  const view = await renderHook(() => useFocusFraming(player as never, track, true));
  await act(async () => player.emit(10));
  glide.mockClear();
  await act(async () => player.emit(10.1));
  expect(glide).toHaveBeenCalled();
  glide.mockClear();
  await act(async () => player.emit(2)); // the cut looped back to its start
  expect(glide).not.toHaveBeenCalled();
  expect(view.result.current!.read().cx).toBeCloseTo(2000 / 100 / 600 + 0.25, 6);
  glide.mockRestore();
});
