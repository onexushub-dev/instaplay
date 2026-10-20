export type PairLink = { hostId: string; secret: string; hostName: string };

const DEFAULT_NAME = 'Celular da câmera';
// 16 random bytes as base64url without padding are exactly 22 characters.
const SECRET = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^[0-9]{6}$/;

/**
 * Reads the parameters of `lance://pair?h=...&s=...&n=...`, the link the camera phone shows as a QR code.
 * Null when the host id or the secret is missing or malformed; a missing name only falls back to a generic one.
 */
export function parsePairLink(params: { h?: string; s?: string; n?: string }): PairLink | null {
  const hostId = params.h;
  const secret = params.s;
  const name = params.n;
  if (typeof hostId !== 'string' || hostId.length === 0 || hostId.length > 64) return null;
  if (typeof secret !== 'string' || !SECRET.test(secret)) return null;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return { hostId, secret, hostName: trimmed.length > 0 ? trimmed.slice(0, 40) : DEFAULT_NAME };
}

/** The six digits typed by hand (spaces allowed), or null when it is not a code. */
export function parseCode(input: string): string | null {
  const digits = input.replace(/\s+/g, '');
  return CODE.test(digits) ? digits : null;
}
