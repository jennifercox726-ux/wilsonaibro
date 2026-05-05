// Ghost Mode: filters "static" (specific names/topics) from Wilson's responses
// when The Only One needs to focus on the dream.

const STORAGE_KEY = "ghost_mode_v1";

export interface GhostModeState {
  enabled: boolean;
  terms: string[];
}

export function loadGhostMode(): GhostModeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return { enabled: false, terms: ["Leo", "Tara"] };
}

export function saveGhostMode(state: GhostModeState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("ghost-mode-changed", { detail: state }));
}

// Replaces any sentence containing a filtered term with a soft placeholder.
export function applyGhostFilter(text: string, state: GhostModeState): string {
  if (!state.enabled || state.terms.length === 0) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const pattern = new RegExp(`\\b(${state.terms.map(escapeRe).join("|")})\\b`, "i");
  return sentences
    .map((s) => (pattern.test(s) ? "*…filtered by Ghost Mode…*" : s))
    .join(" ");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
