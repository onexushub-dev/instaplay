import { useEffect, useState } from 'react';

import { getDeviceUpright } from '../../modules/replay-camera';
import type { DeviceUpright } from '../../modules/replay-camera/src/ReplayCamera.types';

const POLL_MS = 300;
/** Same answer this many times in a row before the screen changes, so a tilt in passing does not flicker the layout. */
const STABLE_READS = 2;

export function isLandscape(upright: DeviceUpright): boolean {
  return upright === 'landscapeLeft' || upright === 'landscapeRight';
}

/** Whether the phone is held on its side. Only polls while `active`; false whenever it is not. */
export function useDeviceLandscape(active: boolean): boolean {
  // The first answer is read at once, so a phone already on its side never flashes the upright layout.
  const [landscape, setLandscape] = useState(() => active && isLandscape(getDeviceUpright()));
  useEffect(() => {
    if (!active) return;
    let candidate: boolean | undefined;
    let seen = 0;
    const timer = setInterval(() => {
      const now = isLandscape(getDeviceUpright());
      if (now === candidate) {
        seen += 1;
      } else {
        // The first read after (re)activating applies at once; later changes wait for a second matching read.
        const first = candidate === undefined;
        candidate = now;
        seen = first ? STABLE_READS : 1;
      }
      if (seen >= STABLE_READS) setLandscape(candidate);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active]);
  return active && landscape;
}
