import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

import type {
  ReplayCameraModuleEvents,
  ReplayErrorCode,
  SaveClipOptions,
  SavedClip,
  SessionOptions,
} from '../../modules/replay-camera/src/ReplayCamera.types';
import type { Repo } from '../data/repo';
import type { Prefs, Sport, TriggerSource } from '../data/schema';
import { createTriggerBus } from '../triggers/bus';
import { initialState, reducer } from './reducer';

/** Everything the session talks to, injected so the logic runs in tests without native code. */
export type SessionDeps = {
  camera: {
    startSession(opts: SessionOptions): Promise<void>;
    stopSession(): Promise<void>;
    saveClip(opts: SaveClipOptions): Promise<SavedClip>;
    setGestureEnabled(enabled: boolean): void;
    signalSaved(opts: { sound: boolean; flash: boolean }): void;
    signalSaveFailed(opts: { sound: boolean }): void;
    addReplayListener<E extends keyof ReplayCameraModuleEvents>(
      event: E,
      listener: ReplayCameraModuleEvents[E]
    ): { remove(): void };
  };
  repo: Repo;
  deleteFile(path: string): void;
  haptic(): void;
  now(): number;
  /** Bluetooth remote: calls onPress per press while enabled (useVolumeRemote in the app). */
  useRemote(enabled: boolean, onPress: () => void): void;
};

const errorCode = (e: unknown): ReplayErrorCode =>
  ((e as { code?: ReplayErrorCode })?.code ?? 'CAMERA_UNAVAILABLE') as ReplayErrorCode;

/** One game: starts the camera, turns triggers into saved clips, and records everything in the repo. */
export function useReplaySession(deps: SessionDeps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Latest state for callbacks fired by native events; updated right after each commit.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const saving = useRef(false);
  // Which lens the native camera is running with right now (undefined = off); read synchronously by start().
  const cameraLens = useRef<Prefs['lens'] | undefined>(undefined);
  const cameraOpening = useRef<Promise<boolean> | undefined>(undefined);
  const cameraError = useRef<ReplayErrorCode | undefined>(undefined);
  const [bus] = useState(() => createTriggerBus({ now: deps.now }));

  const save = useCallback(
    async (source: TriggerSource, at: number) => {
      const sessionId = stateRef.current.sessionId;
      if (saving.current || stateRef.current.phase !== 'recording' || !sessionId) return;
      saving.current = true;
      dispatch({ type: 'saveStarted' });
      // Feedback right away: the 60s are already captured, the file just isn't written yet.
      const prefs = deps.repo.getPrefs();
      deps.camera.signalSaved({ sound: prefs.soundOnSave, flash: prefs.flashOnSave });
      try {
        const saved = await deps.camera.saveClip({ source, at });
        const clip = deps.repo.addClip({
          sessionId,
          createdAt: at,
          source,
          path: saved.clipPath,
          durationMs: saved.durationMs,
        });
        deps.haptic();
        dispatch({ type: 'saved', sessionId, clipId: clip.id, source, at });
      } catch {
        deps.camera.signalSaveFailed({ sound: prefs.soundOnSave });
        dispatch({ type: 'saveFailed', sessionId });
      } finally {
        saving.current = false;
      }
    },
    [deps]
  );

  useEffect(() => bus.subscribe((source, at) => void save(source, at)), [bus, save]);

  useEffect(() => {
    const { camera, repo, now } = deps;
    const subs = [
      camera.addReplayListener('onTrigger', (e) => void bus.fire(e.source)),
      camera.addReplayListener('onInterrupted', () => dispatch({ type: 'interrupted' })),
      camera.addReplayListener('onResumed', () => dispatch({ type: 'resumed' })),
      camera.addReplayListener('onThermalChange', (e) =>
        dispatch({ type: 'thermal', level: e.level, degraded: e.degraded })
      ),
      camera.addReplayListener('onError', (e) => {
        // The native side has already stopped; keep what was saved and end the game.
        const id = stateRef.current.sessionId;
        if (id) repo.endSession(id, now());
        dispatch({ type: 'nativeError', code: e.code, thermal: e.message === 'thermal' });
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [bus, deps]);

  const trigger = useCallback((source: TriggerSource) => void bus.fire(source), [bus]);

  deps.useRemote(state.phase === 'recording', () => trigger('remote'));

  /** Turns the camera on (setup screen) so the preview is live and the game starts instantly. Resolves true when on. */
  const prepare = useCallback(
    (lens: Prefs['lens']): Promise<boolean> => {
      if (cameraLens.current === lens) return Promise.resolve(true);
      const open = async () => {
        await cameraOpening.current;
        if (cameraLens.current === lens) return true;
        dispatch({ type: 'cameraStarting' });
        try {
          if (cameraLens.current !== undefined) {
            cameraLens.current = undefined;
            await deps.camera.stopSession();
          }
          deps.camera.setGestureEnabled(deps.repo.getPrefs().gestureEnabled);
          await deps.camera.startSession({ lens, maxQuality: '1080p60' });
          cameraLens.current = lens;
          dispatch({ type: 'cameraOn' });
          return true;
        } catch (e) {
          cameraError.current = errorCode(e);
          dispatch({ type: 'cameraFailed', code: cameraError.current });
          return false;
        }
      };
      cameraOpening.current = open();
      return cameraOpening.current;
    },
    [deps]
  );

  const start = useCallback(
    async (sport: Sport) => {
      const prefs = deps.repo.getPrefs();
      dispatch({ type: 'startRequested' });
      if (cameraLens.current === undefined && !(await prepare(prefs.lens))) {
        dispatch({ type: 'startFailed', code: cameraError.current ?? 'CAMERA_UNAVAILABLE' });
        return;
      }
      deps.camera.setGestureEnabled(prefs.gestureEnabled);
      const session = deps.repo.startSession(sport, deps.now());
      dispatch({ type: 'started', sessionId: session.id, startedAt: session.startedAt });
    },
    [deps, prepare]
  );

  const stop = useCallback(async (): Promise<string | undefined> => {
    const id = stateRef.current.sessionId;
    dispatch({ type: 'stopRequested' });
    cameraLens.current = undefined;
    await deps.camera.stopSession().catch(() => {});
    dispatch({ type: 'cameraOff' });
    if (id) deps.repo.endSession(id, deps.now());
    dispatch({ type: 'stopped' });
    return id;
  }, [deps]);

  const undoLast = useCallback(() => {
    const last = stateRef.current.lastSaved;
    if (!last) return;
    const clip = deps.repo.getClip(last.clipId);
    if (clip) deps.deleteFile(clip.path);
    deps.repo.deleteClip(last.clipId);
    dispatch({ type: 'undone', clipId: last.clipId });
  }, [deps]);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { state, prepare, start, stop, trigger, undoLast, reset };
}

export type ReplaySession = ReturnType<typeof useReplaySession>;
