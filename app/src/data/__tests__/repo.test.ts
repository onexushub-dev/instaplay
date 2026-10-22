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

test('renameClip trims and stores the name; a blank name removes it; names are cut at 40', () => {
  const repo = setup({ '/a.mp4': 1 });
  const s = repo.startSession('quadra', 0);
  const clip = repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1 });
  expect(repo.renameClip(clip.id, '  Ace no fundo  ')?.name).toBe('Ace no fundo');
  expect(repo.getClip(clip.id)?.name).toBe('Ace no fundo');
  expect(repo.renameClip(clip.id, 'x'.repeat(60))?.name).toHaveLength(40);
  expect(repo.renameClip(clip.id, '   ')?.name).toBeUndefined();
});

test('renameClip on a deleted clip does nothing', () => {
  const repo = setup();
  expect(repo.renameClip('gone', 'x')).toBeUndefined();
});

test('setSessionPass persists the transaction id and notifies subscribers', () => {
  const repo = setup();
  const s = repo.startSession('quadra', 0);
  const fn = jest.fn();
  repo.subscribe(fn);
  const updated = repo.setSessionPass(s.id, 'tx-1');
  expect(updated?.passTransactionId).toBe('tx-1');
  expect(repo.getSession(s.id)?.passTransactionId).toBe('tx-1');
  expect(fn).toHaveBeenCalledTimes(1);
});

test('setSessionPass returns undefined for a missing game', () => {
  const repo = setup();
  const fn = jest.fn();
  repo.subscribe(fn);
  expect(repo.setSessionPass('nope', 'tx')).toBeUndefined();
  expect(fn).not.toHaveBeenCalled();
});

test('addClip persists locked', () => {
  const repo = setup({ '/a.mp4': 1 });
  const s = repo.startSession('quadra', 0);
  const c = repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1, locked: true });
  expect(repo.getClip(c.id)?.locked).toBe(true);
});

test('unlockedClipCount and lockedCount count only existing clips and respect deleteClip', () => {
  const repo = setup({ '/a.mp4': 1, '/b.mp4': 1, '/c.mp4': 1 });
  const s = repo.startSession('quadra', 0);
  const base = { sessionId: s.id, source: 'screen' as const, durationMs: 1 };
  repo.addClip({ ...base, createdAt: 1, path: '/a.mp4' });
  repo.addClip({ ...base, createdAt: 2, path: '/b.mp4', locked: false });
  const l = repo.addClip({ ...base, createdAt: 3, path: '/c.mp4', locked: true });
  repo.addClip({ ...base, createdAt: 4, path: '/gone.mp4', locked: true });
  repo.addClip({ ...base, createdAt: 5, path: '/gone2.mp4' });
  expect(repo.unlockedClipCount(s.id)).toBe(2);
  expect(repo.lockedCount(s.id)).toBe(1);
  repo.deleteClip(l.id);
  expect(repo.lockedCount(s.id)).toBe(0);
});

test('deleteSession removes the game, its clips and the index entry, and returns the files to delete', () => {
  const repo = setup({ '/a.mp4': 1, '/b.mp4': 1 });
  const s = repo.startSession('beachTennis', 0);
  repo.addClip({ sessionId: s.id, createdAt: 1, source: 'screen', path: '/a.mp4', durationMs: 1 });
  repo.addClip({ sessionId: s.id, createdAt: 2, source: 'screen', path: '/b.mp4', durationMs: 1 });
  expect(repo.deleteSession(s.id)).toEqual(['/a.mp4', '/b.mp4']);
  expect(repo.getSession(s.id)).toBeUndefined();
  expect(repo.listClips(s.id)).toEqual([]);
  expect(repo.listSessions()).toEqual([]);
});

test('first session marker: false on a new repo, true after startSession, survives deleting the session', () => {
  const repo = setup();
  expect(repo.isFirstSessionUsed()).toBe(false);
  const s = repo.startSession('quadra', 1);
  expect(repo.isFirstSessionUsed()).toBe(true);
  repo.deleteSession(s.id);
  expect(repo.isFirstSessionUsed()).toBe(true);
});

test('startSession with a pass transaction stores it on the session and spends it; without, no passTransactionId', () => {
  const repo = setup();
  const paid = repo.startSession('quadra', 1, 'tx-1');
  expect(paid.passTransactionId).toBe('tx-1');
  expect(repo.getSession(paid.id)?.passTransactionId).toBe('tx-1');
  expect(repo.spentPasses().has('tx-1')).toBe(true);
  const free = repo.startSession('quadra', 2);
  expect('passTransactionId' in free).toBe(false);
});

