import type { AnalyzeFocusOptions, FocusAnalysis } from '../../modules/replay-camera/src/ReplayCamera.types';
import { focusPath } from '../data/focusFile';
import type { Repo } from '../data/repo';
import type { Clip } from '../data/schema';

export type FocusQueueDeps = {
  analyze(opts: AnalyzeFocusOptions): Promise<FocusAnalysis>;
  /** Stops the native analysis of this clip file. */
  cancel(clipPath: string): void;
  supported(): boolean;
  repo: Pick<Repo, 'getClip' | 'updateClip'>;
  deleteFile(path: string): void;
};

export type FocusQueue = {
  /** A clip just saved: mark it pending and analyse it when its turn comes. */
  enqueue(clipId: string): void;
  /** A clip opened in the editor: queue it if it was never analysed, or was left pending by a closed app. */
  ensure(clip: Clip): void;
  /** The clip file is being deleted: drop it from the queue and stop its analysis. */
  cancel(clipPath: string): void;
  /** True while recording with the phone hot: the camera comes first, nothing new starts. */
  setPaused(paused: boolean): void;
};

const codeOf = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined);

/** Modo Foco analyses, one at a time, in the order the clips were saved or opened (spec §4.1). */
export function createFocusQueue(deps: FocusQueueDeps): FocusQueue {
  let waiting: string[] = [];
  let running: { id: string; path: string } | undefined;
  let paused = false;

  function pump() {
    if (running || paused) return;
    while (waiting.length > 0) {
      const id = waiting.shift() as string;
      const clip = deps.repo.getClip(id);
      if (!clip) continue; // deleted while waiting
      start(clip);
      return;
    }
  }

  function start(clip: Clip) {
    const outPath = focusPath(clip.path);
    const range = clip.bounds ? clip.bounds : { startMs: 0, endMs: clip.durationMs };
    running = { id: clip.id, path: clip.path };
    deps
      .analyze({ clipPath: clip.path, startMs: range.startMs, endMs: range.endMs, outPath })
      .then((result) => {
        // updateClip never brings back a deleted clip; the file it wrote is then left over.
        if (!deps.repo.updateClip(clip.id, { focus: { v: 1, status: result.status, file: outPath } })) deps.deleteFile(outPath);
      })
      .catch((e: unknown) => {
        const code = codeOf(e);
        if (code === 'CANCELLED') return;
        // Vision cannot run with the app in the background: left pending, it is redone when the clip is opened.
        if (code === 'FOCUS_INTERRUPTED') return;
        console.warn('[Repplay] Modo Foco analysis failed', clip.path, e);
        deps.repo.updateClip(clip.id, { focus: { v: 1, status: 'failed' } });
      })
      .finally(() => {
        running = undefined;
        pump();
      });
  }

  function enqueue(clipId: string) {
    if (!deps.supported()) return;
    if (waiting.includes(clipId) || (running && running.id === clipId)) return;
    if (!deps.repo.updateClip(clipId, { focus: { v: 1, status: 'pending' } })) return;
    waiting.push(clipId);
    pump();
  }

  return {
    enqueue,
    ensure(clip) {
      if (!clip.focus || clip.focus.status === 'pending') enqueue(clip.id);
    },
    cancel(clipPath) {
      waiting = waiting.filter((id) => {
        const clip = deps.repo.getClip(id);
        return clip !== undefined && clip.path !== clipPath;
      });
      if (running && running.path === clipPath) deps.cancel(clipPath);
    },
    setPaused(value) {
      paused = value;
      pump();
    },
  };
}
