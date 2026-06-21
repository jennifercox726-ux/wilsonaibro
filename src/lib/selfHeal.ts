/**
 * Self-healing runtime guards.
 * - Listens for unhandled DB/permission errors, logs to telemetry, emits a UI event.
 * - Auto-recovers from transient Supabase auth blips by refreshing the session.
 * - Surfaces a `wilson:self-heal` CustomEvent so UI can react.
 */
import { supabase } from "@/integrations/supabase/client";

type HealEvent = {
  kind: "db-permission" | "auth-expired" | "network" | "unknown";
  message: string;
  recovered: boolean;
  at: number;
};

const RECENT: HealEvent[] = [];
const MAX_RECENT = 20;

function record(e: HealEvent) {
  RECENT.unshift(e);
  if (RECENT.length > MAX_RECENT) RECENT.length = MAX_RECENT;
  try {
    window.dispatchEvent(new CustomEvent("wilson:self-heal", { detail: e }));
  } catch { /* noop */ }
  // eslint-disable-next-line no-console
  console.info("[self-heal]", e);
}

export function getSelfHealLog(): HealEvent[] {
  return [...RECENT];
}

let refreshingAuth = false;
async function tryRefreshAuth(): Promise<boolean> {
  if (refreshingAuth) return false;
  refreshingAuth = true;
  try {
    const { error } = await supabase.auth.refreshSession();
    return !error;
  } catch {
    return false;
  } finally {
    refreshingAuth = false;
  }
}

function classify(msg: string): HealEvent["kind"] {
  const m = msg.toLowerCase();
  if (/row[-\s]?level security|rls|permission denied|not authorized|forbidden|policy/.test(m)) {
    return "db-permission";
  }
  if (/jwt|invalid token|session.*expired|refresh.*token|401|unauthor/.test(m)) {
    return "auth-expired";
  }
  if (/failed to fetch|network|timeout|load failed/.test(m)) return "network";
  return "unknown";
}

async function handle(rawMsg: string) {
  const kind = classify(rawMsg);
  if (kind === "unknown") return;

  let recovered = false;
  if (kind === "auth-expired") {
    recovered = await tryRefreshAuth();
  }
  record({ kind, message: rawMsg.slice(0, 240), recovered, at: Date.now() });
}

let installed = false;
export function installSelfHeal() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const msg =
      (reason && (reason.message || reason.error_description || reason.msg)) ||
      (typeof reason === "string" ? reason : "");
    if (msg) void handle(String(msg));
  });

  window.addEventListener("error", (ev) => {
    if (ev?.message) void handle(String(ev.message));
  });

  // Auto-refresh on auth state events from Supabase so the app silently recovers.
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        record({ kind: "auth-expired", message: "token auto-refreshed", recovered: true, at: Date.now() });
      }
    });
  } catch { /* noop */ }
}
