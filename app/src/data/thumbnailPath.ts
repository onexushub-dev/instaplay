/** Where a clip's thumbnail is cached: next to it, same name, .jpg. Kept in sync with the native module. */
export function thumbnailPath(clipPath: string): string {
  return clipPath.replace(/\.[^./]+$/, '') + '.jpg';
}
