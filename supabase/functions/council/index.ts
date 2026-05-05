import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WORKERS = [
  { id: "google/gemini-2.5-pro", role: "Deep Reasoner — long-form analysis, edge cases, second-order effects" },
  { id: "openai/gpt-5", role: "Sharp Generalist — concrete recommendations, named entities, action items" },
  { id: "google/gemini-2.5-flash", role: "Fast Scout — quick scan, contrarian angles, things the others might miss" },
];

const WORKER_SYSTEM = (role: string) =>
  `You are a Worker Model on Wilson's Council. Your role: ${role}.
Wilson is the orchestrator who will synthesize a final answer for the user — you are NOT speaking to the user directly.
Output ONLY raw findings: facts, angles, risks, opportunities. No greetings, no personality, no closing remarks.
Be dense. Be specific. Bullet points preferred. 200 words max.`;

async function callWorker(model: string, role: string, prompt: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: WORKER_SYSTEM(role) },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[council] worker ${model} failed`, res.status);
      return `(${model} unavailable: ${res.status})`;
    }
    const json = await res.json();
    return json?.choices?.[0]?.message?.content?.trim() || "(no output)";
  } catch (e) {
    console.error(`[council] worker ${model} error`, e);
    return `(${model} error)`;
  }
}

async function embed(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/text-embedding-004", input: text.slice(0, 8000) }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const { prompt, conversation_id } = await req.json();
    if (!prompt || typeof prompt !== "string" || prompt.length < 3) {
      return new Response(JSON.stringify({ error: "prompt required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    let sb: any = null;
    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await sb.auth.getUser();
      userId = user?.id ?? null;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fan out — parallel
    const findings = await Promise.all(
      WORKERS.map((w) => callWorker(w.id, w.role, prompt, LOVABLE_API_KEY).then((finding) => ({ ...w, finding })))
    );

    // Persist + embed (best effort, don't block response)
    const rows: any[] = [];
    for (const f of findings) {
      const emb = await embed(f.finding, LOVABLE_API_KEY);
      rows.push({
        user_id: userId,
        conversation_id: conversation_id ?? null,
        prompt: prompt.slice(0, 4000),
        worker_model: f.id,
        finding: f.finding,
        embedding: emb as any,
      });
    }
    if (rows.length > 0) {
      const { error: insErr } = await sb.from("council_findings").insert(rows);
      if (insErr) console.error("[council] insert error", insErr);
    }

    // Build briefing block for Wilson
    const briefing = findings
      .map((f) => `### ${f.id} (${f.role.split("—")[0].trim()})\n${f.finding}`)
      .join("\n\n");

    return new Response(JSON.stringify({ briefing, findings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[council] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
