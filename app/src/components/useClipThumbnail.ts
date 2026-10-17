import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import { useEffect, useState } from 'react';

const cache = new Map<string, VideoThumbnail>();

/** One frame of a saved clip, generated lazily and cached for the app's lifetime. */
export function useClipThumbnail(path: string, atMs: number): VideoThumbnail | undefined {
  const key = `${path}@${atMs}`;
  const [thumb, setThumb] = useState(() => cache.get(key));

  useEffect(() => {
    if (cache.has(key)) return;
    let alive = true;
    const player = createVideoPlayer({ uri: `file://${path}` });
    player
      .generateThumbnailsAsync(atMs / 1000, { maxWidth: 400 })
      .then(([first]) => {
        if (!first) return;
        cache.set(key, first);
        if (alive) setThumb(first);
      })
      .catch(() => {})
      .finally(() => player.release());
    return () => {
      alive = false;
    };
  }, [key, path, atMs]);

  return thumb;
}
