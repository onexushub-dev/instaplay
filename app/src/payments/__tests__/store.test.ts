import { createFakeClient } from '../fakeClient';
import { createPaymentsStore } from '../store';
import { EMPTY_SNAPSHOT, type Snapshot } from '../types';

const tx = (id: string, purchasedAt = 1) => ({ id, productId: 'game_pass', purchasedAt });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ ...EMPTY_SNAPSHOT, ...over });

function memRepo(sessions: Record<string, { passTransactionId?: string }> = { s1: {}, s2: {} }) {
  return {
    getSession: jest.fn((id: string) => sessions[id] as any),
    setSessionPass: jest.fn((id: string, t: string) => {
      if (!sessions[id]) return undefined;
      sessions[id] = { ...sessions[id], passTransactionId: t };
      return sessions[id] as any;
    }),
  };
}

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

async function setup(initial: Snapshot = snap(), sessions?: Record<string, { passTransactionId?: string }>) {
  const client = createFakeClient();
  client.snapshot = initial;
  const repo = memRepo(sessions);
  const store = createPaymentsStore(client, repo);
  store.start();
  await flush();
  return { client, repo, store };
}

describe('payments store', () => {
  it('start loads the snapshot and onSnapshot updates and notifies', async () => {
    const { client, store } = await setup(snap({ proActive: true }));
    expect(store.getSnapshot().proActive).toBe(true);
    const fn = jest.fn();
    store.subscribe(fn);
    const v = store.version();
    client.emit(snap({ passTransactions: [tx('a')] }));
    expect(store.getSnapshot().passTransactions).toHaveLength(1);
    expect(fn).toHaveBeenCalled();
    expect(store.version()).not.toBe(v);
  });

  it('tierFor reflects pass, pro and free', async () => {
    const { store } = await setup(snap(), { s1: { passTransactionId: 't' }, s2: {} });
    expect(store.tierFor('s1')).toBe('pass');
    expect(store.tierFor('s2')).toBe('free');
    expect(store.tierFor()).toBe('free');
    const p = await setup(snap({ proActive: true }));
    expect(p.store.tierFor('s1')).toBe('pro');
  });

  it('tierFor never throws when getSnapshot fails', async () => {
    const { client, store } = await (async () => {
      const client = createFakeClient();
      client.failSnapshot = true;
      const repo = memRepo({ s1: { passTransactionId: 't' }, s2: {} });
      const store = createPaymentsStore(client, repo);
      store.start();
      await flush();
      return { client, store };
    })();
    expect(client.failSnapshot).toBe(true);
    expect(store.tierFor('s2')).toBe('free');
    expect(store.tierFor('s1')).toBe('pass');
  });

  it('purchased with a new transaction binds the pass to the session', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'purchased';
    client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
    const fn = jest.fn();
    store.subscribe(fn);
    await expect(store.showPaywall('s1')).resolves.toBe('purchased');
    expect(repo.setSessionPass).toHaveBeenCalledWith('s1', 'tx-2');
    expect(store.tierFor('s1')).toBe('pass');
    expect(store.tierFor('s2')).toBe('free');
    expect(fn).toHaveBeenCalled();
  });

  it('Pro purchase binds nothing and tier is pro', async () => {
    const { client, repo, store } = await setup();
    client.nextOutcome = 'purchased';
    client.snapshot = snap({ proActive: true });
    await store.showPaywall('s1');
    expect(repo.setSessionPass).not.toHaveBeenCalled();
    expect(store.tierFor('s1')).toBe('pro');
  });

  it('cancelled binds nothing', async () => {
    const { client, repo, store } = await setup();
    client.nextOutcome = 'cancelled';
    client.snapshot = snap({ passTransactions: [tx('x')] });
    await expect(store.showPaywall('s1')).resolves.toBe('cancelled');
    expect(repo.setSessionPass).not.toHaveBeenCalled();
  });

  it('restored without a new transaction binds nothing', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'restored';
    await store.showPaywall('s1');
    expect(repo.setSessionPass).not.toHaveBeenCalled();
  });

  it('failure reading the snapshot after purchased keeps a pending bind resolved by onSnapshot', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'purchased';
    client.failSnapshot = true;
    await expect(store.showPaywall('s1')).resolves.toBe('purchased');
    expect(repo.setSessionPass).not.toHaveBeenCalled();
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
    expect(repo.setSessionPass).toHaveBeenCalledWith('s1', 'tx-2');
    expect(store.tierFor('s1')).toBe('pass');
  });

  it('a second showPaywall while one is open returns cancelled without calling the client', async () => {
    const { client, store } = await setup();
    const spy = jest.spyOn(client, 'showPaywall');
    client.nextOutcome = 'cancelled';
    const first = store.showPaywall('s1');
    await expect(store.showPaywall('s1')).resolves.toBe('cancelled');
    expect(spy).toHaveBeenCalledTimes(1);
    await first;
  });

  it('restore resolves true when pro became active', async () => {
    const { client, store } = await setup();
    client.snapshot = snap({ proActive: true });
    await expect(store.restore()).resolves.toBe(true);
    expect(store.getSnapshot().proActive).toBe(true);
  });

  it('a stale emit without the new transaction does not clear the pending bind', async () => {
    const before = snap({ passTransactions: [tx('tx-1')] });
    const { client, repo, store } = await setup(before);
    client.nextOutcome = 'purchased';
    client.failSnapshot = true;
    await store.showPaywall('s1');
    client.emit(before); // stale
    expect(repo.setSessionPass).not.toHaveBeenCalled();
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
    expect(repo.setSessionPass).toHaveBeenCalledWith('s1', 'tx-2');
  });

  it('emit during the paywall followed by a failed read still binds from current', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    let release!: () => void;
    client.paywallGate = new Promise<void>((r) => (release = r));
    client.nextOutcome = 'purchased';
    const p = store.showPaywall('s1');
    await flush();
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
    client.failSnapshot = true;
    release();
    await p;
    expect(repo.setSessionPass).toHaveBeenCalledWith('s1', 'tx-2');
    expect(repo.setSessionPass).toHaveBeenCalledTimes(1);
  });

  it('a purchased pending blocks the next paywall while the read fails, then binds to its own session', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'purchased';
    client.failSnapshot = true;
    await store.showPaywall('s1');
    const spy = jest.spyOn(client, 'showPaywall');
    await expect(store.showPaywall('s2')).resolves.toBe('error');
    expect(spy).not.toHaveBeenCalled();
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2), tx('tx-3', 3)] }));
    expect(repo.setSessionPass.mock.calls).toEqual([['s1', 'tx-2']]); // oldest new tx, bound once
  });

  it('a stale initial start() read does not overwrite newer listener data', async () => {
    const client = createFakeClient();
    let resolveInitial!: (s: Snapshot) => void;
    client.getSnapshot = () => new Promise<Snapshot>((r) => (resolveInitial = r));
    const store = createPaymentsStore(client, memRepo());
    store.start();
    client.emit(snap({ proActive: true }));
    resolveInitial(snap());
    await flush();
    expect(store.getSnapshot().proActive).toBe(true);
  });

  it('restored does not bind when the before snapshot is unknown', async () => {
    const client = createFakeClient();
    client.failSnapshot = true;
    const repo = memRepo();
    const store = createPaymentsStore(client, repo);
    store.start();
    await flush();
    client.nextOutcome = 'restored';
    client.snapshot = snap({ passTransactions: [tx('old')] });
    // the read before the paywall fails, the one after succeeds
    let calls = 0;
    client.getSnapshot = async () => {
      calls += 1;
      if (calls === 1) throw new Error('x');
      return client.snapshot;
    };
    await store.showPaywall('s1');
    expect(repo.setSessionPass).not.toHaveBeenCalled();
  });

  it('purchased still binds when the before snapshot is unknown', async () => {
    const client = createFakeClient();
    const repo = memRepo();
    const store = createPaymentsStore(client, repo);
    client.nextOutcome = 'purchased';
    client.snapshot = snap({ passTransactions: [tx('new', 5)] });
    let calls = 0;
    client.getSnapshot = async () => {
      calls += 1;
      if (calls === 1) throw new Error('x');
      return client.snapshot;
    };
    await store.showPaywall('s1');
    expect(repo.setSessionPass).toHaveBeenCalledWith('s1', 'new');
  });

  it('a throwing showPaywall maps to error and releases the guard', async () => {
    const { client, store } = await setup();
    client.failPaywall = true;
    await expect(store.showPaywall('s1')).resolves.toBe('error');
    client.failPaywall = false;
    client.nextOutcome = 'cancelled';
    await expect(store.showPaywall('s1')).resolves.toBe('cancelled');
  });

  it('a throwing restore resolves false', async () => {
    const { client, store } = await setup();
    client.failRestore = true;
    await expect(store.restore()).resolves.toBe(false);
  });

  it('restored with an unchanged snapshot does not capture a later purchase for another game', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'restored';
    await store.showPaywall('s1');
    client.nextOutcome = 'purchased';
    client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
    await store.showPaywall('s2');
    expect(repo.setSessionPass.mock.calls).toEqual([['s2', 'tx-2']]);
  });

  it('restored with an unchanged snapshot leaves no pending', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'restored';
    await store.showPaywall('s1');
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
    expect(repo.setSessionPass).not.toHaveBeenCalled();
  });

  it('purchased with no new transaction yet (SDK lag) stays pending until one arrives', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'purchased';
    await store.showPaywall('s1');
    expect(repo.setSessionPass).not.toHaveBeenCalled();
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
    expect(repo.setSessionPass).toHaveBeenCalledWith('s1', 'tx-2');
  });

  it('a pending from a failed read cannot capture the next game purchase (fresh pre-paywall read)', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'restored';
    client.failSnapshot = true;
    await store.showPaywall('s1');
    client.failSnapshot = false;
    client.nextOutcome = 'purchased';
    client.snapshot = snap({ passTransactions: [tx('tx-1')] });
    let calls = 0;
    const real = client.showPaywall.bind(client);
    client.showPaywall = async () => {
      calls += 1;
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
      return real();
    };
    await store.showPaywall('s2');
    expect(calls).toBe(1);
    expect(repo.setSessionPass.mock.calls).toEqual([['s2', 'tx-2']]);
  });

  it('a pending whose transaction shows in the fresh pre-paywall read binds to its own session', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'purchased';
    client.failSnapshot = true;
    await store.showPaywall('s1');
    client.failSnapshot = false;
    client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
    client.nextOutcome = 'cancelled';
    await store.showPaywall('s2');
    expect(repo.setSessionPass.mock.calls).toEqual([['s1', 'tx-2']]);
  });

  it('with a pending and the pre-paywall read failing, showPaywall returns error without opening the paywall', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'restored';
    client.failSnapshot = true;
    await store.showPaywall('s1'); // post read fails -> pending for s1
    const spy = jest.spyOn(client, 'showPaywall');
    client.nextOutcome = 'purchased';
    await expect(store.showPaywall('s2')).resolves.toBe('error');
    expect(spy).not.toHaveBeenCalled();
    expect(repo.setSessionPass).not.toHaveBeenCalled();
    // guard released and pending kept: once the network is back, the next paywall settles it first
    client.failSnapshot = false;
    client.nextOutcome = 'cancelled';
    await expect(store.showPaywall('s2')).resolves.toBe('cancelled');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a lag pending is dropped by an unchanged pre-paywall read and cannot capture the next purchase', async () => {
    const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
    client.nextOutcome = 'purchased';
    await store.showPaywall('s1'); // SDK lag: nothing new yet, pending kept
    client.nextOutcome = 'purchased';
    const real = client.showPaywall.bind(client);
    client.showPaywall = async () => {
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
      return real();
    };
    await store.showPaywall('s2');
    client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2), tx('tx-3', 3)] }));
    expect(repo.setSessionPass.mock.calls).toEqual([['s2', 'tx-2']]);
  });
});
