import { canSave, connectionTone, remoteScreen, SAVE_COOLDOWN, STALE_AFTER, type RemoteInput } from '../remoteScreen';

const state = (over: Partial<NonNullable<RemoteInput['state']>> = {}) => ({
  recording: true,
  clipCount: 3,
  startedAt: 1000,
  ageSec: 4,
  ...over,
});

test('the constants match the spec', () => {
  expect(STALE_AFTER).toBe(12);
  expect(SAVE_COOLDOWN).toBe(3);
});

test('Bluetooth off or not allowed wins over everything else', () => {
  expect(remoteScreen({ link: 'denied', hostName: 'Quadra 1', state: state() })).toEqual({ kind: 'denied', reason: 'off' });
  expect(remoteScreen({ link: 'denied', reason: 'unauthorized', hostName: 'Quadra 1', state: state() })).toEqual({
    kind: 'denied',
    reason: 'unauthorized',
  });
});

test('looking for the camera phone, before anything has been heard', () => {
  expect(remoteScreen({ link: 'searching', hostName: null, state: null })).toEqual({ kind: 'searching', hostName: null });
  expect(remoteScreen({ link: 'searching', hostName: 'Quadra 1', state: null })).toEqual({
    kind: 'searching',
    hostName: 'Quadra 1',
  });
  expect(remoteScreen({ link: 'idle', hostName: 'Quadra 1', state: null })).toEqual({
    kind: 'searching',
    hostName: 'Quadra 1',
  });
});

test('connected but no state yet is already connected: it waits for the game, it does not keep searching', () => {
  expect(remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: null })).toEqual({
    kind: 'waiting',
    hostName: 'Quadra 1',
  });
  expect(remoteScreen({ link: 'connected', hostName: null, state: null })).toEqual({
    kind: 'waiting',
    hostName: 'Celular da câmera',
  });
});

test('connected and not recording waits for the game', () => {
  expect(remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: state({ recording: false, clipCount: 0, startedAt: null }) })).toEqual({
    kind: 'waiting',
    hostName: 'Quadra 1',
  });
});

test('connected and recording shows the count and the start', () => {
  expect(remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: state() })).toEqual({
    kind: 'recording',
    hostName: 'Quadra 1',
    clipCount: 3,
    startedAt: 1000,
  });
});

test('news older than 12 s is not believed, and a fresh state brings it back', () => {
  const at = (ageSec: number) => remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: state({ ageSec }) }).kind;
  expect(at(12)).toBe('recording');
  expect(at(12.1)).toBe('stale');
  expect(at(13)).toBe('stale');
  expect(at(1)).toBe('recording');
});

test('losing the link after hearing from the camera phone is reconnecting, not searching and not stale', () => {
  expect(remoteScreen({ link: 'searching', hostName: 'Quadra 1', state: state() })).toEqual({
    kind: 'reconnecting',
    hostName: 'Quadra 1',
  });
  expect(remoteScreen({ link: 'idle', hostName: 'Quadra 1', state: state({ ageSec: 40 }) }).kind).toBe('reconnecting');
});

test('waiting for the game never turns into a failure while the beats keep coming', () => {
  // The camera phone beats every 5 s, so the age of a connected, idle link never passes ~5 s.
  for (const ageSec of [0, 2, 4.9, 5.1, 9]) {
    expect(
      remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: state({ recording: false, clipCount: 0, startedAt: null, ageSec }) }).kind,
    ).toBe('waiting');
  }
});

test('a connected link that has gone silent is stale, whether or not it was recording', () => {
  expect(remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: state({ recording: false, ageSec: 30 }) })).toEqual({
    kind: 'stale',
    hostName: 'Quadra 1',
  });
});

test('a missing host name falls back to a generic one', () => {
  expect(remoteScreen({ link: 'connected', hostName: null, state: state() })).toMatchObject({
    kind: 'recording',
    hostName: 'Celular da câmera',
  });
});

test('one save per 3 seconds', () => {
  expect(canSave(10_000, null)).toBe(true);
  expect(canSave(12_999, 10_000)).toBe(false);
  expect(canSave(13_000, 10_000)).toBe(true);
});

describe('connectionTone', () => {
  const tone = (input: RemoteInput) => connectionTone(remoteScreen(input));
  test('green when the camera phone is there, amber while looking or lost, red when denied', () => {
    expect(tone({ link: 'connected', hostName: 'Q', state: state() })).toBe('ok');
    expect(tone({ link: 'connected', hostName: 'Q', state: state({ recording: false }) })).toBe('ok');
    expect(tone({ link: 'searching', hostName: 'Q', state: null })).toBe('warn');
    expect(tone({ link: 'connected', hostName: 'Q', state: state({ ageSec: 20 }) })).toBe('warn');
    expect(tone({ link: 'searching', hostName: 'Q', state: state() })).toBe('warn');
    expect(tone({ link: 'denied', hostName: 'Q', state: null })).toBe('bad');
  });
});
