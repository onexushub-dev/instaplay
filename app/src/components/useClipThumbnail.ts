import { useEffect, useState } from 'react';

import { createThumbnail } from '../../modules/replay-camera';

const cache = new Map<string, string>();

/**
 * A frame of a saved clip, made natively once and cached as a .jpg next to the clip.
 * Returns a file uri for expo-image, or undefined while it is being made (or if it can't be).
 */
export function useClipThumbnail(path: string, atMs: number): string | undefined {
  const key = `${path}@${atMs}`;
  const [uri, setUri] = useState(() => cache.get(key));

  useEffect(() => {
    if (!path || cache.has(key)) return;
    let alive = true;
    createThumbnail(path, atMs)
      .then((thumbPath) => {
        const fileUri = `file://${thumbPath}`;
        cache.set(key, fileUri);
        if (alive) setUri(fileUri);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key, path, atMs]);

  return uri;
}
