import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WatchProgress } from '../WatchProgress';

function fakePlayer() {
  let listener: ((e: { currentTime: number }) => void) | undefined;
  return {
    addListener: (_: string, fn: (e: { currentTime: number }) => void) => {
      listener = fn;
      return { remove: () => (listener = undefined) };
    },
    emit: (t: number) => listener && listener({ currentTime: t }),
  };
}

test('shows the time into the cut and plays or pauses', async () => {
  const player = fakePlayer();
  const onTogglePlay = jest.fn();
  await render(
    <WatchProgress
      player={player as never}
      trim={{ startMs: 30000, endMs: 60000 }}
      speed={1}
      playing
      onTogglePlay={onTogglePlay}
      onSeek={() => {}}
      onSeekEnd={() => {}}
    />,
  );
  await act(async () => player.emit(41));
  expect(screen.getByText('0:11')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Pausar' }));
  expect(onTogglePlay).toHaveBeenCalled();
});

test('dragging moves through the cut from where the finger landed, whatever part of the bar it touched', async () => {
  const onSeek = jest.fn();
  await render(
    <WatchProgress
      player={fakePlayer() as never}
      trim={{ startMs: 30000, endMs: 60000 }}
      speed={1}
      playing
      onTogglePlay={() => {}}
      onSeek={onSeek}
      onSeekEnd={() => {}}
    />,
  );
  const bar = screen.getByLabelText('Posição no clipe');
  await act(async () => bar.props.onLayout({ nativeEvent: { layout: { width: 300, height: 32, x: 0, y: 0 } } }));
  // `locationX` is relative to whatever view is under the finger; `pageX` moves with the finger along the bar.
  const touch = (locationX: number, pageX: number, t: number) => ({
    nativeEvent: { locationX, pageX, touches: [{}], changedTouches: [] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
      touchBank: [
        { touchActive: true, startPageX: 150, startPageY: 0, startTimeStamp: 1, currentPageX: pageX, currentPageY: 0, currentTimeStamp: t, previousPageX: 150, previousPageY: 0, previousTimeStamp: 1 },
      ],
    },
  });
  await act(async () => bar.props.onResponderGrant(touch(150, 150, 1)));
  expect(onSeek).toHaveBeenLastCalledWith(45000);
  // The finger is now over the knob: its own position says 5, but it moved 30 along the bar.
  await act(async () => bar.props.onResponderMove(touch(5, 180, 2)));
  expect(onSeek).toHaveBeenLastCalledWith(48000);
});
