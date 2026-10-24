import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useContext, useEffect } from 'react';

import * as camera from '../../modules/replay-camera';
import { removeFile, repo } from '../data/mmkv';
import { currentLocale } from '../i18n';
import { payments } from '../payments';
import { triggerAllowed } from '../payments/limits';
import { usePlan } from '../share/entitlement';
import { focusQueue } from '../focus/appFocusQueue';
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
  useRemote: useVolumeRemote,
  onClipSaved: (clipId) => focusQueue.enqueue(clipId),
};

const SessionContext = createContext<ReplaySession | null>(null);

/** One game at a time, shared by setup, recording and end-of-game screens. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useReplaySession(appDeps);
  // The watch trigger is paid: the recording's own plan decides (the next start's outside one), held for the whole of a
  // recording that has started.
  const recording = session.state.phase === 'recording';
  const plan = usePlan(recording ? session.state.sessionId : undefined);
  useWatchTriggerGate(recording, triggerAllowed('watch', plan), camera.watchSetSaveAllowed);

  // The camera comes first: no new Modo Foco analysis while recording with the phone hot (spec §4.1).
  const { phase, thermal } = session.state;
  const hot = phase === 'recording' && (thermal.level === 'serious' || thermal.level === 'critical');
  useEffect(() => focusQueue.setPaused(hot), [hot]);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): ReplaySession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
