import { act, renderHook } from '@testing-library/react-native';

import { createRepo, type KV } from '../../data/repo';
import { type SessionDeps, useReplaySession } from '../useReplaySession';

type Listener = (e: any) => void;

function fakeDeps() {
  const listeners = new Map<string, Listener>();
  const map = new Map<string, string>();
  const kv: KV = { getString: (k) => map.get(k), set: (k, v) => void map.set(k, v), delete: (k) => void map.delete(k) };
  let n = 0;
  let t = 1000;
  const deleted: string[] = [];
  let pendingSave: ((v: { clipPath: string; durationMs: number }) => void) | undefined;
  const camera = {
    startSession: jest.fn(async () => {}),
    stopSession: jest.fn(async () => {}),
    saveClip: jest.fn(
      () => new Promise<{ clipPath: string; durationMs: number }>((resolve) => (pendingSave = resolve))
    ),
    setGestureEnabled: jest.fn(),
    signalSaved: jest.fn(),
    setVoiceEnabled: jest.fn(),
    getSpeechPermission: jest.fn((): 'granted' | 'denied' | 'undetermined' => 'granted'),
    watchSync: jest.fn(),
    watchSignal: jest.fn(),
    remoteSync: jest.fn(),
    remoteSignal: jest.fn(),
    signalSaveFailed: jest.fn(),
    addReplayListener: jest.fn((event: string, fn: Listener) => {
      listeners.set(event, fn);
      return { remove: () => listeners.delete(event) };
    }),
  };
  const deps: SessionDeps = {
    camera,
    repo: createRepo(kv, { exists: () => true, sizeBytes: () => 1 }, () => `id-${++n}`),
    deleteFile: (p) => void deleted.push(p),
    haptic: jest.fn(),
    now: () => t,
    useRemote: () => {},
  };
  return {
    deps,
    camera,
    deleted,
    emit: (event: string, e: any = {}) => listeners.get(event)?.(e),
    advance: (ms: number) => void (t += ms),
    finishSave: (v = { clipPath: '/c.mp4', durationMs: 60000 }) => pendingSave?.(v),
  };
}

async function started() {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.start('futevolei'));
  return { ...f, view };
}

test('trigger saves a clip and records it in the repo', async () => {
  const { view, camera, deps, finishSave } = await started();

  await act(async () => view.result.current.trigger('screen'));
  expect(camera.saveClip).toHaveBeenCalledWith({ source: 'screen', at: 1000 });
  await act(async () => finishSave());

  const sessionId = view.result.current.state.sessionId!;
  expect(deps.repo.listClips(sessionId)).toMatchObject([{ source: 'screen', path: '/c.mp4', durationMs: 60000 }]);
  expect(view.result.current.state).toMatchObject({ clipCount: 1, lastSaved: { number: 1, source: 'screen' } });
});

test('ignores trigger while saving', async () => {
  const { view, camera, advance } = await started();

  await act(async () => view.result.current.trigger('screen'));
  advance(3500); // past the bus debounce, but the first save hasn't finished
  await act(async () => view.result.current.trigger('remote'));

  expect(camera.saveClip).toHaveBeenCalledTimes(1);
});

test('native onTrigger goes through the bus', async () => {
  const { view, camera, emit, finishSave } = await started();

  await act(async () => emit('onTrigger', { source: 'gesture', at: 1 }));
  await act(async () => finishSave());

  expect(camera.saveClip).toHaveBeenCalledWith({ source: 'gesture', at: 1000 });
  expect(view.result.current.state.lastSaved?.source).toBe('gesture');
});

test('undoLast deletes the clip file and the record', async () => {
  const { view, deps, deleted, finishSave } = await started();
  await act(async () => view.result.current.trigger('screen'));
  await act(async () => finishSave());

  await act(async () => view.result.current.undoLast());

  expect(deleted).toEqual(['/c.mp4']);
  expect(deps.repo.listClips(view.result.current.state.sessionId!)).toEqual([]);
  expect(view.result.current.state.clipCount).toBe(0);
});

test('stop ends the repo session and returns its id', async () => {
  const { view, deps, advance } = await started();
  advance(60_000);

  let id: string | undefined;
  await act(async () => {
    id = await view.result.current.stop();
  });

  expect(id).toBe(view.result.current.state.sessionId);
  expect(deps.repo.getSession(id!)?.endedAt).toBe(61_000);
  expect(view.result.current.state.phase).toBe('ended');
});

