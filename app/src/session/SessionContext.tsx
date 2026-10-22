import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useContext } from 'react';

import * as camera from '../../modules/replay-camera';
import { removeFile, repo } from '../data/mmkv';
import { currentLocale } from '../i18n';
import { payments } from '../payments';
import { watchTriggerAllowed } from '../payments/rules';
import { useEntitlement } from '../share/entitlement';
import { useVolumeRemote } from '../triggers/useVolumeRemote';
import { type ReplaySession, type SessionDeps, useReplaySession } from './useReplaySession';
import { useWatchTriggerGate } from './useWatchTriggerGate';

const appDeps: SessionDeps = {
  camera,
  repo,
  deleteFile: removeFile,
  haptic: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  now: Date.now,
  locale: currentLocale,
  startDecision: payments.startDecision,
  tierFor: payments.tierFor,
  useRemote: useVolumeRemote,
};

const SessionContext = createContext<ReplaySession | null>(null);

/** One game at a time, shared by setup, recording and end-of-game screens. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useReplaySession(appDeps);
  // The watch trigger is paid: the global tier (Pro) decides, held for the whole of a recording that has started.
  const { tier } = useEntitlement();
  useWatchTriggerGate(session.state.phase === 'recording', watchTriggerAllowed(tier), camera.watchSetSaveAllowed);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): ReplaySession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
