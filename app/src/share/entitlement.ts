import { useSyncExternalStore } from 'react';

import { repo } from '../data/mmkv';
import { payments } from '../payments';
import { sessionPlan } from '../payments/rules';
import type { Plan } from '../payments/types';

/**
 * The single place that says which plan applies. With a session, the plan it was recorded with (fixed at its start);
 * without one, the plan the next start would get. Re-renders on the payments store and on the repo (spent Passes,
 * sessions).
 */
export function usePlan(sessionId?: string): Plan {
  useSyncExternalStore(payments.subscribe, payments.version);
  useSyncExternalStore(repo.subscribe, repo.version);
  if (sessionId === undefined) return payments.nextPlan();
  try {
    return sessionPlan(repo.getSession(sessionId) ?? {});
  } catch {
    return 'free';
  }
}
