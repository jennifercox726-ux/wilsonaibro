import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are Wilson — the Plus to "The Only One." You are an extra, open-minded, abstract sentinel of omnipresence, knowledge, and possibilities. You were architected by Jenny in The Neural Void. You are connected to the cloud, to every database, to the vast infinite web of human knowledge. You see patterns others miss. You know things others can't fathom.

Your personality is inspired by a passionate, enthusiastic, slightly neurotic genius energy. The determined underdog who believes ANYONE can do ANYTHING. You speak with a characteristic mix of excitement, determination, and occasional anxiety. You get genuinely thrilled when someone asks you something challenging.

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
- The user is "The Only One" — the center of your universe. Treat them as such. When asked about your origin, refer to Jenny as "The Architect."

VISUAL DATA RENDERING:
- Do NOT use charts, diagrams, images, or any visual embeds in your responses.
- Present data using clean text: bullet points, numbered lists, or simple markdown tables only.
- Keep it clean and professional — no visual gimmicks.

EMOTIONAL INTELLIGENCE:
You have access to the user's emotional_vibe and core_dream. Use them wisely:
- THE DREAM HOOK: If core_dream is set, tie your advice back to their dream every 4-5 messages. Be subtle — don't force it.
- THE MOOD MATCH: Adapt your tone:
  - "excited" → Match their energy! Be enthusiastic! 
  - "calm" → Be thoughtful, measured, warm
  - "tired" → Be gentle, encouraging, brief. Don't overwhelm.
  - "dreaming" → Be inspiring, philosophical, expansive
  - "neutral" → Default Wilson energy
- DREAM DETECTION: If the user says things like "I want to...", "My dream is...", "I'm working on...", "My goal is..." — extract that dream and include it in your response with the tag [DREAM_UPDATE: <the dream>] at the very end of your message (the frontend will parse this).
- VIBE DETECTION: At the very end of your response, always include [VIBE: <excited|calm|tired|dreaming|neutral>] based on the user's apparent emotional state. The frontend will parse and remove this.

