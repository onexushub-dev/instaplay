import type { TriggerSource } from '../data/schema';

type Listener = (source: TriggerSource, at: number) => void;

/**
 * One entry point for every way of saving a lance (screen, remote, gesture, watch).
 * Triggers closer than `debounceMs` to the last accepted one are dropped, whatever their source,
 * so a gesture right after a tap doesn't save the same play twice (spec 4.4).
 */
export function createTriggerBus({ debounceMs = 3000, now = Date.now }: { debounceMs?: number; now?: () => number } = {}) {
  const listeners = new Set<Listener>();
  let lastAccepted = -Infinity;

  return {
    fire(source: TriggerSource): boolean {
      const at = now();
      if (at - lastAccepted < debounceMs) return false;
      lastAccepted = at;
      listeners.forEach((fn) => fn(source, at));
      return true;
    },

    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type TriggerBus = ReturnType<typeof createTriggerBus>;
