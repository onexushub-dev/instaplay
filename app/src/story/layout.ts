export type Rect = { x: number; y: number; width: number; height: number };

/**
 * The whole video, aspect-fit and centred in the Story frame; the space above and below it are the
 * template bands (Marcus' decision: never crop the court).
 */
export function storyLayout(
  video: { width: number; height: number },
  frame: { width: number; height: number }
): { video: Rect; top: Rect; bottom: Rect } {
  const scale = Math.min(frame.width / video.width, frame.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  const x = (frame.width - width) / 2;
  const y = (frame.height - height) / 2;
  return {
    video: { x, y, width, height },
    top: { x: 0, y: 0, width: frame.width, height: y },
    bottom: { x: 0, y: y + height, width: frame.width, height: frame.height - (y + height) },
  };
}
