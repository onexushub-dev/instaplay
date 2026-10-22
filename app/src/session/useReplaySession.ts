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
import { captureConfig, triggerAllowed } from '../payments/limits';
import { planOf } from '../payments/rules';
import type { Plan, StartDecision } from '../payments/types';
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
  /** How the next game starts: Pro, a Single Pass credit, one of the month's free recordings, or blocked. */
  startDecision: () => Promise<StartDecision>;
  /** Bluetooth remote: calls onPress per press while enabled (useVolumeRemote in the app). */
  useRemote(enabled: boolean, onPress: () => void): void;
};

export type StartResult = 'started' | 'blocked' | 'failed' | 'busy';

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
  // Continuous zoom (iOS): "quality|buffer|audio", the zoom is changed live. Two fixed lenses (Android): "lens|quality|buffer|audio".
  const cameraLens = useRef<string | undefined>(undefined);
  // The zoom the running camera was last given, so the same zoom is never sent twice (a repeat would cut a smooth ramp short).
  const zoomApplied = useRef<number | undefined>(undefined);
  const cameraOpening = useRef<Promise<boolean> | undefined>(undefined);
  const cameraError = useRef<ReplayErrorCode | undefined>(undefined);
  // The running game's cut, fixed at its start by its plan (15 s at most on the free plan): applies to every saved clip.
  const cutSeconds = useRef(0);
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
        }, cutSeconds.current * 1000);
        deps.haptic();
        dispatch({ type: 'saved', sessionId, clipId: clip.id, source, at });
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

  // The Bluetooth remote is paid: only a paid game turns it on.
  deps.useRemote(
    state.phase === 'recording' && triggerAllowed('remote', state.paid ? 'paid' : 'free'),
    () => trigger('remote'),
  );

  /**
   * Turns the camera on for `mode` with what `plan` allows (the free plan: HD, no sound, 15 s).
   * Reopens it when the quality, buffer or sound differ from what is open (and, with two fixed lenses, its lens);
   * with continuous zoom a different zoom is applied to the running camera instead. Resolves true when on.
   */
  const openCamera = useCallback(
    (mode: ModeId, plan: Plan): Promise<boolean> => {
      const settings = effectiveSettings(mode, deps.repo.getPrefs());
      const { quality, bufferSeconds, audio } = captureConfig(settings, plan);
      const range = deps.camera.getZoomRange();
      const zoom = clampZoom(settings.zoom, range);
      const lens = lensFor(zoom);
      const key = range.continuous
        ? `${quality}|${bufferSeconds}|${audio}`
        : `${lens}|${quality}|${bufferSeconds}|${audio}`;
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
          await deps.camera.startSession({ lens, zoom, maxQuality: quality, bufferSeconds, audio });
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

  /**
   * The setup screen's live preview for `mode` on `plan`, so the game starts instantly. Never touches a camera a game
   * is starting, recording or stopping with (a plan change notified meanwhile must not reopen it): resolves true.
   */
  const prepare = useCallback(
    (mode: ModeId, plan: Plan): Promise<boolean> => {
      const phase = stateRef.current.phase;
      if (phase === 'starting' || phase === 'recording' || phase === 'stopping') return Promise.resolve(true);
      return openCamera(mode, plan);
    },
    [openCamera]
  );

  // Never throws: a decision that cannot be read is a free start (fail-open, accepted in the spec).
  const safeDecision = useCallback(async (): Promise<StartDecision> => {
    try {
      return await deps.startDecision();
    } catch {
      return { kind: 'free' };
    }
  }, [deps]);

  const startingRef = useRef(false);
  const start = useCallback(
    async (sport: Sport): Promise<StartResult> => {
      const phase = stateRef.current.phase;
      if (startingRef.current || phase === 'starting' || phase === 'recording' || phase === 'stopping') return 'busy';
      startingRef.current = true;
      try {
        // decide → (blocked: stop here) → open the camera for that plan → decide again → reopen if the plan changed →
        // create the session. Nothing paid is ever asked once recording.
        let decision = await safeDecision();
        // Nothing touched: the setup screen opens the paywall.
        if (decision.kind === 'blocked') return 'blocked';
        dispatch({ type: 'startRequested' });
        let toggled = false;
        let locale: VoiceLocale | undefined;
        try {
          if (!(await openCamera(sport, planOf(decision)))) {
            dispatch({ type: 'startFailed', code: cameraError.current ?? 'CAMERA_UNAVAILABLE' });
            return 'failed';
          }
          // The plan can change while the camera opens (Pro lapsing, a credit spent elsewhere, the month's last free
          // recording used): this check decides, and the camera is reopened to match it.
          const again = await safeDecision();
          if (again.kind === 'blocked') {
            dispatch({ type: 'startBlocked' });
            return 'blocked';
          }
          if (planOf(again) !== planOf(decision) && !(await openCamera(sport, planOf(again)))) {
            dispatch({ type: 'startFailed', code: cameraError.current ?? 'CAMERA_UNAVAILABLE' });
            return 'failed';
          }
          decision = again; // the session always matches the camera that is open
          const plan = planOf(decision);
          const settings = effectiveSettings(sport, deps.repo.getPrefs());
          const config = captureConfig(settings, plan);
          // Listen only when the phone may: native and the setup tile must agree on whether voice is on.
          const voiceOn = settings.voiceEnabled && deps.camera.getSpeechPermission() === 'granted';
          locale = voiceLocale(deps.locale());
          toggled = true;
          deps.camera.setGestureEnabled(settings.gestureEnabled);
          deps.camera.setVoiceEnabled(voiceOn, locale);
          // Last fallible step: it counts a free recording or spends a credit, so a start that failed never does.
          const session = deps.repo.startSession(sport, deps.now(), {
            paid: plan === 'paid',
            ...(decision.kind === 'credit' ? { passTransactionId: decision.passTransactionId } : {}),
          });
          cutSeconds.current = config.cutSeconds;
          const paid = plan === 'paid';
          dispatch({
            type: 'started',
            sessionId: session.id,
            startedAt: session.startedAt,
            paid,
            bufferSeconds: config.bufferSeconds,
          });
          // Visible to a second start() before React commits.
          stateRef.current = { ...stateRef.current, phase: 'recording', paid };
          return 'started';
        } catch (e) {
          // No game: body pose and voice go back off, as while positioning.
          if (toggled) {
            try {
              deps.camera.setGestureEnabled(false);
              if (locale) deps.camera.setVoiceEnabled(false, locale);
            } catch {
              // the start already failed; the error below is the one shown
            }
          }
          dispatch({ type: 'startFailed', code: errorCode(e) });
          return 'failed';
        }
      } finally {
        startingRef.current = false;
      }
    },
    [deps, openCamera, safeDecision]
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
