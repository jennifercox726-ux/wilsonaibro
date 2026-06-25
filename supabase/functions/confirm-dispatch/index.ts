// confirm-dispatch — public endpoint sentinels hit via the link in their email.
// Validates the single-use 12-hour token, marks the confirmation consumed,
// fires the GitHub workflow ONCE (first sentinel to click wins), and returns
// an HTML confirmation page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const htmlPage = (title: string, message: string, ok: boolean) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: radial-gradient(circle at 50% 30%, #1a1a2e 0%, #0a0a14 100%); color:#e6e6f0; }
  .card { max-width:420px; padding:2.5rem; border-radius:1.25rem;
          background: rgba(20,20,40,0.7); backdrop-filter: blur(12px);
          border: 1px solid ${ok ? "rgba(120,200,160,0.3)" : "rgba(220,120,120,0.3)"};
          text-align:center; box-shadow: 0 25px 80px rgba(0,0,0,0.5); }
  h1 { font-size:1.25rem; margin:0 0 0.75rem; letter-spacing:0.05em;
       color: ${ok ? "#7fd1a8" : "#e08a8a"}; }
  p { font-size:0.9rem; line-height:1.6; opacity:0.85; margin:0; }
  .badge { display:inline-block; padding:0.35rem 0.75rem; border-radius:999px;
           font-size:0.7rem; letter-spacing:0.15em; text-transform:uppercase;
           margin-bottom:1rem;
           background: ${ok ? "rgba(127,209,168,0.15)" : "rgba(224,138,138,0.15)"};
           color: ${ok ? "#7fd1a8" : "#e08a8a"}; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${ok ? "Sovereign Confirmation" : "Confirmation Failed"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

const respondHtml = (title: string, message: string, ok: boolean, status = 200) =>
  new Response(htmlPage(title, message, ok), {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token || token.length < 32) {
    return respondHtml("Invalid Link", "This confirmation link is malformed.", false, 400);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GITHUB_TOKEN = Deno.env.get("GITHUB_DISPATCH_TOKEN");
  const GITHUB_REPO = Deno.env.get("GITHUB_DISPATCH_REPO");

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return respondHtml(
      "Dispatcher Offline",
      "GitHub credentials are not configured on the server.",
      false,
      500,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: confirmation } = await admin
    .from("dispatch_confirmations")
    .select("*, sovereignty_sentinels(name)")
    .eq("token", token)
    .maybeSingle();

  if (!confirmation) {
    return respondHtml("Not Found", "This confirmation token is unknown.", false, 404);
  }
  if (confirmation.consumed_at) {
    return respondHtml(
      "Already Used",
      "This confirmation link has already been used.",
      false,
      410,
    );
  }
  if (new Date(confirmation.expires_at).getTime() < Date.now()) {
    return respondHtml(
      "Expired",
      "This confirmation link expired (12-hour window closed).",
      false,
      410,
    );
  }

  // Load the dispatch log row
  const { data: logRow } = await admin
    .from("dispatch_log")
    .select("*, dispatch_workflows(*)")
    .eq("id", confirmation.dispatch_log_id)
    .maybeSingle();

  if (!logRow) {
    return respondHtml("Missing Record", "Dispatch record not found.", false, 404);
  }

  // First-click-wins: if the log row is no longer pending, someone else fired it
  if (logRow.status !== "pending_confirmation") {
    return respondHtml(
      "Already Confirmed",
      "Another sentinel already confirmed this dispatch. Standing down.",
      true,
    );
  }

  // Atomically claim by marking this confirmation consumed first
  const { error: consumeErr } = await admin
    .from("dispatch_confirmations")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", confirmation.id)
    .is("consumed_at", null);

  if (consumeErr) {
    return respondHtml("Error", "Could not claim this confirmation.", false, 500);
  }

  // Fire the workflow
  const wf = logRow.dispatch_workflows;
  const result = await fireGitHubWorkflow(
    GITHUB_REPO,
    GITHUB_TOKEN,
    wf.workflow_file,
    wf.ref,
    (logRow.inputs as Record<string, string>) ?? {},
  );

  await admin
    .from("dispatch_log")
    .update({
      status: result.ok ? "dispatched" : "failed",
      github_status_code: result.status,
      github_response: result.body.slice(0, 2000),
      dispatched_at: result.ok ? new Date().toISOString() : null,
      error_message: result.ok ? null : `GitHub returned ${result.status}`,
      confirmed_by_sentinel_id: confirmation.sentinel_id,
    })
    .eq("id", logRow.id);

  const sentinelName =
    (confirmation as { sovereignty_sentinels?: { name?: string } }).sovereignty_sentinels?.name ??
    "Sentinel";

  if (result.ok) {
    return respondHtml(
      "Sovereign Transfer Authorized",
      `Thank you, ${sentinelName}. Workflow "${wf.display_name}" has been dispatched.`,
      true,
    );
  }
  return respondHtml(
    "Dispatch Failed",
    `Confirmation accepted, but GitHub rejected the workflow (status ${result.status}).`,
    false,
    502,
  );
});
