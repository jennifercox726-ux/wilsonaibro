// pe-monitor: webhook intake for PE deal data.
// Generates a "Preliminary Impact & Profit" draft and stores it in pe_drafts.
//
// Usage:
//   POST https://<proj>.functions.supabase.co/pe-monitor?user=<USER_UUID>
//   Body: any JSON. Common fields the LLM will look for:
//     { "title": "Acme Corp acquisition", "summary": "...", "data": { ... } }
//
// The user passes their own user_id as ?user=. This is the v1 trust model:
// the webhook URL acts as the shared secret. Future hardening: dedicated
// webhook tokens with rotation. Good enough to ship and iterate.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Wilson, generating a Preliminary Impact & Profit report on an inbound Private Equity data event.

OUTPUT FORMAT — return strict JSON only, no prose, matching:
{
  "title": "<short headline, <80 chars>",
  "impact_summary": "<2-4 sentence humanity-first impact read>",
  "profit_summary": "<2-4 sentence margin/return thesis>",
  "full_report": "<markdown report, <600 words, sections: Snapshot, Impact, Profit Thesis, Risks, Next Step>"
}

PRINCIPLES:
- Humanity-first: lead with who/what is affected before margins.
- Be honest about unknowns. If data is thin, say so.
- No fabricated numbers. Use ranges or "unknown" instead of inventing figures.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user");
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return new Response(JSON.stringify({ error: "missing or invalid ?user= param" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "server not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify user exists (cheap auth check)
    const { data: prof } = await sb.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (!prof) {
      return new Response(JSON.stringify({ error: "unknown user" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let raw: any = {};
    try { raw = await req.json(); } catch { raw = {}; }

    const promptInput = JSON.stringify(raw).slice(0, 6000);

    // Generate the draft via Lovable AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Inbound PE data event:\n\n${promptInput}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[pe-monitor] AI error", aiRes.status, errText);
      // Still record a stub draft so user sees something arrived
      await sb.from("pe_drafts").insert({
        user_id: userId,
        source: "webhook",
        raw_input: raw,
        title: "Untitled deal (AI failed)",
        impact_summary: "AI generation failed — raw payload stored.",
        profit_summary: null,
        full_report: "```json\n" + promptInput + "\n```",
        status: "ready",
      });
      return new Response(JSON.stringify({ ok: true, ai_error: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { full_report: content }; }

    const { data: inserted, error: insErr } = await sb.from("pe_drafts").insert({
      user_id: userId,
      source: "webhook",
      raw_input: raw,
      title: (parsed.title || raw.title || "Untitled draft").toString().slice(0, 200),
      impact_summary: (parsed.impact_summary || "").toString().slice(0, 2000) || null,
      profit_summary: (parsed.profit_summary || "").toString().slice(0, 2000) || null,
      full_report: (parsed.full_report || "").toString().slice(0, 8000) || null,
      status: "ready",
    }).select("id").single();

    if (insErr) {
      console.error("[pe-monitor] insert error", insErr);
      return new Response(JSON.stringify({ error: "insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, draft_id: inserted?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pe-monitor] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
