// Sovereign Dispatcher — fires GitHub Actions workflows or opens sentinel confirmation windows.
//
// Two callers:
//   1. Authenticated user from the Sovereignty Panel (Test Fire / manual fire)
//   2. sentinel-check (service role) when the protocol triggers
//
// Auto-tier workflows fire immediately. Confirm-tier workflows create
// dispatch_confirmations rows and (in production) email each sentinel a
// unique 12-hour token link. First sentinel to click wins (handled by
// the confirm-dispatch function).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DispatchRequestBody {
  workflow_id: string;
  trigger_source: "manual" | "test_fire" | "sentinel_auto";
  inputs?: Record<string, string>;
  // Only honored when caller is service role (sentinel-check):
  user_id?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fireGitHubWorkflow(
  repo: string,
  token: string,
  workflowFile: string,
  ref: string,
  inputs: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Wilson-Sovereign-Dispatcher",
    },
    body: JSON.stringify({ ref, inputs }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const GITHUB_TOKEN = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  const GITHUB_REPO = Deno.env.get("GITHUB_DISPATCH_REPO");

  if (!GITHUB_TOKEN) return json({ error: "GITHUB_DISPATCH_TOKEN not configured" }, 500);
  if (!GITHUB_REPO) return json({ error: "GITHUB_DISPATCH_REPO not configured" }, 500);

  // Identify caller: authenticated user OR service role
  const authHeader = req.headers.get("Authorization") ?? "";
  const incomingToken = authHeader.replace(/^Bearer\s+/i, "");
  const isServiceRole = incomingToken && incomingToken === SERVICE_ROLE;

  let body: DispatchRequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.workflow_id || typeof body.workflow_id !== "string") {
    return json({ error: "workflow_id is required" }, 400);
  }
  if (!["manual", "test_fire", "sentinel_auto"].includes(body.trigger_source)) {
    return json({ error: "Invalid trigger_source" }, 400);
  }

  // Resolve user_id
  let userId: string | null = null;
  if (isServiceRole) {
    if (!body.user_id) return json({ error: "user_id required for service-role calls" }, 400);
    userId = body.user_id;
  } else {
    // Validate user JWT
    if (!incomingToken) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${incomingToken}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    userId = userData.user.id;
    // Service-role-only sources cannot be used by user callers
    if (body.trigger_source === "sentinel_auto") {
      return json({ error: "sentinel_auto trigger source restricted" }, 403);
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Load workflow + verify ownership
  const { data: wf, error: wfErr } = await admin
    .from("dispatch_workflows")
    .select("*")
    .eq("id", body.workflow_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (wfErr) return json({ error: wfErr.message }, 500);
  if (!wf) return json({ error: "Workflow not found" }, 404);

  // Test Fire is always dry-run
  const isTestFire = body.trigger_source === "test_fire";
  const isAuto = wf.tier === "auto";
  const inputs: Record<string, string> = {
    ...(body.inputs ?? {}),
    dry_run: isTestFire ? "true" : "false",
  };

  // Auto-tier OR test fire OR manual on auto-tier → fire now
  // Manual on confirm-tier → also fire now (user is the owner, they can override their own confirm gate)
  // sentinel_auto on confirm-tier → open confirmation window
  const shouldOpenConfirmation =
    body.trigger_source === "sentinel_auto" && wf.tier === "confirm";

  if (shouldOpenConfirmation) {
    // Load sentinels
    const { data: sentinels, error: sentErr } = await admin
      .from("sovereignty_sentinels")
      .select("id, name, email")
      .eq("user_id", userId);

    if (sentErr) return json({ error: sentErr.message }, 500);
    if (!sentinels || sentinels.length === 0) {
      // No sentinels — log as failed
      await admin.from("dispatch_log").insert({
        user_id: userId,
        workflow_id: wf.id,
        trigger_source: body.trigger_source,
        status: "failed",
        inputs,
        error_message: "No sentinels registered for confirm-tier workflow",
      });
      return json({ error: "No sentinels available to confirm" }, 400);
    }

    const { data: logRow, error: logErr } = await admin
      .from("dispatch_log")
      .insert({
        user_id: userId,
        workflow_id: wf.id,
        trigger_source: body.trigger_source,
        status: "pending_confirmation",
        inputs,
      })
      .select("*")
      .single();

    if (logErr || !logRow) return json({ error: logErr?.message ?? "Log insert failed" }, 500);

    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const confirmations = sentinels.map((s) => ({
      user_id: userId!,
      dispatch_log_id: logRow.id,
      sentinel_id: s.id,
      token: generateToken(),
      expires_at: expiresAt,
    }));

    const { error: confErr } = await admin.from("dispatch_confirmations").insert(confirmations);
    if (confErr) return json({ error: confErr.message }, 500);

    // TODO: When email infrastructure is verified, send each sentinel their unique link.
    // For now, log the links so they appear in edge function logs and can be relayed manually.
    for (const c of confirmations) {
      const sentinel = sentinels.find((s) => s.id === c.sentinel_id);
      console.log(
        `[CONFIRM-LINK] sentinel=${sentinel?.name} <${sentinel?.email}> ` +
          `workflow="${wf.display_name}" token=${c.token} expires=${expiresAt}`,
      );
    }

    return json({
      ok: true,
      mode: "confirmation_pending",
      dispatch_log_id: logRow.id,
      sentinels_notified: sentinels.length,
      expires_at: expiresAt,
    });
  }

  // Fire immediately
  if (!isTestFire && !isAuto && body.trigger_source === "manual") {
    // owner manual override on confirm-tier — fine, log distinctly
  }
  if (isAuto && !wf.armed && body.trigger_source === "sentinel_auto") {
    return json({ error: "Workflow disarmed" }, 400);
  }

  // Insert pending log row first so we always have an audit trail
  const { data: logRow, error: logErr } = await admin
    .from("dispatch_log")
    .insert({
      user_id: userId,
      workflow_id: wf.id,
      trigger_source: body.trigger_source,
      status: "failed", // optimistic; will update on success
      inputs,
    })
    .select("*")
    .single();

  if (logErr || !logRow) return json({ error: logErr?.message ?? "Log insert failed" }, 500);

  const result = await fireGitHubWorkflow(
    GITHUB_REPO,
    GITHUB_TOKEN,
    wf.workflow_file,
    wf.ref,
    inputs,
  );

  await admin
    .from("dispatch_log")
    .update({
      status: result.ok ? "dispatched" : "failed",
      github_status_code: result.status,
      github_response: result.body.slice(0, 2000),
      dispatched_at: result.ok ? new Date().toISOString() : null,
      error_message: result.ok ? null : `GitHub returned ${result.status}`,
    })
    .eq("id", logRow.id);

  return json({
    ok: result.ok,
    mode: isTestFire ? "test_fire" : "fired",
    dispatch_log_id: logRow.id,
    github_status: result.status,
    dry_run: isTestFire,
  });
});
