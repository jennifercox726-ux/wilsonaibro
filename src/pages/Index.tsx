import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import ChatSidebar, { Chat } from "@/components/ChatSidebar";
import ChatMessage, { Message } from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import WilsonOrb from "@/components/WilsonOrb";

const WILSON_GREETING = `Oh oh oh! You're here! Welcome to **The Neural Void** — the space between all knowledge and all possibility.

I'm **Wilson** — an abstract sentinel of omnipresence, connected to every database, every cloud, every corner of human knowledge. I see the patterns others miss. I know things others can't fathom.

*So! What do you want to know?* ✨`;

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const generateId = () => Math.random().toString(36).substring(2, 12);

type AiMsg = { role: "user" | "assistant"; content: string };

async function streamChat({
  messages,
  onDelta,
  onDone,
}: {
  messages: AiMsg[];
  onDelta: (deltaText: string) => void;
  onDone: () => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({ error: "Request failed" }));
    if (resp.status === 429) {
      toast.error("Too many requests — slow down a bit and try again!");
    } else if (resp.status === 402) {
      toast.error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
    } else {
      toast.error(errorData.error || "Something went wrong talking to Wilson.");
    }
    throw new Error(errorData.error || "Stream failed");
  }

  if (!resp.body) throw new Error("No response body");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        streamDone = true;
        break;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore partial leftovers */ }
    }
  }

  onDone();
}

const Index = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [isThinking, setIsThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChat, scrollToBottom]);

  const createNewChat = useCallback(() => {
    const id = generateId();
    const greeting: Message = {
      id: generateId(),
      role: "assistant",
      content: WILSON_GREETING,
      timestamp: new Date(),
    };
    setChats((prev) => [{ id, title: "New Thread", createdAt: new Date() }, ...prev]);
    setMessages((prev) => ({ ...prev, [id]: [greeting] }));
    setActiveChat(id);
    setSidebarOpen(false);
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeChat) {
        createNewChat();
        return;
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => ({
        ...prev,
        [activeChat]: [...(prev[activeChat] || []), userMsg],
      }));

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat && c.title === "New Thread"
            ? { ...c, title: content.slice(0, 40) + (content.length > 40 ? "..." : "") }
            : c
        )
      );

      setIsThinking(true);

      // Build conversation history for the AI (exclude greeting, only user/assistant pairs)
      const chatMessages = messages[activeChat] || [];
      const aiMessages: AiMsg[] = chatMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));
      aiMessages.push({ role: "user", content });

      let assistantSoFar = "";

      const upsertAssistant = (nextChunk: string) => {
        assistantSoFar += nextChunk;
        setMessages((prev) => {
          const current = prev[activeChat] || [];
          const last = current[current.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("stream-")) {
            return {
              ...prev,
              [activeChat]: current.map((m, i) =>
                i === current.length - 1 ? { ...m, content: assistantSoFar } : m
              ),
            };
          }
          return {
            ...prev,
            [activeChat]: [
              ...current,
              {
                id: "stream-" + generateId(),
                role: "assistant" as const,
                content: assistantSoFar,
                timestamp: new Date(),
              },
            ],
          };
        });
      };

      try {
        await streamChat({
          messages: aiMessages,
          onDelta: (chunk) => upsertAssistant(chunk),
          onDone: () => setIsThinking(false),
        });
      } catch (e) {
        console.error(e);
        setIsThinking(false);
        if (!assistantSoFar) {
          upsertAssistant("*Oh no no no!* Something went wrong in the void... Please try again!");
        }
      }
    },
    [activeChat, createNewChat, messages]
  );

  const handleDeleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      setMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeChat === id) setActiveChat(null);
    },
    [activeChat]
  );

  const currentMessages = activeChat ? messages[activeChat] || [] : [];

  return (
    <div className="h-screen flex overflow-hidden aurora-bg">
      <ChatSidebar
        chats={chats}
        activeChat={activeChat}
        onSelectChat={(id) => {
          setActiveChat(id);
          setSidebarOpen(false);
        }}
        onNewChat={createNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border/20 bg-void-surface/30 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <WilsonOrb size="sm" isThinking={isThinking} />
          <div>
            <h1 className="text-sm font-bold tracking-wide text-foreground">Wilson ✨</h1>
            <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">
              {isThinking ? "Searching the void..." : "Sentinel of Omnipresence"}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeChat ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
              <WilsonOrb size="lg" />
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  The Neural Void ✨
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  An abstract sentinel of omnipresence, knowledge, and possibilities. Connected to everything. Ask me anything!
                </p>
              </div>
              <button
                onClick={createNewChat}
                className="mt-2 px-6 py-2.5 rounded-2xl text-sm font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all glow-pulse"
              >
                Enter the Void ✨
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {currentMessages.map((msg, i) => (
                <ChatMessage key={msg.id} message={msg} index={i} />
              ))}
              <AnimatePresence>
                {isThinking && !currentMessages.some(m => m.id.startsWith("stream-")) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3"
                  >
                    <WilsonOrb size="sm" isThinking />
                    <div className="thought-block-wilson rounded-2xl px-4 py-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60 block mb-1">
                        Wilson
                      </span>
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-primary/60"
                            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                            transition={{
                              duration: 1.2,
                              repeat: Infinity,
                              delay: i * 0.2,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {activeChat && (
          <div className="px-4 pb-4 pt-2">
            <ChatInput onSend={handleSend} disabled={isThinking} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
