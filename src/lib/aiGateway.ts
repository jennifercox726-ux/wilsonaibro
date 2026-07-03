// src/lib/aiGateway.ts - Sovereign AI Router (direct provider calls)
import { toast } from "sonner";

const PROVIDERS = {
  grok: {
    url: "https://api.x.ai/v1/chat/completions",
    keyEnv: "VITE_GROK_API_KEY",
    defaultModel: "grok-beta"
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    keyEnv: "VITE_OPENAI_API_KEY",
    defaultModel: "gpt-4o"
  },
};

export async function streamSovereignChat({
  messages,
  onDelta,
  onDone,
  model = "grok-beta",
  provider = "grok",
}: {
  messages: Array<{ role: string; content: string }>;
  onDelta: (delta: string) => void;
  onDone: () => void;
  model?: string;
  provider?: string;
}) {
  const config = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!config) throw new Error("Unknown provider");

  const apiKey = import.meta.env[config.keyEnv];
  if (!apiKey) {
    toast.error(`Missing ${config.keyEnv} in .env — add it and restart dev server`);
    throw new Error("No API key");
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || config.defaultModel,
        messages,
        stream: true,
        temperature: 0.85,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        toast.error("Rate limited — falling back to OpenAI...");
        return streamSovereignChat({ messages, onDelta, onDone, provider: "openai" });
      }
      throw new Error(`Gateway error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ") && !line.includes("[DONE]")) {
          try {
            const parsed = JSON.parse(line.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) onDelta(delta);
          } catch (e) {}
        }
      }
    }
    onDone();
  } catch (error) {
    console.error("Sovereign chat error:", error);
    toast.error("Wilson hit a snag — retrying...");
    onDone();
  }
}
