/**
 * Whether a Bluetooth remote press was heard in this launch of the app. The setup screen stays mounted (and unfocused)
 * under the Dispositivos sheet, so both read the same answer from here.
 */
type Listener = () => void;

let pressed = false;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((fn) => fn());

export function hasRemotePress(): boolean {
  return pressed;
}

export function markRemotePress(): void {
  pressed = true;
  notify();
}

export function clearRemotePress(): void {
  pressed = false;
  notify();
}

export function subscribeRemotePress(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
