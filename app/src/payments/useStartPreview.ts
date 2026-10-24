import { useSyncExternalStore } from 'react';

import { repo } from '../data/mmkv';
import { payments } from '.';
import type { StartDecision } from './types';

/**
 * What the next "Começar gravação" would do, and how many Single Passes and free recordings are left. Re-renders on the payments store
 * and on the repo too, because the spent Passes live in the repo.
 */
export function useStartPreview(): { decision: StartDecision; credits: number; freeLeft: number } {
  useSyncExternalStore(payments.subscribe, payments.version);
  useSyncExternalStore(repo.subscribe, repo.version);
  return { decision: payments.peekStart(), credits: payments.credits(), freeLeft: payments.freeLeft() };
}
