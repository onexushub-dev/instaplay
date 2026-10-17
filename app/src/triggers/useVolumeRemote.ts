import { useEffect, useRef } from 'react';
import { VolumeManager } from 'react-native-volume-manager';

/** Where the volume is parked: room above and below, so any remote press changes it. */
const PARK = 0.5;
const TOLERANCE = 0.01;

/**
 * Bluetooth selfie remotes press "volume up". While enabled, each volume change counts as one press;
 * the volume is parked back at a fixed level (and the system HUD hidden) so the next press registers too.
 */
export function useVolumeRemote(enabled: boolean, onPress: () => void): void {
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (!enabled) return;
    let parked = PARK;
    let active = true;

    const park = () => VolumeManager.setVolume(parked, { showUI: false, playSound: false });

    const listener = VolumeManager.addVolumeListener(({ volume }) => {
      if (!active || Math.abs(volume - parked) < TOLERANCE) return; // our own reset
      onPressRef.current();
      park();
    });

    VolumeManager.showNativeVolumeUI({ enabled: false });
    VolumeManager.getVolume().then(({ volume }) => {
      // At the top or bottom a press can't move the volume, so park in the middle.
      parked = volume > 1 - 0.1 || volume < 0.1 ? PARK : volume;
      if (active) park();
    });

    return () => {
      active = false;
      listener.remove();
      VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, [enabled]);
}
