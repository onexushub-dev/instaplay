import { createFakeClient } from '../fakeClient';
import { createPaymentsStore } from '../store';
import { EMPTY_SNAPSHOT, type Snapshot } from '../types';

const tx = (id: string, purchasedAt = 1) => ({ id, productId: 'single_pass', purchasedAt });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ ...EMPTY_SNAPSHOT, ...over });

function memRepo(
  sessions: Record<string, { passTransactionId?: string }> = { s1: {}, s2: {} },
  opts: { firstSessionUsed?: boolean; spent?: string[] } = {},
) {
  const spent = new Set<string>(opts.spent ?? []);
  const repo = {
    firstSessionUsed: (opts.firstSessionUsed ?? true) as boolean,
    getSession: jest.fn((id: string) => sessions[id] as any),
    setSessionPass: jest.fn((id: string, t: string) => {
      if (!sessions[id]) return undefined;
      sessions[id] = { ...sessions[id], passTransactionId: t };
      spent.add(t);
      return sessions[id] as any;
    }),
    isFirstSessionUsed: jest.fn((): boolean => repo.firstSessionUsed),
    spentPasses: jest.fn(() => new Set(spent)),
    spendPasses: jest.fn((ids: string[]) => ids.forEach((id) => spent.add(id))),
  };
  return repo;
}

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

