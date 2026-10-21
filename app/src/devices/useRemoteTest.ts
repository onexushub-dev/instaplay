import { useCallback, useEffect, useState } from 'react';

import { repo } from '../data/mmkv';
import { clearRemotePress, hasRemotePress, markRemotePress, subscribeRemotePress } from './remoteTest';

const usedBefore = () => repo.getPrefs().remoteTestedAt !== undefined;

/** The Bluetooth remote's proof of life: a press this launch, and whether it was ever heard before. */
export function useRemoteTest() {
  const [pressed, setPressed] = useState(hasRemotePress);
  const [testedBefore, setTestedBefore] = useState(usedBefore);

  useEffect(() => {
    const sync = () => {
      setPressed(hasRemotePress());
      setTestedBefore(usedBefore());
    };
    sync(); // a press may have been heard between the first render and now
    return subscribeRemotePress(sync);
  }, []);

  /** A press of the remote was heard. */
  const press = useCallback(() => {
    if (!usedBefore()) repo.setPrefs({ remoteTestedAt: Date.now() });
    markRemotePress();
  }, []);

  /** Drops what the app remembers (the iOS pairing itself is removed by the player in Ajustes > Bluetooth). */
  const forget = useCallback(() => {
    repo.setPrefs({ remoteTestedAt: undefined });
    clearRemotePress();
  }, []);

  return { pressed, testedBefore, press, forget };
}
