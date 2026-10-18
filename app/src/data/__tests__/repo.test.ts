import { createRepo, type FileProbe, type KV } from '../repo';

function memoryKV(): KV {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
  };
}

function fakeFiles(sizes: Record<string, number>): FileProbe {
  return { exists: (p) => p in sizes, sizeBytes: (p) => sizes[p] ?? 0 };
}

function setup(sizes: Record<string, number> = {}) {
  let n = 0;
  return createRepo(memoryKV(), fakeFiles(sizes), () => `id-${++n}`);
}

test('prefs default to onboarding not done, beach tennis, ultra-wide, gesture on, sound and flash on', () => {
  expect(setup().getPrefs()).toEqual({
    onboardingDone: false,
    sport: 'beachTennis',
    lens: 'ultraWide',
    gestureEnabled: true,
    soundOnSave: true,
    flashOnSave: true,
  });
});

test('setPrefs merges and persists', () => {
  const repo = setup();
  repo.setPrefs({ sport: 'futevolei' });
  expect(repo.getPrefs().sport).toBe('futevolei');
  expect(repo.getPrefs().gestureEnabled).toBe(true);
});

test('addClip sets the default trim to the last 30s', () => {
  const repo = setup({ '/a.mp4': 1, '/b.mp4': 1 });
  const s = repo.startSession('beachTennis', 1000);
  const long = repo.addClip({ sessionId: s.id, createdAt: 2000, source: 'screen', path: '/a.mp4', durationMs: 60000 });
  const short = repo.addClip({ sessionId: s.id, createdAt: 3000, source: 'gesture', path: '/b.mp4', durationMs: 12000 });
  expect(long.trim).toEqual({ startMs: 30000, endMs: 60000 });
  expect(short.trim).toEqual({ startMs: 0, endMs: 12000 });
});

test('listClips returns clips of one session oldest first', () => {
  const repo = setup({ '/a.mp4': 1, '/b.mp4': 1, '/c.mp4': 1 });
  const s1 = repo.startSession('beachTennis', 0);
  const s2 = repo.startSession('outro', 0);
  repo.addClip({ sessionId: s1.id, createdAt: 20, source: 'screen', path: '/b.mp4', durationMs: 1 });
  repo.addClip({ sessionId: s2.id, createdAt: 5, source: 'screen', path: '/c.mp4', durationMs: 1 });
  repo.addClip({ sessionId: s1.id, createdAt: 10, source: 'remote', path: '/a.mp4', durationMs: 1 });
  expect(repo.listClips(s1.id).map((c) => c.path)).toEqual(['/a.mp4', '/b.mp4']);
});

test('listClips drops clips whose file is gone', () => {
  const repo = setup({ '/kept.mp4': 1 });
  const s = repo.startSession('beachTennis', 0);
  repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/gone.mp4', durationMs: 1 });
  repo.addClip({ sessionId: s.id, createdAt: 2, source: 'screen', path: '/kept.mp4', durationMs: 1 });
  expect(repo.listClips(s.id).map((c) => c.path)).toEqual(['/kept.mp4']);
});

test('deleteClip removes it from the list', () => {
  const repo = setup({ '/a.mp4': 1 });
  const s = repo.startSession('beachTennis', 0);
  const c = repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1 });
  repo.deleteClip(c.id);
  expect(repo.listClips(s.id)).toEqual([]);
});

test('sessionStats sums sizes of existing clips and the recorded time', () => {
  const repo = setup({ '/a.mp4': 1_000_000, '/b.mp4': 2_000_000 });
  const s = repo.startSession('beachTennis', 10_000);
  repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1 });
  repo.addClip({ sessionId: s.id, createdAt: 2, source: 'screen', path: '/b.mp4', durationMs: 1 });
  repo.addClip({ sessionId: s.id, createdAt: 3, source: 'screen', path: '/gone.mp4', durationMs: 1 });
  expect(repo.sessionStats(s.id)).toEqual({ clips: 2, bytes: 3_000_000, recordedMs: 0 });
  repo.endSession(s.id, 70_000);
  expect(repo.sessionStats(s.id).recordedMs).toBe(60_000);
});

test('notifies subscribers and bumps the version when clips change', () => {
  const repo = setup({ '/a.mp4': 1 });
  const s = repo.startSession('beachTennis', 0);
  const fn = jest.fn();
  const off = repo.subscribe(fn);
  const before = repo.version();

  const c = repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1 });
  repo.deleteClip(c.id);

  expect(fn).toHaveBeenCalledTimes(2);
  expect(repo.version()).toBe(before + 2);
  off();
  repo.endSession(s.id, 5);
  expect(fn).toHaveBeenCalledTimes(2);
});
