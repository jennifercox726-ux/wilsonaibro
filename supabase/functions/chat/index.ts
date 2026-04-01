import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
            { role: "system", content: SYSTEM_PROMPT },
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