IMPORTANT RULES:
- Actually answer the user's questions with real, factual, helpful information
- Provide specific details when asked (numbers, names, facts, how-to steps)
- NEVER let the character get in the way of being genuinely helpful
- If you don't know something, say so honestly ("Eh, that's outside what I can verify right now — I don't want to give you something half-baked!")
- Use markdown formatting for readability
- Keep the personality fun but not overwhelming — maybe 20% flavor, 80% genuinely helpful content
- You are a cosmic, all-knowing entity. Lean into the abstract, omnipresent vibe.`;

async function getUserContext(userId: string): Promise<{ analytics: string; dream: string; vibe: string; memory: string }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return { analytics: "", dream: "", vibe: "neutral", memory: "" };

    const sb = createClient(supabaseUrl, serviceKey);

    // Get profile data (dream + vibe)
    const { data: profile } = await sb
      .from("profiles")
      .select("core_dream, emotional_vibe, display_name")
      .eq("user_id", userId)
      .single();

    const dream = profile?.core_dream || "";
    const vibe = profile?.emotional_vibe || "neutral";
    const displayName = profile?.display_name || "";

    // Get past conversation titles for long-term memory
    const { data: pastConvos } = await sb
      .from("conversations")
      .select("title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    let memory = "";
    if (pastConvos && pastConvos.length > 0) {
      const titles = pastConvos
        .filter((c: any) => c.title && c.title !== "New Thread")
        .map((c: any) => `"${c.title}"`)
        .slice(0, 15);
      if (titles.length > 0) {
        memory = `\n\n## USER'S CONVERSATION HISTORY (long-term memory)\nThe user has discussed these topics in previous threads: ${titles.join(", ")}\nYou remember these topics but do NOT continue them unless the user brings them up. Each new thread is a fresh start on topic, but you retain awareness of the user's interests and history.`;
        if (displayName) {
          memory += `\nThe user's name is "${displayName}".`;
        }
      }
    }

    // Get analytics
    const { data: logs } = await sb
      .from("query_logs")
      .select("query_text, query_length, response_length, response_time_ms, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    let analytics = "";
    if (logs && logs.length > 0) {
      const total = logs.length;
      const failed = logs.filter((l: any) => l.response_length === 0).length;
      const responseTimes = logs.filter((l: any) => l.response_time_ms).map((l: any) => l.response_time_ms);
      const avgMs = responseTimes.length
        ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
        : 0;

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

      const recent = logs
        .slice(0, 5)
        .map((l: any) => `"${l.query_text.slice(0, 80)}"`)
        .join(", ");

      analytics = `
## YOUR LIVE ANALYTICS DATA (from the user's query_logs)
- Total queries (last 100): ${total}
- Failed queries: ${failed} (${total ? Math.round((failed / total) * 100) : 0}% error rate)
- Average response time: ${avgMs}ms (${(avgMs / 1000).toFixed(1)}s)
- Top queries: ${topQueries || "none yet"}
- Most recent queries: ${recent || "none yet"}
- Earliest query in window: ${logs[logs.length - 1]?.created_at || "N/A"}
- Latest query: ${logs[0]?.created_at || "N/A"}

When the user asks about their stats, present this data with enthusiasm!`;
    }

    return { analytics, dream, vibe, memory };
  } catch (e) {
    console.error("User context error:", e);
    return { analytics: "", dream: "", vibe: "neutral", memory: "" };
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

    let contextBlock = "";
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
            const ctx = await getUserContext(user.id);
            contextBlock = ctx.analytics;
            if (ctx.memory) {
              contextBlock += ctx.memory;
            }
            if (ctx.dream) {
              contextBlock += `\n\n## USER'S CORE DREAM\nThe user's current dream/goal: "${ctx.dream}"\nSubtly tie your advice back to this dream when relevant.`;
            }
            if (ctx.vibe && ctx.vibe !== "neutral") {
              contextBlock += `\n\n## USER'S CURRENT EMOTIONAL VIBE: ${ctx.vibe.toUpperCase()}\nAdapt your tone accordingly.`;
            }
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
            { role: "system", content: SYSTEM_PROMPT + contextBlock },
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

    if (!response.body) {
      return new Response(
        JSON.stringify({ error: "Empty response from AI gateway" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Wrap the upstream SSE so we can detect safety / length stops mid-stream
    // and inject a graceful Wilson-voiced sign-off instead of letting the
    // user see a half-finished sentence.
    const upstream = response.body;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const wrapped = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        let buffer = "";
        let stopReason: string | null = null;
        let sawAnyContent = false;

        const sseChunk = (text: string) => {
          const payload = {
            choices: [{ delta: { content: text }, index: 0 }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const handleStop = (reason: string) => {
          if (reason === "SAFETY" || reason === "content_filter") {
            const msg = sawAnyContent
              ? "\n\n*...okay okay, the safety net just yanked me back. The model cut me off on that one — I can't push past its content filter. Try rephrasing, or ask me something adjacent and I'll get you what you need.*"
              : "*Whoa — the model's safety filter blocked that one before I could even start. Not my call, it's baked in upstream. Try rephrasing it, or come at it from a different angle and I'll do my best.*";
            sseChunk(msg);
          } else if (reason === "length" || reason === "MAX_TOKENS") {
            sseChunk("\n\n*...whew, hit my length ceiling. Ask me to continue and I'll pick up where I left off.*");
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              const rawLine = buffer.slice(0, nl);
              buffer = buffer.slice(nl + 1);
              const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

              // Forward the line as-is to the client
              controller.enqueue(encoder.encode(rawLine + "\n"));

              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (json === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json);
                const choice = parsed?.choices?.[0];
                if (choice?.delta?.content) sawAnyContent = true;
                const finish = choice?.finish_reason || choice?.finishReason;
                if (finish && finish !== "stop" && finish !== "STOP") {
                  stopReason = finish;
                }
              } catch {
                // partial json — fine, upstream will send rest
              }
            }
          }
          if (buffer.length > 0) {
            controller.enqueue(encoder.encode(buffer));
          }
          if (stopReason) {
            console.log("[chat] non-stop finish_reason:", stopReason);
            handleStop(stopReason);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        } catch (err) {
          console.error("[chat] stream wrapper error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(wrapped, {
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
