import { act, render, screen } from '@testing-library/react-native';

import { Playhead } from '../Playhead';

function fakePlayer() {
  let listener: (e: { currentTime: number }) => void = () => {};
  return {
    addListener: (_: string, fn: typeof listener) => ((listener = fn), { remove() {} }),
    tick: (seconds: number) => listener({ currentTime: seconds }),
  };
}

const trim = { startMs: 30_000, endMs: 60_000 };

test('shows how far into the cut the video is, in seconds', async () => {
  const player = fakePlayer();
  await render(<Playhead player={player as never} durationMs={60_000} trim={trim} speed={1} />);
  await act(async () => player.tick(33.2));
  expect(screen.getByText('3.2s')).toBeTruthy();
});

test('at 2x the time shown is the time of the result, half of the clip time', async () => {
  const player = fakePlayer();
  await render(<Playhead player={player as never} durationMs={60_000} trim={trim} speed={2} />);
  await act(async () => player.tick(40));
  expect(screen.getByText('5.0s')).toBeTruthy();
});

test('sits at the clip position on the track', async () => {
  const player = fakePlayer();
  await render(<Playhead player={player as never} durationMs={60_000} trim={trim} speed={1} />);
  await act(async () => player.tick(45));
  expect(screen.getByTestId('playhead').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ left: '75%' })]));
});

test('a position given while dragging a handle wins over the playback', async () => {
  const player = fakePlayer();
  await render(<Playhead player={player as never} durationMs={60_000} trim={trim} speed={1} scrubMs={50_000} />);
  await act(async () => player.tick(31));
  expect(screen.getByText('20.0s')).toBeTruthy();
});

test('never shows a negative time before the cut starts', async () => {
  const player = fakePlayer();
  await render(<Playhead player={player as never} durationMs={60_000} trim={trim} speed={1} />);
  await act(async () => player.tick(10));
  expect(screen.getByText('0.0s')).toBeTruthy();
});

test('with a floor the track starts at the floor', async () => {
  const player = fakePlayer();
  await render(<Playhead player={player as never} durationMs={60_000} floorMs={10_000} trim={{ startMs: 10_000, endMs: 60_000 }} speed={1} />);
  await act(async () => player.tick(35));
  expect(screen.getByTestId('playhead').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ left: '50%' })]));
});