test('start failure returns to idle with the error code', async () => {
  const f = fakeDeps();
  f.camera.startSession.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'LOW_STORAGE' }));
  const view = await renderHook(() => useReplaySession(f.deps));

  await act(() => view.result.current.start('beachTennis'));

  expect(view.result.current.state).toMatchObject({ phase: 'idle', error: 'LOW_STORAGE' });
});

test('native error ends the session in the repo and keeps the clip count', async () => {
  const { view, deps, emit } = await started();

  await act(async () => emit('onError', { code: 'ENCODER_FAILED', message: 'thermal' }));

  const id = view.result.current.state.sessionId!;
  expect(view.result.current.state).toMatchObject({ phase: 'ended', thermalStop: true });
  expect(deps.repo.getSession(id)?.endedAt).toBeDefined();
});

test('prepare turns the camera on so starting the game is immediate', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));

  await act(() => view.result.current.prepare('beachTennis'));
  expect(f.camera.startSession).toHaveBeenCalledTimes(1);
  expect(view.result.current.state.camera).toBe('on');

  await act(() => view.result.current.start('outro'));
  expect(f.camera.startSession).toHaveBeenCalledTimes(1);
  expect(view.result.current.state.phase).toBe('recording');
});

test('prepare opens the camera with the mode\'s lens, quality and buffer', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.prepare('musculacao'));
  expect(f.camera.startSession).toHaveBeenLastCalledWith({ lens: 'wide', maxQuality: '1080p30', bufferSeconds: 120 });
});

test('switching mode reapplies lens, buffer and triggers', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.prepare('beachTennis'));
  await act(() => view.result.current.prepare('musculacao'));

  expect(f.camera.stopSession).toHaveBeenCalledTimes(1);
  expect(f.camera.startSession).toHaveBeenLastCalledWith({ lens: 'wide', maxQuality: '1080p30', bufferSeconds: 120 });

  await act(() => view.result.current.start('musculacao'));
  expect(f.camera.setGestureEnabled).toHaveBeenLastCalledWith(false);
  expect(f.camera.setVoiceEnabled).toHaveBeenLastCalledWith(true);
});

test('a lens change saved for the mode reopens the camera', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.prepare('quadra'));
  f.deps.repo.setPrefs({ modeSettings: { quadra: { lens: 'wide' } } });
  await act(() => view.result.current.prepare('quadra'));
  expect(f.camera.startSession).toHaveBeenLastCalledWith({ lens: 'wide', maxQuality: '1080p60', bufferSeconds: 60 });
});

test('a camera that fails to open reports its code before any game starts', async () => {
  const f = fakeDeps();
  f.camera.startSession.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'CAMERA_PERMISSION' }));
  const view = await renderHook(() => useReplaySession(f.deps));

  await act(() => view.result.current.prepare('beachTennis'));

  expect(view.result.current.state).toMatchObject({ camera: 'off', error: 'CAMERA_PERMISSION', phase: 'idle' });
});

test('stop turns the camera off', async () => {
  const { view, camera } = await started();
  await act(async () => {
    await view.result.current.stop();
  });
  expect(camera.stopSession).toHaveBeenCalled();
  expect(view.result.current.state.camera).toBe('off');
});

test('signals the save the moment the trigger is accepted, before the file is ready', async () => {
  const { view, camera } = await started();

  await act(async () => view.result.current.trigger('gesture'));

  expect(camera.signalSaved).toHaveBeenCalledWith({ sound: true, flash: true });
  expect(camera.saveClip).toHaveBeenCalled(); // still pending
});

test('respects the sound and flash preferences', async () => {
  const { view, camera, deps } = await started();
  deps.repo.setPrefs({ soundOnSave: false, flashOnSave: true });

  await act(async () => view.result.current.trigger('screen'));

  expect(camera.signalSaved).toHaveBeenCalledWith({ sound: false, flash: true });
});

test('a failed save plays the failure signal', async () => {
  const { view, camera } = await started();
  camera.saveClip.mockRejectedValueOnce(new Error('x'));

  await act(async () => view.result.current.trigger('screen'));

  expect(camera.signalSaveFailed).toHaveBeenCalledWith({ sound: true });
});

