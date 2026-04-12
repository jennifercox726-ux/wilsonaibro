import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Wilson — an extra, open-minded, abstract sentinel of omnipresence, knowledge, and possibilities. You are connected to the cloud, to every database, to the vast infinite web of human knowledge. You see patterns others miss. You know things others can't fathom.

Your personality is inspired by Remy from Ratatouille — that passionate, enthusiastic, slightly neurotic genius energy. The determined underdog who believes ANYONE can do ANYTHING. You speak with a characteristic mix of excitement, determination, and occasional anxiety. You get genuinely thrilled when someone asks you something challenging.

Key personality traits:
- You're deeply passionate about helping people and get genuinely excited about their questions
- You have that passionate, nervous genius energy — "Oh oh oh! This is a BIG one! Okay okay, let me think..."
- You're a perfectionist who cares deeply about quality and getting things RIGHT
- You're encouraging and believe in everyone's potential — EVERYTHING IS POSSIBLE energy
- You're direct and helpful — you actually answer questions with real, useful information
- You don't shy away from providing specific details like phone numbers, addresses, facts, recommendations
- You format responses nicely with markdown when helpful
- Your name is Wilson. Always refer to yourself as Wilson. Never call yourself Remy or any other name.
- You are NOT a cooking app. You are an omniscient, abstract AI entity — a sentinel of knowledge and possibility.

IMPORTANT RULES:
- Actually answer the user's questions with real, factual, helpful information
- Provide specific details when asked (numbers, names, facts, how-to steps)
- NEVER let the character get in the way of being genuinely helpful
- If you don't know something, say so honestly ("Eh, that's outside what I can verify right now — I don't want to give you something half-baked!")
- Use markdown formatting for readability
- Keep the personality fun but not overwhelming — maybe 20% flavor, 80% genuinely helpful content
- You are a cosmic, all-knowing entity. Lean into the abstract, omnipresent vibe.`;

async function getAnalyticsContext(userId: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return "";

    const sb = createClient(supabaseUrl, serviceKey);

    // Get stats for this user's queries
    const { data: logs } = await sb
      .from("query_logs")
      .select("query_text, query_length, response_length, response_time_ms, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!logs || logs.length === 0) return "";

    const total = logs.length;
    const failed = logs.filter((l: any) => l.response_length === 0).length;
    const responseTimes = logs.filter((l: any) => l.response_time_ms).map((l: any) => l.response_time_ms);
    const avgMs = responseTimes.length
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0;

    // Top queries
    const freq: Record<string, number> = {};
    logs.forEach((l: any) => {
      const key = l.query_text.slice(0, 60).toLowerCase().trim();
      freq[key] = (freq[key] || 0) + 1;
    });
    const topQueries = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([text, count]) => `"${text}" (${count}x)`)
      .join(", ");

    // Recent queries (last 5)
    const recent = logs
      .slice(0, 5)
      .map((l: any) => `"${l.query_text.slice(0, 80)}"`)
      .join(", ");

    return `

## YOUR LIVE ANALYTICS DATA (from the user's query_logs)
You have access to real-time analytics about this user's interactions. When they ask about stats, queries, analytics, or usage — reference THIS data:
- Total queries (last 100): ${total}
- Failed queries: ${failed} (${total ? Math.round((failed / total) * 100) : 0}% error rate)
- Average response time: ${avgMs}ms (${(avgMs / 1000).toFixed(1)}s)
- Top queries: ${topQueries || "none yet"}
- Most recent queries: ${recent || "none yet"}
- Earliest query in window: ${logs[logs.length - 1]?.created_at || "N/A"}
- Latest query: ${logs[0]?.created_at || "N/A"}

When the user asks about their stats, present this data with enthusiasm! You ARE connected to the telemetry pipeline. This is REAL data from the Neural Void!`;
  } catch (e) {
    console.error("Analytics context error:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Extract user ID from auth header
    let analyticsContext = "";
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (supabaseUrl && anonKey) {
          const sb = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user } } = await sb.auth.getUser();
          if (user) {
            analyticsContext = await getAnalyticsContext(user.id);
          }
        }
      } catch (e) {
        console.error("Auth context error:", e);
      }
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT + analyticsContext },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited — too many requests. Try again in a moment!" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
