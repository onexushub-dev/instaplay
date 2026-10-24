import * as Haptics from 'expo-haptics';
import { createContext, type ReactNode, useContext, useEffect } from 'react';

import * as camera from '../../modules/replay-camera';
import { removeFile, repo } from '../data/mmkv';
import { focusQueue } from '../focus/appFocusQueue';
import { useVolumeRemote } from '../triggers/useVolumeRemote';
import { type ReplaySession, type SessionDeps, useReplaySession } from './useReplaySession';

const appDeps: SessionDeps = {
  camera,
  repo,
  deleteFile: removeFile,
  haptic: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  now: Date.now,
  useRemote: useVolumeRemote,
  onClipSaved: (clipId) => focusQueue.enqueue(clipId),
};

const SessionContext = createContext<ReplaySession | null>(null);

/** One game at a time, shared by setup, recording and end-of-game screens. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useReplaySession(appDeps);
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
