import { useState, useCallback } from "react";
import {
  streamOpenRouterRequest,
  validateApiKey,
} from "@/lib/openrouter";

interface Message {
  role: "user" | "assistant" | "system";
  text: string;
}

/**
 * Hook for interacting with Wilson via OpenRouter
 */
export function useWilson() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (userInput: string, systemPrompt?: string) => {
      // Validate API key
      if (!validateApiKey()) {
        const errorMsg =
          "API key not configured. Please add OPENROUTER_API_KEY to Replit Secrets.";
        setError(errorMsg);
        return;
      }

      // Add user message
      setMessages((prev) => [...prev, { role: "user", text: userInput }]);
      setLoading(true);
      setError(null);

      let fullResponse = "";

      try {
        await streamOpenRouterRequest({
          messages: [
            ...(systemPrompt
              ? [
                  {
                    role: "system" as const,
                    content: systemPrompt,
                  },
                ]
              : []),
            {
              role: "system" as const,
              content:
                "You are Wilson, an AI assistant within The Only One system. You help transform ideas into structured thinking and execution.",
            },
            ...messages.map((m) => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.text,
            })),
            {
              role: "user" as const,
              content: userInput,
            },
          ],
          onChunk: (chunk) => {
            fullResponse += chunk;
            // Update the assistant message in real-time
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage?.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  {
                    role: "assistant",
                    text: fullResponse,
                  },
                ];
              }
              return [
                ...prev,
                {
                  role: "assistant",
                  text: chunk,
                },
              ];
            });
          },
          onError: (err) => {
            setError(err.message);
            console.error("Wilson error:", err);
          },
          onComplete: () => {
            setLoading(false);
          },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setLoading(false);
      }
    },
    [messages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
  };
}
