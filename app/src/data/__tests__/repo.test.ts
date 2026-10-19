import { createRepo, type FileProbe, type KV } from '../repo';

function memoryKV(map = new Map<string, string>()): KV {
  return {
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

function fakeFiles(sizes: Record<string, number>): FileProbe {
  return { exists: (p) => p in sizes, sizeBytes: (p) => sizes[p] ?? 0 };
}

function setup(sizes: Record<string, number> = {}) {
  let n = 0;
  return createRepo(memoryKV(), fakeFiles(sizes), () => `id-${++n}`);
}

test('prefs default to onboarding not done, Quadra, ultra-wide, gesture on, sound and flash on', () => {
  expect(setup().getPrefs()).toEqual({
    onboardingDone: false,
    sport: 'quadra',
    lens: 'ultraWide',
    gestureEnabled: true,
    soundOnSave: true,
    flashOnSave: true,
    voiceEnabled: false,
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

test('renameSession trims and stores the name', () => {
  const repo = setup();
  const s = repo.startSession('futevolei', 0);
  expect(repo.renameSession(s.id, '  Final do torneio  ').name).toBe('Final do torneio');
  expect(repo.getSession(s.id)?.name).toBe('Final do torneio');
});

test('a blank name removes it', () => {
  const repo = setup();
  const s = repo.startSession('futevolei', 0);
  repo.renameSession(s.id, 'Treino');
  expect(repo.renameSession(s.id, '   ').name).toBeUndefined();
});

test('names are cut at 40 characters', () => {
  const repo = setup();
  const s = repo.startSession('futevolei', 0);
  expect(repo.renameSession(s.id, 'x'.repeat(60)).name).toHaveLength(40);
});

test('listSessions skips games without clips and lists newest first', () => {
  const repo = setup({ '/a.mp4': 1, '/b.mp4': 1 });
  const old = repo.startSession('beachTennis', 1000);
  repo.startSession('outro', 2000); // no clips
  const recent = repo.startSession('futevolei', 3000);
  repo.addClip({ sessionId: old.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1 });
  repo.addClip({ sessionId: recent.id, createdAt: 2, source: 'screen', path: '/b.mp4', durationMs: 1 });
  const games = repo.listSessions();
  expect(games.map((g) => g.session.id)).toEqual([recent.id, old.id]);
  expect(games[0]).toMatchObject({ clips: 1, firstClip: { path: '/b.mp4' } });
});

test('updateClip stores the new trim and edit', () => {
  const repo = setup({ '/a.mp4': 1 });
  const s = repo.startSession('beachTennis', 0);
  const c = repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 60000 });
  repo.updateClip(c.id, { trim: { startMs: 10000, endMs: 25000 }, edit: { slowmo: true, muted: false } });
  expect(repo.getClip(c.id)).toMatchObject({ trim: { startMs: 10000, endMs: 25000 }, edit: { slowmo: true, muted: false } });
});

test('listSessions finds games stored before the game index existed', () => {
  const map = new Map<string, string>();
  const old = { id: 'old', sport: 'beachTennis', startedAt: 5, endedAt: 9 };
  map.set('lance:v1:session:old', JSON.stringify(old));
  map.set('lance:v1:clip:c1', JSON.stringify({ id: 'c1', sessionId: 'old', createdAt: 6, source: 'screen', path: '/a.mp4', durationMs: 1, trim: { startMs: 0, endMs: 1 } }));
  map.set('lance:v1:clips-of:old', JSON.stringify(['c1']));
  const repo = createRepo(memoryKV(map), fakeFiles({ '/a.mp4': 1 }), () => 'x');
  expect(repo.listSessions().map((g) => g.session.id)).toEqual(['old']);
});

test('updateClip on a deleted clip does nothing', () => {
  const map = new Map<string, string>();
  const repo = createRepo(memoryKV(map), fakeFiles({}), () => 'x');
  expect(repo.updateClip('gone', { trim: { startMs: 0, endMs: 1 } })).toBeUndefined();
  expect(map.size).toBe(0);
});

test('addClip with a 60s default cut on a 120s clip', () => {
  const repo = setup({ '/a.mp4': 1 });
  const s = repo.startSession('musculacao', 0);
  const c = repo.addClip({ sessionId: s.id, createdAt: 1, source: 'voice', path: '/a.mp4', durationMs: 120000 }, 60000);
  expect(c.trim).toEqual({ startMs: 60000, endMs: 120000 });
});