test('startSession notifies subscribers once', () => {
  const repo = setup();
  const fn = jest.fn();
  repo.subscribe(fn);
  repo.startSession('quadra', 1, 'tx-1');
  expect(fn).toHaveBeenCalledTimes(1);
});

test('deleteSession keeps the pass id spent', () => {
  const repo = setup();
  const s = repo.startSession('quadra', 1, 'tx-1');
  repo.deleteSession(s.id);
  expect(repo.spentPasses().has('tx-1')).toBe(true);
});

test('setSessionPass spends the transaction; a missing session spends nothing', () => {
  const repo = setup();
  const s = repo.startSession('quadra', 1);
  repo.setSessionPass(s.id, 'tx-2');
  expect(repo.spentPasses().has('tx-2')).toBe(true);
  repo.setSessionPass('nope', 'tx-3');
  expect(repo.spentPasses().has('tx-3')).toBe(false);
});

test('spentPasses migrates from existing sessions when the key is missing', () => {
  const map = new Map<string, string>();
  map.set('lance:v1:session:a', JSON.stringify({ id: 'a', sport: 'quadra', startedAt: 1, passTransactionId: 'old' }));
  map.set('lance:v1:session:b', JSON.stringify({ id: 'b', sport: 'quadra', startedAt: 2 }));
  const repo = createRepo(memoryKV(map), fakeFiles({}), () => 'x');
  expect([...repo.spentPasses()]).toEqual(['old']);
  expect(map.has('lance:v1:spentPasses')).toBe(true);
});

test('spendPasses dedupes and only notifies on change', () => {
  const repo = setup();
  const fn = jest.fn();
  repo.subscribe(fn);
  repo.spendPasses(['a', 'a', 'b']);
  expect([...repo.spentPasses()].sort()).toEqual(['a', 'b']);
  expect(fn).toHaveBeenCalledTimes(1);
  repo.spendPasses(['a']);
  expect(fn).toHaveBeenCalledTimes(1);
});

const legacy = () => {
  const map = new Map<string, string>();
  map.set('lance:v1:session:a', JSON.stringify({ id: 'a', sport: 'quadra', startedAt: 1, passTransactionId: 'old' }));
  return map;
};
const repoOver = (map: Map<string, string>) => createRepo(memoryKV(map), fakeFiles({}), () => 'new');

test('deleting a legacy paid game before any ledger read keeps its id spent', () => {
  const repo = repoOver(legacy());
  repo.deleteSession('a');
  expect(repo.spentPasses().has('old')).toBe(true);
});

test('spentPasses rebuilds from games when the ledger is corrupt or not an array', () => {
  for (const bad of ['{not json', '{"a":1}']) {
    const map = legacy();
    map.set('lance:v1:spentPasses', bad);
    expect([...repoOver(map).spentPasses()]).toEqual(['old']);
  }
});

test('a corrupt game record does not break migration, startSession or setSessionPass', () => {
  const map = legacy();
  map.set('lance:v1:session:bad', '{oops');
  const repo = repoOver(map);
  expect(() => repo.startSession('quadra', 5, 'tx-9')).not.toThrow();
  expect(repo.spentPasses().has('old')).toBe(true);
  expect(repo.setSessionPass('bad', 'tx-x')).toBeUndefined();
  expect(repo.spentPasses().has('tx-x')).toBe(false);
});

test('fresh install: empty ledger, marker false', () => {
  const repo = setup();
  expect(repo.spentPasses().size).toBe(0);
  expect(repo.isFirstSessionUsed()).toBe(false);
});

test('an existing ledger key is left alone', () => {
  const map = legacy();
  map.set('lance:v1:spentPasses', JSON.stringify(['kept']));
  expect([...repoOver(map).spentPasses()]).toEqual(['kept']);
});

test('startSession during migration adds no duplicates; marker stays false with old games', () => {
  const map = legacy();
  const repo = repoOver(map);
  expect(repo.isFirstSessionUsed()).toBe(false);
  repo.startSession('quadra', 5, 'old');
  expect([...repo.spentPasses()]).toEqual(['old']);
});

test('startSession without a pass notifies once', () => {
  const repo = setup();
  const fn = jest.fn();
  repo.subscribe(fn);
  repo.startSession('quadra', 1);
  expect(fn).toHaveBeenCalledTimes(1);
});