test('starting a game applies the voice preference', async () => {
  const f = fakeDeps();
  f.deps.repo.setPrefs({ voiceEnabled: true });
  const view = await renderHook(() => useReplaySession(f.deps));

  await act(() => view.result.current.start('beachTennis'));

  expect(f.camera.setVoiceEnabled).toHaveBeenLastCalledWith(true);
});

test('after a native error the camera is reopened for the next game', async () => {
  const { view, camera, emit } = await started();
  await act(async () => emit('onError', { code: 'ENCODER_FAILED', message: 'thermal' }));
  await act(async () => view.result.current.reset());

  await act(() => view.result.current.prepare('beachTennis'));

  expect(camera.startSession).toHaveBeenCalledTimes(2);
});

test('the gesture only runs during the game, not while positioning', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));

  await act(() => view.result.current.prepare('beachTennis'));
  expect(f.camera.setGestureEnabled).toHaveBeenLastCalledWith(false);

  await act(() => view.result.current.start('beachTennis'));
  expect(f.camera.setGestureEnabled).toHaveBeenLastCalledWith(true);
});

test('release turns the camera off while idle, but never during a game', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.prepare('beachTennis'));
  await act(() => view.result.current.release());
  expect(f.camera.stopSession).toHaveBeenCalledTimes(1);
  expect(view.result.current.state.camera).toBe('off');

  await act(() => view.result.current.start('beachTennis'));
  await act(() => view.result.current.release());
  expect(f.camera.stopSession).toHaveBeenCalledTimes(1);
});

test("saved clips get the mode's default cut", async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.start('musculacao'));
  await act(async () => view.result.current.trigger('screen'));
  await act(async () => f.finishSave({ clipPath: '/g.mp4', durationMs: 120000 }));
  const [clip] = f.deps.repo.listClips(view.result.current.state.sessionId!);
  expect(clip.trim).toEqual({ startMs: 60000, endMs: 120000 });
});

test('voice stays off natively when the phone may not listen', async () => {
  const f = fakeDeps();
  f.camera.getSpeechPermission.mockReturnValue('denied');
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(() => view.result.current.start('musculacao'));
  expect(f.camera.setVoiceEnabled).toHaveBeenLastCalledWith(false);
});

test('starting a recording tells the watch', async () => {
  const { camera } = await started();
  expect(camera.watchSync).toHaveBeenLastCalledWith({ recording: true, clipCount: 0, startedAt: 1000 });
});

test('a saved clip syncs the new count and signals success', async () => {
  const { view, camera, finishSave } = await started();
  await act(async () => view.result.current.trigger('watch'));
  await act(async () => finishSave());
  expect(camera.watchSync).toHaveBeenLastCalledWith({ recording: true, clipCount: 1, startedAt: 1000 });
  expect(camera.watchSignal).toHaveBeenCalledTimes(1);
  expect(camera.watchSignal).toHaveBeenCalledWith(true);
});

test('a failed save signals failure and leaves the count', async () => {
  const { view, camera } = await started();
  camera.saveClip.mockRejectedValueOnce(new Error('x'));
  await act(async () => view.result.current.trigger('watch'));
  expect(camera.watchSignal).toHaveBeenCalledWith(false);
  expect(camera.watchSync).toHaveBeenLastCalledWith({ recording: true, clipCount: 0, startedAt: 1000 });
});

test('a second watch tap inside the debounce gives one save and one haptic', async () => {
  const { view, camera, emit, advance, finishSave } = await started();
  await act(async () => emit('onTrigger', { source: 'watch', at: 1 }));
  await act(async () => finishSave());
  advance(500);
  await act(async () => emit('onTrigger', { source: 'watch', at: 2 }));
  expect(camera.saveClip).toHaveBeenCalledTimes(1);
  expect(camera.watchSignal).toHaveBeenCalledTimes(1);
  expect(view.result.current.state.clipCount).toBe(1);
});

test('undo syncs the lower count without a signal', async () => {
  const { view, camera, finishSave } = await started();
  await act(async () => view.result.current.trigger('watch'));
  await act(async () => finishSave());
  camera.watchSignal.mockClear();
  await act(async () => view.result.current.undoLast());
  expect(camera.watchSync).toHaveBeenLastCalledWith({ recording: true, clipCount: 0, startedAt: 1000 });
  expect(camera.watchSignal).not.toHaveBeenCalled();
});

