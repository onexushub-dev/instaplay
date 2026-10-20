import { canSave, remoteScreen, SAVE_COOLDOWN, STALE_AFTER, type RemoteInput } from '../remoteScreen';

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

test('a refused Local Network wins over everything else', () => {
  expect(remoteScreen({ link: 'denied', hostName: 'Quadra 1', state: state() })).toEqual({ kind: 'denied' });
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

test('connected but no state yet still reads as searching', () => {
  expect(remoteScreen({ link: 'connected', hostName: 'Quadra 1', state: null })).toEqual({
    kind: 'searching',
    hostName: 'Quadra 1',
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

test('losing the link after hearing from the camera phone is stale, not searching', () => {
  expect(remoteScreen({ link: 'searching', hostName: 'Quadra 1', state: state() })).toEqual({
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
