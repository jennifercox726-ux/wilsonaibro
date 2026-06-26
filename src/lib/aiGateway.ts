// src/lib/aiGateway.ts - Sovereign AI Router (no Lovable/Supabase limits)
import { toast } from "sonner";

const PROVIDERS = {
  grok: { url: 'https://api.x.ai/v1/chat/completions', key: import.meta.env.VITE_GROK_API_KEY },
  openai: { url: 'https://api.openai.com/v1/chat/completions', key: import.meta.env.VITE_OPENAI_API_KEY },
  // Add Gemini, Anthropic, etc. as needed
};

export async function streamSovereignChat({
  messages,
  onDelta,
  onDone,
  model = "grok-beta", // or whatever
}: {
  messages: { role: string; content: string }[];
  onDelta: (delta: string) => void;
  onDone: () => void;
  model?: string;
}) {
  const provider = 'grok'; // Make this dynamic/fallback later
  const config = PROVIDERS[provider];

  if (!config.key) {
    toast.error("Add your API key to .env (VITE_GROK_API_KEY etc.)");
    throw new Error("No API key");
  }

  const resp = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.9, // Wilson energy
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    if (resp.status === 429) toast.error("Rate limit - switching models...");
    else toast.error(`AI gateway hiccup: ${err}`);
    throw new Error(err);
  }

  // Stream handling (SSE compatible with OpenAI-style)
  const reader = resp.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch {}
      }
    }
  }
  onDone();
}