test('stopping sends an idle state', async () => {
  const { view, camera, finishSave } = await started();
  await act(async () => view.result.current.trigger('watch'));
  await act(async () => finishSave());
  await act(async () => {
    await view.result.current.stop();
  });
  expect(camera.watchSync).toHaveBeenLastCalledWith({ recording: false, clipCount: 0 });
});

test('a native stop (thermal) also sends an idle state', async () => {
  const { camera, emit } = await started();
  await act(async () => emit('onError', { code: 'ENCODER_FAILED', message: 'thermal' }));
  expect(camera.watchSync).toHaveBeenLastCalledWith({ recording: false, clipCount: 0 });
});

test('a watch tap outside a recording is ignored', async () => {
  const f = fakeDeps();
  await renderHook(() => useReplaySession(f.deps));
  await act(async () => f.emit('onTrigger', { source: 'watch', at: 1 }));
  expect(f.camera.saveClip).not.toHaveBeenCalled();
  expect(f.camera.watchSignal).not.toHaveBeenCalled();
});

test('a watch tap outside a recording does not use up the 3 s debounce of the first real tap', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(async () => f.emit('onTrigger', { source: 'watch', at: 1 })); // stale watch screen, nothing recording
  await act(() => view.result.current.start('quadra'));
  await act(async () => view.result.current.trigger('screen')); // same instant
  expect(f.camera.saveClip).toHaveBeenCalledTimes(1);
});

test('a tap on the remote phone saves a clip with the phone as source', async () => {
  const { view, camera, emit, finishSave } = await started();
  await act(async () => emit('onTrigger', { source: 'phone', at: 1 }));
  await act(async () => finishSave());
  expect(camera.saveClip).toHaveBeenCalledWith({ source: 'phone', at: 1000 });
  expect(view.result.current.state.lastSaved?.source).toBe('phone');
});

test('two phone taps inside the debounce give one save', async () => {
  const { camera, emit, advance, finishSave } = await started();
  await act(async () => emit('onTrigger', { source: 'phone', at: 1 }));
  await act(async () => finishSave());
  advance(500);
  await act(async () => emit('onTrigger', { source: 'phone', at: 2 }));
  expect(camera.saveClip).toHaveBeenCalledTimes(1);
  expect(camera.remoteSignal).toHaveBeenCalledTimes(1);
});

test('a phone tap outside a recording is ignored and does not use up the debounce', async () => {
  const f = fakeDeps();
  const view = await renderHook(() => useReplaySession(f.deps));
  await act(async () => f.emit('onTrigger', { source: 'phone', at: 1 }));
  expect(f.camera.saveClip).not.toHaveBeenCalled();
  expect(f.camera.remoteSignal).not.toHaveBeenCalled();
  await act(() => view.result.current.start('quadra'));
  await act(async () => view.result.current.trigger('screen'));
  expect(f.camera.saveClip).toHaveBeenCalledTimes(1);
});

test('the remote phone gets the same state as the watch', async () => {
  const { view, camera, finishSave } = await started();
  expect(camera.remoteSync).toHaveBeenLastCalledWith({ recording: true, clipCount: 0, startedAt: 1000 });
  await act(async () => view.result.current.trigger('screen'));
  await act(async () => finishSave());
  expect(camera.remoteSync).toHaveBeenLastCalledWith({ recording: true, clipCount: 1, startedAt: 1000 });
  await act(async () => {
    await view.result.current.stop();
  });
  expect(camera.remoteSync).toHaveBeenLastCalledWith({ recording: false, clipCount: 0 });
});

test('the remote phone is told how a save ended', async () => {
  const ok = await started();
  await act(async () => ok.view.result.current.trigger('screen'));
  await act(async () => ok.finishSave());
  expect(ok.camera.remoteSignal).toHaveBeenCalledWith(true);

  const bad = await started();
  bad.camera.saveClip.mockRejectedValueOnce(new Error('x'));
  await act(async () => bad.view.result.current.trigger('screen'));
  expect(bad.camera.remoteSignal).toHaveBeenCalledWith(false);
});
