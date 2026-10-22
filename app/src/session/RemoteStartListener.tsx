import { router } from 'expo-router';
import { useEffect } from 'react';

import { addReplayListener } from '../../modules/replay-camera';
import { repo } from '../data/mmkv';
import { offeredMode } from '../modes/registry';
import { useSession } from './SessionContext';

/**
 * The remote phone's and the watch's "Iniciar gravação": starts a game from whatever screen is in front, as long as no
 * game is running. It lives above every screen: ending a game replaces the setup screen with the game's summary, so a
 * listener kept on the setup screen was gone exactly when the next game was asked for.
 */
export function RemoteStartListener() {
  const session = useSession();
  const { phase, error, camera } = session.state;

  useEffect(() => {
    const sub = addReplayListener('onRemoteStart', () => {
      if (phase === 'starting' || camera === 'starting') return;
      if (phase !== 'idle' && !(phase === 'ended' && error === undefined)) return;
      router.navigate('/setup');
      // A remote start that needs payment does nothing: the paywall only opens from the setup button.
      void session.start(offeredMode(repo.getPrefs().sport));
    });
    return () => sub.remove();
  });

  return null;
}
