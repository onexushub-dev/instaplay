import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import * as gestureModule from '../useZoomGesture';
import { ZoomableVideo } from '../ZoomableVideo';

jest.mock('expo-video', () => ({ VideoView: () => null }));

function follow() {
  const sv = (v: number) => ({ value: v, get: () => v, set: () => {} });
  return { scale: sv(1.5), cx: sv(0.5), cy: sv(0.5), sync: () => {}, read: () => ({ scale: 1.5, cx: 0.5, cy: 0.5 }) };
}

const props = {
  player: {} as never,
  area: { width: 300, height: 200 },
  box: { left: 0, top: 0, width: 300, height: 200 },
  zoom: undefined,
  rotation: 0 as const,
  onCommit: () => {},
  onTap: () => {},
};

test('the framing eases in once when following starts, not again when the ease length changes', async () => {
  const glide = jest.spyOn(Reanimated, 'withTiming');
  const f = follow() as never;
  const view = await render(<ZoomableVideo {...props} follow={f} enterMs={700} />);
  expect(glide).toHaveBeenCalledTimes(1);
  await view.rerender(<ZoomableVideo {...props} follow={f} enterMs={400} />);
  expect(glide).toHaveBeenCalledTimes(1);
  glide.mockRestore();
});

test('a hold handler from the screen gets the hold even when the picture does not follow', async () => {
  const gesture = jest.spyOn(gestureModule, 'useZoomGesture');
  const onHold = jest.fn();
  await render(<ZoomableVideo {...props} onHold={onHold} pinch={false} />);
  const last = gesture.mock.calls[gesture.mock.calls.length - 1][0] as { onHold?: (down: boolean) => void; pinch?: boolean };
  expect(last.pinch).toBe(false);
  last.onHold!(true);
  last.onHold!(false);
  expect(onHold.mock.calls).toEqual([[true], [false]]);
  gesture.mockRestore();
});
