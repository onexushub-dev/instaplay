import { useEffect, useRef } from 'react';
import { VolumeManager } from 'react-native-volume-manager';

/** Where the volume is parked: room above and below, so any remote press changes it. */
const PARK = 0.5;
const TOLERANCE = 0.01;
/** Volume events this soon after our own setVolume are its echo (Android reports a rounded step). */
const ECHO_MS = 300;

/**
 * Bluetooth selfie remotes press "volume up". While enabled, each volume change counts as one press;
 * the volume is parked back at a fixed level (and the system HUD hidden) so the next press registers too.
 * The phone's own volume is restored when the hook stops.
 */
export function useVolumeRemote(enabled: boolean, onPress: () => void): void {
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let original: number | undefined;
    let parked = PARK;
    let lastOwnSet = -Infinity;

    const setOwn = async (volume: number) => {
      lastOwnSet = Date.now();
      await VolumeManager.setVolume(volume, { showUI: false, playSound: false });
    };

    // Park, then adopt the level the OS actually set (volume comes in steps on Android).
    const park = async () => {
      await setOwn(parked);
      const { volume } = await VolumeManager.getVolume();
      parked = volume;
    };

    const listener = VolumeManager.addVolumeListener(({ volume }) => {
      const echo = Date.now() - lastOwnSet < ECHO_MS || Math.abs(volume - parked) < TOLERANCE;
      if (!active || echo) return;
      onPressRef.current();
      park().catch(() => {});
    });

    VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {});
    VolumeManager.getVolume()
      .then(({ volume }) => {
        original = volume;
        // At the top or bottom a press can't move the volume, so park in the middle.
        parked = volume > 1 - 0.1 || volume < 0.1 ? PARK : volume;
        return active ? park() : undefined;
      })
      .catch(() => {});

    return () => {
      active = false;
      listener.remove();
      VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => {});
      if (original !== undefined) setOwn(original).catch(() => {});
    };
  }, [enabled]);
}
