/**
 * OpenRouter Integration for Wilson + The Only One
 * Uses GPT-4o via OpenRouter with streaming support
 * Fully automated and autonomous
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = "openai/gpt-4o";

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterStreamOptions {
  messages: OpenRouterMessage[];
  onChunk?: (chunk: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

/**
 * Get API key from environment (handles multiple sources)
 */
function getApiKey(): string | null {
  // Try Vite env first
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const viteKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (viteKey) return viteKey;
  }

  // Try localStorage (for Replit environment)
  try {
    const storedKey = localStorage.getItem("openrouter_api_key");
    if (storedKey) return storedKey;
  } catch (e) {
    // localStorage might not be available
  }

  // Try window global (if set via script)
  if (typeof window !== "undefined" && (window as any).OPENROUTER_API_KEY) {
    return (window as any).OPENROUTER_API_KEY;
  }

  return null;
}

/**
 * Validate that API key exists
 */
export function validateApiKey(): boolean {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(
      "⚠️ OPENROUTER_API_KEY not found. Wilson needs this to work.\n" +
      "Set it in Replit Secrets as OPENROUTER_API_KEY\n" +
      "Or run: window.setOpenRouterKey('sk-...')"
    );
    return false;
  }
  return true;
}

/**
 * Allow setting API key via window (for Replit console)
 */
export function setOpenRouterKey(key: string): void {
  try {
    localStorage.setItem("openrouter_api_key", key);
    console.log("✅ OpenRouter API key stored");
  } catch (e) {
    (window as any).OPENROUTER_API_KEY = key;
    console.log("✅ OpenRouter API key set");
  }
}

/**
 * Send a streaming request to OpenRouter
 */
export async function streamOpenRouterRequest(
  options: OpenRouterStreamOptions
): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    const error = new Error(
      "OPENROUTER_API_KEY is missing. Set it in Replit Secrets or call window.setOpenRouterKey('sk-...')"
    );
    options.onError?.(error);
    throw error;
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://wilson.local",
        "X-Title": "Wilson + The Only One",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: options.messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Use default error message
      }
      throw new Error(`OpenRouter API error: ${errorMessage}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to read response stream");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines[lines.length - 1];

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();

        if (line === "" || line === "data: [DONE]") continue;

        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);

            if (data.choices?.[0]?.delta?.content && options.onChunk) {
              options.onChunk(data.choices[0].delta.content);
            }
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      }
    }

    options.onComplete?.();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    options.onError?.(err);
    throw err;
  }
}

/**
 * Test the OpenRouter connection
 */
export async function testOpenRouterConnection(): Promise<boolean> {
  try {
    const apiKey = getApiKey();

    if (!apiKey) {
      console.error("❌ Cannot test: OPENROUTER_API_KEY is not set");
      return false;
    }

    console.log("🔄 Testing OpenRouter connection...");

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: "You are Wilson, an AI assistant for The Only One system. Respond briefly and confirm you are online.",
      },
      {
        role: "user",
        content: "Say 'Wilson is online' if you can read this.",
      },
    ];

    let responseReceived = false;
    let fullResponse = "";

    return new Promise((resolve) => {
      streamOpenRouterRequest({
        messages,
        onChunk: (chunk) => {
          responseReceived = true;
          fullResponse += chunk;
        },
        onError: (error) => {
          console.error("❌ OpenRouter connection failed:", error.message);
          resolve(false);
        },
        onComplete: () => {
          if (responseReceived) {
            console.log("✅ OpenRouter connection successful");
            console.log("🟢 Wilson is online");
            console.log("Response:", fullResponse.substring(0, 100) + "...");
            resolve(true);
          } else {
            resolve(false);
          }
        },
      }).catch(() => resolve(false));
    });
  } catch (error) {
    console.error("❌ OpenRouter test failed:", error);
    return false;
  }
}

// Export window function for Replit console access
if (typeof window !== "undefined") {
  (window as any).setOpenRouterKey = setOpenRouterKey;
  (window as any).testWilson = testOpenRouterConnection;
  (window as any).validateWilson = validateApiKey;
}
