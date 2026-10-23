import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { preloadLogo } from './brandLogo';

/**
 * Captures the share overlay as a transparent PNG at the view's native pixel size (render it at
 * frame / PixelRatio points to get exactly the frame's pixels). Returns a plain file path.
 */
export async function captureOverlay(ref: RefObject<ComponentRef<typeof View> | null>): Promise<string> {
  await preloadLogo(); // an image still loading would leave the export without the logo
  const uri = await captureRef(ref, { format: 'png', result: 'tmpfile' });
  return uri.replace(/^file:\/\//, '');
}
