/** Each clip file's picture size, once known: a clip opened by swiping is laid out right away instead of jumping. */
const shapes = new Map<string, { width: number; height: number }>();

export function knownShape(path: string): { width: number; height: number } | undefined {
  return shapes.get(path);
}

export function rememberShape(path: string, size: { width: number; height: number }) {
  shapes.set(path, size);
}

/** Tests start from nothing known. */
export function forgetShapes() {
  shapes.clear();
}
