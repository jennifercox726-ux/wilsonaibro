// Tiny pub/sub for "user is recording mic input" state.
// Lets the WilsonOrb pulse cyan while the user is dictating.

type Listener = () => void;

let listening = false;
const listeners = new Set<Listener>();

export function setListening(value: boolean): void {
  if (listening === value) return;
  listening = value;
  listeners.forEach((l) => l());
}

export function getListening(): boolean {
  return listening;
}

export function subscribeListening(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One-shot event bus for "send ripple" pulses emitted from the orb. */
type RippleListener = () => void;
const rippleListeners = new Set<RippleListener>();

export function emitRipple(): void {
  rippleListeners.forEach((l) => l());
}

export function subscribeRipple(listener: RippleListener): () => void {
  rippleListeners.add(listener);
  return () => rippleListeners.delete(listener);
}
