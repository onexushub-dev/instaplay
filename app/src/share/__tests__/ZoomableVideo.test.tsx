import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

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
