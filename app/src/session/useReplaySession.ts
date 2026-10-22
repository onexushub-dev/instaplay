import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

import type {
  ReplayCameraModuleEvents,
  ReplayErrorCode,
  SaveClipOptions,
  SavedClip,
  SessionOptions,
  VoiceLocale,
  ZoomRange,
} from '../../modules/replay-camera/src/ReplayCamera.types';
import type { Repo } from '../data/repo';
import type { ModeId, Sport, TriggerSource } from '../data/schema';
import { type AppLocale, voiceLocale } from '../i18n/locale';
import { shouldLockOnSave } from '../payments/rules';
import { FREE_CLIPS, type StartDecision, type Tier } from '../payments/types';
import { effectiveSettings } from '../modes/registry';
import { clampZoom, lensFor } from '../modes/zoom';
import { createTriggerBus } from '../triggers/bus';
import { initialState, reducer } from './reducer';

/** Everything the session talks to, injected so the logic runs in tests without native code. */
export type SessionDeps = {
  camera: {
    startSession(opts: SessionOptions): Promise<void>;
    stopSession(): Promise<void>;
    saveClip(opts: SaveClipOptions): Promise<SavedClip>;
    setGestureEnabled(enabled: boolean): void;
    getZoomRange(): ZoomRange;
    setZoom(factor: number, animated: boolean): void;
    setVoiceEnabled(enabled: boolean, locale: VoiceLocale): void;
    watchSync(state: { recording: boolean; clipCount: number; startedAt?: number }): void;
    watchSignal(saved: boolean): void;
    remoteSync(state: { recording: boolean; clipCount: number; startedAt?: number }): void;
    remoteSignal(saved: boolean): void;
    getSpeechPermission(): 'granted' | 'denied' | 'undetermined';
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
  /** The app's language now: the voice command listens in it. */
  locale(): AppLocale;
  /** Whether a game may start now: the first is free, then Pro or a Pass credit. */
  startDecision: () => Promise<StartDecision>;
  /** The tier that applies to this game right now (free, pass or pro). */
  tierFor: (sessionId: string) => Tier;
  /** Bluetooth remote: calls onPress per press while enabled (useVolumeRemote in the app). */
  useRemote(enabled: boolean, onPress: () => void): void;
};

export type StartResult = 'started' | 'needsPayment' | 'failed' | 'busy';

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
  // The camera configuration currently open, undefined when off; read synchronously by start().
  // Continuous zoom (iOS): "quality|buffer", the zoom is changed live. Two fixed lenses (Android): "lens|quality|buffer".
  const cameraLens = useRef<string | undefined>(undefined);
  // The zoom the running camera was last given, so the same zoom is never sent twice (a repeat would cut a smooth ramp short).
  const zoomApplied = useRef<number | undefined>(undefined);
  const cameraOpening = useRef<Promise<boolean> | undefined>(undefined);
  const cameraError = useRef<ReplayErrorCode | undefined>(undefined);
  // The mode of the game being played: its default cut applies to every saved clip.
  const gameMode = useRef<ModeId>('beachTennis');
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
        // The limit never interrupts the game: past the free clips the clip is kept, just locked.
        const tier = deps.tierFor(sessionId);
        const unlocked = deps.repo.unlockedClipCount(sessionId);
        const locked = shouldLockOnSave(tier, unlocked);
        const lastFree = tier === 'free' && !locked && unlocked + 1 === FREE_CLIPS;
        const clip = deps.repo.addClip({
          sessionId,
          createdAt: at,
          source,
          path: saved.clipPath,
          durationMs: saved.durationMs,
          ...(locked ? { locked: true } : {}),
        }, effectiveSettings(gameMode.current, deps.repo.getPrefs()).cutSeconds * 1000);
        deps.haptic();
        dispatch({ type: 'saved', sessionId, clipId: clip.id, source, at, locked, lastFree });
        deps.camera.watchSignal(true);
        deps.camera.remoteSignal(true);
      } catch {
        deps.camera.signalSaveFailed({ sound: prefs.soundOnSave });
        deps.camera.watchSignal(false);
        deps.camera.remoteSignal(false);
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
      camera.addReplayListener('onTrigger', (e) => {
        // Outside a recording a tap saves nothing, so it must not use up the debounce of a real one.
        if (stateRef.current.phase === 'recording') void bus.fire(e.source);
      }),
      camera.addReplayListener('onInterrupted', () => dispatch({ type: 'interrupted' })),
      camera.addReplayListener('onResumed', () => dispatch({ type: 'resumed' })),
      camera.addReplayListener('onThermalChange', (e) =>
        dispatch({ type: 'thermal', level: e.level, degraded: e.degraded })
      ),
      camera.addReplayListener('onError', (e) => {
        // The native side has already stopped; keep what was saved and end the game.
        // Forget the camera too, so the next prepare() really reopens it.
        cameraLens.current = undefined;
        cameraOpening.current = undefined;
        dispatch({ type: 'cameraOff' });
        const id = stateRef.current.sessionId;
        if (id) repo.endSession(id, now());
        dispatch({ type: 'nativeError', code: e.code, thermal: e.message === 'thermal' });
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [bus, deps]);

  // The watch and the remote phone show what this phone shows: the clock and count while recording, idle otherwise.
  const recording = state.phase === 'recording';
  useEffect(() => {
    const shown = recording
      ? { recording, clipCount: state.clipCount, startedAt: state.startedAt }
      : { recording, clipCount: 0 };
    deps.camera.watchSync(shown);
    deps.camera.remoteSync(shown);
  }, [deps, recording, state.clipCount, state.startedAt]);

  const trigger = useCallback((source: TriggerSource) => void bus.fire(source), [bus]);

  deps.useRemote(state.phase === 'recording', () => trigger('remote'));

  /**
   * Turns the camera on for `mode` (setup screen) so the preview is live and the game starts instantly.
   * Reopens it when the mode's quality or buffer differ from what is open (and, with two fixed lenses, its lens);
   * with continuous zoom a different zoom is applied to the running camera instead. Resolves true when on.
   */
  const prepare = useCallback(
    (mode: ModeId): Promise<boolean> => {
      const settings = effectiveSettings(mode, deps.repo.getPrefs());
      const { quality, bufferSeconds } = settings;
      const range = deps.camera.getZoomRange();
      const zoom = clampZoom(settings.zoom, range);
      const lens = lensFor(zoom);
      const key = range.continuous ? `${quality}|${bufferSeconds}` : `${lens}|${quality}|${bufferSeconds}`;
      if (cameraLens.current === key) {
        if (range.continuous && zoomApplied.current !== zoom) {
          zoomApplied.current = zoom;
          deps.camera.setZoom(zoom, false);
        }
        return Promise.resolve(true);
      }
      const open = async () => {
        await cameraOpening.current;
        if (cameraLens.current === key) return true;
        dispatch({ type: 'cameraStarting' });
        try {
          if (cameraLens.current !== undefined) {
            cameraLens.current = undefined;
            await deps.camera.stopSession();
          }
          // Body-pose detection is heavy: it only runs once the game starts.
          deps.camera.setGestureEnabled(false);
          await deps.camera.startSession({ lens, zoom, maxQuality: quality, bufferSeconds });
          cameraLens.current = key;
          zoomApplied.current = zoom;
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

  const startingRef = useRef(false);
  const start = useCallback(
    async (sport: Sport): Promise<StartResult> => {
      const phase = stateRef.current.phase;
      if (startingRef.current || phase === 'starting' || phase === 'recording' || phase === 'stopping') return 'busy';
      startingRef.current = true;
      try {
        // Payment is settled before the camera work: nothing paid is ever asked once recording.
        // A decision that cannot be read fails safe: no game starts and nothing was touched.
        let first: StartDecision;
        try {
          first = await deps.startDecision();
        } catch {
          return 'needsPayment';
        }
        if (first.kind === 'paywall') return 'needsPayment';
        dispatch({ type: 'startRequested' });
        try {
          if (!(await prepare(sport))) {
            dispatch({ type: 'startFailed', code: cameraError.current ?? 'CAMERA_UNAVAILABLE' });
            return 'failed';
          }
          // The tier can change while the camera opens (Pro lapsing, a credit spent elsewhere): this check decides.
          const decision = await deps.startDecision();
          if (decision.kind === 'paywall') {
            dispatch({ type: 'startBlocked' });
            return 'needsPayment';
          }
          gameMode.current = sport;
          // The write comes first: if it throws, no gesture or voice toggle was left on without a session.
          const session = deps.repo.startSession(
            sport,
            deps.now(),
            decision.kind === 'credit' ? decision.passTransactionId : undefined,
          );
          const settings = effectiveSettings(sport, deps.repo.getPrefs());
          deps.camera.setGestureEnabled(settings.gestureEnabled);
          // Listen only when the phone may: native and the setup tile must agree on whether voice is on.
          deps.camera.setVoiceEnabled(
            settings.voiceEnabled && deps.camera.getSpeechPermission() === 'granted',
            voiceLocale(deps.locale()),
          );
          dispatch({ type: 'started', sessionId: session.id, startedAt: session.startedAt });
          // Visible to a second start() before React commits.
          stateRef.current = { ...stateRef.current, phase: 'recording' };
          return 'started';
        } catch (e) {
          dispatch({ type: 'startFailed', code: errorCode(e) });
          return 'failed';
        }
      } finally {
        startingRef.current = false;
      }
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

  /** Turns the camera off when no game is running (e.g. the setup screen is under another screen). */
  const release = useCallback(async () => {
    const phase = stateRef.current.phase;
    if (cameraLens.current === undefined || phase === 'recording' || phase === 'starting' || phase === 'stopping') return;
    cameraLens.current = undefined;
    cameraOpening.current = undefined;
    await deps.camera.stopSession().catch(() => {});
    dispatch({ type: 'cameraOff' });
  }, [deps]);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  /** Zooms the running camera (setup screen only; the zoom is locked while recording). `animated` is for a button tap. */
  const setZoom = useCallback(
    (zoom: number, animated: boolean) => {
      zoomApplied.current = zoom;
      deps.camera.setZoom(zoom, animated);
    },
    [deps],
  );

  return { state, prepare, release, start, stop, trigger, undoLast, reset, setZoom };
}

export type ReplaySession = ReturnType<typeof useReplaySession>;
