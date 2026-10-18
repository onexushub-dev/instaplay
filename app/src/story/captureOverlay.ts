import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Captures the Story overlay as a transparent PNG of exactly `size` pixels; returns a plain file path. */
export async function captureOverlay(ref: RefObject<ComponentRef<typeof View> | null>, size: { width: number; height: number }): Promise<string> {
  const uri = await captureRef(ref, { format: 'png', result: 'tmpfile', width: size.width, height: size.height });
  return uri.replace(/^file:\/\//, '');
}
