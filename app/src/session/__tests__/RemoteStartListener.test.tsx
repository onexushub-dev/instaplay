import { act, render } from '@testing-library/react-native';

import { RemoteStartListener } from '../RemoteStartListener';

jest.mock('../../../modules/replay-camera', () => ({
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('../../data/mmkv', () => ({ repo: { getPrefs: () => ({ sport: 'beachTennis' }) } }));
jest.mock('../SessionContext', () => ({ useSession: jest.fn() }));

const camera = jest.requireMock('../../../modules/replay-camera');
const { useSession } = jest.requireMock('../SessionContext');
const { router } = jest.requireMock('expo-router');

function session(state: object) {
  const value = { state: { phase: 'idle', camera: 'on', ...state }, start: jest.fn(async () => {}) };
  useSession.mockReturnValue(value);
  return value;
}

async function askToStart() {
  const call = camera.addReplayListener.mock.calls.find((c: any[]) => c[0] === 'onRemoteStart');
  await act(async () => call[1]());
}

beforeEach(() => jest.clearAllMocks());

test('a remote asking to start begins a game when none is running', async () => {
  const s = session({});
  await render(<RemoteStartListener />);
  await askToStart();
  expect(s.start).toHaveBeenCalledTimes(1);
  expect(router.navigate).toHaveBeenCalledWith('/setup');
});

test('it starts again from the summary of the game that just ended', async () => {
  // The listener lives above every screen: the game's summary replaced the setup screen, so nothing else is listening.
  const s = session({ phase: 'ended', sessionId: 'g1' });
  await render(<RemoteStartListener />);
  await askToStart();
  expect(s.start).toHaveBeenCalledTimes(1);
  expect(router.navigate).toHaveBeenCalledWith('/setup');
});

test.each([
  ['recording', { phase: 'recording', sessionId: 'g1' }],
  ['stopping', { phase: 'stopping', sessionId: 'g1' }],
  ['starting', { phase: 'starting' }],
  ['the camera opening', { camera: 'starting' }],
  ['a game that ended with an error', { phase: 'ended', error: 'CAMERA_UNAVAILABLE' }],
])('a remote asking to start is ignored during %s', async (_name, state) => {
  const s = session(state);
  await render(<RemoteStartListener />);
  await askToStart();
  expect(s.start).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
});