async function setup(
  initial: Snapshot = snap(),
  sessions?: Record<string, { passTransactionId?: string }>,
  opts?: { firstSessionUsed?: boolean; spent?: string[] },
) {
  const client = createFakeClient();
  client.snapshot = initial;
  const repo = memRepo(sessions, opts);
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

  it('restored does not bind when the before snapshot is unknown, and spends what it brought', async () => {
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
    expect(repo.spentPasses().has('old')).toBe(true);
    expect(store.credits()).toBe(0);
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
    client.nextOutcome = 'purchased'; // a restore never leaves a pending any more
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

  describe('paywall without a session (Pass as credit)', () => {
    it('a purchase binds nothing and becomes a credit', async () => {
      const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }), undefined, { spent: ['tx-1'] });
      client.nextOutcome = 'purchased';
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
      const fn = jest.fn();
      store.subscribe(fn);
      await expect(store.showPaywall()).resolves.toBe('purchased');
      expect(repo.setSessionPass).not.toHaveBeenCalled();
      expect(store.credits()).toBe(1);
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'tx-2' });
      expect(fn).toHaveBeenCalled();
    });

    it('a purchase whose read after fails still notifies with the current snapshot', async () => {
      const { client, store } = await setup();
      client.nextOutcome = 'purchased';
      client.failSnapshot = true;
      const fn = jest.fn();
      store.subscribe(fn);
      await expect(store.showPaywall()).resolves.toBe('purchased');
      expect(fn).toHaveBeenCalled();
    });

    it('a purchase that shows up only after the paywall closed (SDK lag) arrives as a credit, binding nothing', async () => {
      const { client, repo, store } = await setup();
      client.nextOutcome = 'purchased';
      await store.showPaywall();
      expect(store.peekStart()).toEqual({ kind: 'free' });
      client.emit(snap({ passTransactions: [tx('tx-2', 2)] }));
      expect(repo.setSessionPass).not.toHaveBeenCalled();
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'tx-2' });
    });

    it('a second call while the first is open returns cancelled without calling the client', async () => {
      const { client, store } = await setup();
      let release!: () => void;
      client.paywallGate = new Promise<void>((r) => (release = r));
      const spy = jest.spyOn(client, 'showPaywall');
      const first = store.showPaywall();
      await expect(store.showPaywall()).resolves.toBe('cancelled');
      expect(spy).toHaveBeenCalledTimes(1);
      release();
      await first;
    });

    it('opens the default offering', async () => {
      const { client, store } = await setup();
      const spy = jest.spyOn(client, 'showPaywall');
      await store.showPaywall();
      expect(spy).toHaveBeenCalledWith();
    });
  });

  describe('credits and the start decision', () => {
    it('two credits: the oldest goes first, the count follows the ledger', async () => {
      const { repo, store } = await setup(snap({ passTransactions: [tx('tx-2', 2), tx('tx-1', 1)] }));
      expect(store.credits()).toBe(2);
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'tx-1' });
      repo.spendPasses(['tx-1']);
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'tx-2' });
      expect(store.credits()).toBe(1);
    });

    it('peekStart: Pro, then nothing is the free plan', async () => {
      const first = await setup(snap({ proActive: true }));
      expect(first.store.peekStart()).toEqual({ kind: 'pro' });
      const none = await setup();
      expect(none.store.peekStart()).toEqual({ kind: 'free' });
    });

    it('peekStart follows the listener when Pro expires', async () => {
      const { client, store } = await setup(snap({ proActive: true }));
      expect(store.peekStart()).toEqual({ kind: 'pro' });
      client.emit(snap());
      expect(store.peekStart()).toEqual({ kind: 'free' });
    });

    it('peekStart is the empty snapshot decision before any read', () => {
      const client = createFakeClient();
      const store = createPaymentsStore(client, memRepo(undefined, { firstSessionUsed: true }));
      expect(store.peekStart()).toEqual({ kind: 'free' });
      expect(store.credits()).toBe(0);
    });

    it('startDecision reads first when there is no snapshot yet', async () => {
      const client = createFakeClient();
      client.snapshot = snap({ proActive: true });
      const store = createPaymentsStore(client, memRepo());
      await expect(store.startDecision()).resolves.toEqual({ kind: 'pro' });
      expect(store.getSnapshot().proActive).toBe(true);
    });

    it('startDecision with the read failing decides with the empty snapshot and never throws', async () => {
      const client = createFakeClient();
      client.failSnapshot = true;
      const store = createPaymentsStore(client, memRepo());
      await expect(store.startDecision()).resolves.toEqual({ kind: 'free' });
    });

    it('startDecision with a snapshot and no pending decides without reading', async () => {
      const { client, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
      const spy = jest.spyOn(client, 'getSnapshot');
      await expect(store.startDecision()).resolves.toEqual({ kind: 'credit', passTransactionId: 'tx-1' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('a double tap gets the same oldest credit twice: the store never spends it itself', async () => {
      const { repo, store } = await setup(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
      const [a, b] = await Promise.all([store.startDecision(), store.startDecision()]);
      expect(a).toEqual({ kind: 'credit', passTransactionId: 'tx-1' });
      expect(b).toEqual(a);
      expect(repo.spendPasses).not.toHaveBeenCalled();
      expect(repo.setSessionPass).not.toHaveBeenCalled();
    });
  });

  describe('restore never creates a credit', () => {
    it('restore() spends the passes it brings and binds nothing', async () => {
      const { client, repo, store } = await setup();
      client.snapshot = snap({ passTransactions: [tx('old')] });
      await expect(store.restore()).resolves.toBe(false);
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.credits()).toBe(0);
      expect(store.peekStart()).toEqual({ kind: 'free' });
      expect(repo.setSessionPass).not.toHaveBeenCalled();
    });

    it('restore() spends passes delivered by the listener while it ran', async () => {
      const { client, repo, store } = await setup();
      client.restore = async () => {
        client.emit(snap({ passTransactions: [tx('old')] }));
        return client.snapshot;
      };
      await store.restore();
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.credits()).toBe(0);
    });

    it('restore() with Pro resolves true and the start decision is pro', async () => {
      const { client, store } = await setup();
      client.snapshot = snap({ proActive: true, passTransactions: [tx('old')] });
      await expect(store.restore()).resolves.toBe(true);
      expect(store.peekStart()).toEqual({ kind: 'pro' });
      expect(store.credits()).toBe(0);
    });

    it('restore() with no snapshot before and its read failing spends every unspent pass it brings', async () => {
      const client = createFakeClient();
      const repo = memRepo();
      const store = createPaymentsStore(client, repo);
      client.snapshot = snap({ passTransactions: [tx('a'), tx('b', 2)] });
      client.getSnapshot = async () => {
        throw new Error('x');
      };
      await store.restore();
      expect(repo.spendPasses).toHaveBeenCalledWith(['a', 'b']);
      expect(store.credits()).toBe(0);
    });

    it('a credit bought earlier stays a credit after a restore that brings nothing new', async () => {
      const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }));
      expect(store.credits()).toBe(1);
      await store.restore();
      expect(store.credits()).toBe(1);
      expect(repo.spentPasses().has('tx-1')).toBe(false);
      client.nextOutcome = 'restored';
      await store.showPaywall();
      expect(store.credits()).toBe(1);
    });

    it('restored from the session paywall spends the new pass and does not bind it', async () => {
      const { client, repo, store } = await setup();
      client.nextOutcome = 'restored';
      client.snapshot = snap({ passTransactions: [tx('old')] });
      await expect(store.showPaywall('s1')).resolves.toBe('restored');
      expect(repo.setSessionPass).not.toHaveBeenCalled();
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.tierFor('s1')).toBe('free');
      expect(store.credits()).toBe(0);
    });

    it('restored from the paywall without a session spends the new pass', async () => {
      const { client, repo, store } = await setup();
      client.nextOutcome = 'restored';
      client.snapshot = snap({ passTransactions: [tx('old')] });
      await store.showPaywall();
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.credits()).toBe(0);
    });

    it('restored with the read after failing spends what the listener delivered during the paywall', async () => {
      const { client, repo, store } = await setup();
      let release!: () => void;
      client.paywallGate = new Promise<void>((r) => (release = r));
      client.nextOutcome = 'restored';
      const p = store.showPaywall();
      await flush();
      client.emit(snap({ passTransactions: [tx('old')] }));
      client.failSnapshot = true;
      release();
      await p;
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.credits()).toBe(0);
    });

    it('restored from the Pro-only paywall spends passes too', async () => {
      const { client, repo, store } = await setup();
      client.nextOutcome = 'restored';
      client.snapshot = snap({ proActive: true, passTransactions: [tx('old')] });
      await store.showProPaywall();
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.tierFor()).toBe('pro');
    });

    it('a restore while a purchase waits to bind still gives that purchase to its session', async () => {
      const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }), undefined, { spent: ['tx-1'] });
      client.nextOutcome = 'purchased';
      await store.showPaywall('s1'); // SDK lag: pending for s1
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] });
      await store.restore();
      expect(repo.setSessionPass.mock.calls).toEqual([['s1', 'tx-2']]);
      expect(store.credits()).toBe(0);
    });
  });

  describe('a pending purchase is never another session credit', () => {
    async function lagging() {
      const t = await setup(snap({ passTransactions: [tx('tx-1')] }), undefined, { spent: ['tx-1'] });
      t.client.nextOutcome = 'purchased';
      await t.store.showPaywall('s1'); // SDK lag: no new transaction yet, pending for s1
      return t;
    }

    it('while pending, nothing new counts as a credit', async () => {
      const { store } = await lagging();
      expect(store.credits()).toBe(0);
      expect(store.peekStart()).toEqual({ kind: 'free' });
    });

    it('startDecision reads the fresh snapshot, binds the purchase to s1 and decides paywall', async () => {
      const { client, repo, store } = await lagging();
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }); // listener has not emitted yet
      await expect(store.startDecision()).resolves.toEqual({ kind: 'free' });
      expect(repo.setSessionPass.mock.calls).toEqual([['s1', 'tx-2']]);
      expect(repo.spentPasses().has('tx-2')).toBe(true);
      expect(store.credits()).toBe(0);
    });

    it('startDecision with the read failing still hides the purchase', async () => {
      const { client, store } = await lagging();
      client.failSnapshot = true;
      await expect(store.startDecision()).resolves.toEqual({ kind: 'free' });
    });

    it('two new passes while pending: the oldest binds to s1, the other becomes a credit', async () => {
      const { client, repo, store } = await lagging();
      client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-3', 3), tx('tx-2', 2)] }));
      expect(repo.setSessionPass.mock.calls).toEqual([['s1', 'tx-2']]);
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'tx-3' });
    });

    it('an existing credit is still usable while a purchase is pending', async () => {
      const t = await setup(snap({ passTransactions: [tx('tx-1')] }));
      t.client.nextOutcome = 'purchased';
      await t.store.showPaywall('s1');
      expect(t.store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'tx-1' });
    });
  });

  describe('a lagged purchase without a session (fix round 1)', () => {
    async function laggedCredit() {
      const t = await setup(snap({ passTransactions: [tx('tx-1')] }), undefined, { spent: ['tx-1'] });
      t.client.nextOutcome = 'purchased';
      await t.store.showPaywall(); // SDK lag: Y not in the read after
      return t;
    }

    it('a later restore() keeps it as a credit', async () => {
      const { client, store } = await laggedCredit();
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2)] });
      await store.restore();
      expect(store.credits()).toBe(1);
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'y' });
    });

    it('a later restore() whose fresh read fails still keeps it as a credit, spending only real restores', async () => {
      const { client, repo, store } = await laggedCredit();
      client.getSnapshot = async () => {
        throw new Error('x');
      };
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('old', 0), tx('y', 2)] });
      await store.restore();
      expect(store.credits()).toBe(1);
      expect(repo.spentPasses().size).toBe(2); // tx-1 + one of the two new ones
    });

    it('the restore button of the next paywall keeps it as a credit', async () => {
      const { client, store } = await laggedCredit();
      client.nextOutcome = 'restored';
      const real = client.showPaywall.bind(client);
      client.showPaywall = async () => {
        client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2)] });
        return real();
      };
      await store.showPaywall();
      expect(store.credits()).toBe(1);
    });

    it('startDecision re-reads and finds it as a credit (never sells a second Pass for one start)', async () => {
      const { client, store } = await laggedCredit();
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2)] }); // listener has not emitted
      await expect(store.startDecision()).resolves.toEqual({ kind: 'credit', passTransactionId: 'y' });
    });

    it('with the read failing, the next paywall does not open (no second charge)', async () => {
      const { client, store } = await laggedCredit();
      client.failSnapshot = true;
      await expect(store.startDecision()).resolves.toEqual({ kind: 'free' });
      const spy = jest.spyOn(client, 'showPaywall');
      await expect(store.showPaywall()).resolves.toBe('error');
      expect(spy).not.toHaveBeenCalled();
    });

    it.each([
      ['cancelled', false],
      ['error', true],
    ] as const)('a next paywall that ends %s (pre-read dropped the marker) gives it back: a later restore keeps it', async (outcome, crash) => {
      const { client, repo, store } = await laggedCredit();
      client.nextOutcome = outcome;
      client.failPaywall = crash;
      await expect(store.showPaywall()).resolves.toBe(outcome); // pre-read succeeds without Y
      client.failPaywall = false;
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2)] });
      await store.restore();
      expect(store.credits()).toBe(1);
      expect(repo.spentPasses().has('y')).toBe(false);
    });

    it('a cancelled session paywall gives a dropped session pending back: its Pass still binds to s1', async () => {
      const { client, repo, store } = await setup(snap({ passTransactions: [tx('tx-1')] }), undefined, { spent: ['tx-1'] });
      client.nextOutcome = 'purchased';
      await store.showPaywall('s1'); // lag: pending for s1
      client.nextOutcome = 'cancelled';
      await store.showPaywall('s2'); // pre-read without the pass, then cancelled
      client.emit(snap({ passTransactions: [tx('tx-1'), tx('tx-2', 2)] }));
      expect(repo.setSessionPass.mock.calls).toEqual([['s1', 'tx-2']]);
      expect(store.credits()).toBe(0);
    });

    it('a given-back marker whose Pass already arrived during the paywall is explained at once', async () => {
      const { client, repo, store } = await laggedCredit();
      let release!: () => void;
      client.paywallGate = new Promise<void>((r) => (release = r));
      client.nextOutcome = 'cancelled';
      const p = store.showPaywall();
      await flush();
      client.emit(snap({ passTransactions: [tx('tx-1'), tx('y', 2)] }));
      release();
      await p;
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'y' });
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2), tx('old', 0)] });
      await store.restore();
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.credits()).toBe(1);
    });

    it('a restore in the next paywall that explains the dropped marker does not give it back', async () => {
      const { client, store } = await laggedCredit();
      client.nextOutcome = 'restored';
      const real = client.showPaywall.bind(client);
      client.showPaywall = async () => {
        client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2)] });
        return real();
      };
      await store.showPaywall();
      const spy = jest.spyOn(client, 'getSnapshot');
      await expect(store.startDecision()).resolves.toEqual({ kind: 'credit', passTransactionId: 'y' });
      expect(spy).not.toHaveBeenCalled(); // no marker left: no re-read
    });

    it('showProPaywall maps a throwing pre-read apply to error and releases the guard', async () => {
      const { client, repo, store } = await laggedCredit();
      repo.spentPasses.mockImplementation(() => {
        throw new Error('storage');
      });
      const spy = jest.spyOn(client, 'showPaywall');
      await expect(store.showProPaywall()).resolves.toBe('error');
      expect(spy).not.toHaveBeenCalled();
      repo.spentPasses.mockImplementation(() => new Set(['tx-1']));
      client.nextOutcome = 'cancelled';
      await expect(store.showProPaywall()).resolves.toBe('cancelled');
    });

    it('the listener explaining it clears the marker: a later restore spends only new passes', async () => {
      const { client, repo, store } = await laggedCredit();
      client.emit(snap({ passTransactions: [tx('tx-1'), tx('y', 2)] }));
      client.snapshot = snap({ passTransactions: [tx('tx-1'), tx('y', 2), tx('old', 0)] });
      await store.restore();
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.peekStart()).toEqual({ kind: 'credit', passTransactionId: 'y' });
    });
  });

  describe('restore with no snapshot yet (fix round 1)', () => {
    function cold(initial: Snapshot) {
      const client = createFakeClient();
      client.snapshot = initial;
      const repo = memRepo();
      const store = createPaymentsStore(client, repo); // start() not called: no snapshot yet
      return { client, repo, store };
    }

    it('restore() reads first so an old unused credit is not spent', async () => {
      const { client, repo, store } = cold(snap({ passTransactions: [tx('credit')] }));
      const real = client.restore.bind(client);
      client.restore = async () => {
        client.snapshot = snap({ passTransactions: [tx('credit'), tx('old', 0)] });
        return real();
      };
      await store.restore();
      expect(repo.spentPasses().has('credit')).toBe(false);
      expect(repo.spentPasses().has('old')).toBe(true);
      expect(store.credits()).toBe(1);
    });

    it('showProPaywall restored reads first so an old unused credit is not spent', async () => {
      const { client, repo, store } = cold(snap({ passTransactions: [tx('credit')] }));
      client.nextOutcome = 'restored';
      await store.showProPaywall();
      expect(repo.spentPasses().has('credit')).toBe(false);
      expect(store.credits()).toBe(1);
    });

    it('restore() falls back to spending every unspent pass only when that read fails', async () => {
      const { client, repo, store } = cold(snap({ passTransactions: [tx('a')] }));
      client.getSnapshot = async () => {
        throw new Error('x');
      };
      await store.restore();
      expect(repo.spentPasses().has('a')).toBe(true);
    });
  });

  describe('sync reads never throw (fix round 1)', () => {
    it('peekStart falls back to paywall and credits to 0 when the repo throws', async () => {
      const { repo, store } = await setup(snap({ passTransactions: [tx('a')] }));
      repo.spentPasses.mockImplementation(() => {
        throw new Error('storage');
      });
      expect(store.peekStart()).toEqual({ kind: 'free' });
      expect(store.credits()).toBe(0);
    });
  });

  describe('showProPaywall', () => {
    it('opens the Pro-only offering, never the default one', async () => {
      const { client, store } = await setup();
      const spy = jest.spyOn(client, 'showPaywall');
      await expect(store.showProPaywall()).resolves.toBe('cancelled');
      expect(spy).toHaveBeenCalledWith('pro_only');
    });

    it('a Pro purchase updates the global tier and binds no pass', async () => {
      const { client, repo, store } = await setup();
      client.nextOutcome = 'purchased';
      client.snapshot = snap({ proActive: true });
      await expect(store.showProPaywall()).resolves.toBe('purchased');
      expect(store.tierFor()).toBe('pro');
      expect(repo.setSessionPass).not.toHaveBeenCalled();
    });

    it('the listener alone also turns the tier to Pro', async () => {
      const { client, store } = await setup();
      client.emit(snap({ proActive: true }));
      expect(store.tierFor()).toBe('pro');
    });

    it('a throwing paywall maps to error and releases the guard', async () => {
      const { client, store } = await setup();
      client.failPaywall = true;
      await expect(store.showProPaywall()).resolves.toBe('error');
      client.failPaywall = false;
      await expect(store.showProPaywall()).resolves.toBe('cancelled');
    });

    it('does not open over another paywall', async () => {
      const { client, store } = await setup();
      let release!: () => void;
      client.paywallGate = new Promise<void>((r) => (release = r));
      const first = store.showPaywall('s1');
      await expect(store.showProPaywall()).resolves.toBe('cancelled');
      release();
      await first;
    });
  });
});
