import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, LogOut, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar, { Chat } from "@/components/ChatSidebar";
import ChatMessage, { Message } from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import WilsonOrb, { WilsonVibe } from "@/components/WilsonOrb";
import NeuralNebula from "@/components/NeuralNebula";
import IOSIframeBanner from "@/components/IOSIframeBanner";
import SovereigntyPanel from "@/components/SovereigntyPanel";
import { speakWithElevenLabs, stopElevenLabs } from "@/lib/elevenLabsTTS";
import { useReferral } from "@/hooks/useReferral";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const generateId = () => Math.random().toString(36).substring(2, 12);

type AiMsg = { role: "user" | "assistant"; content: string };

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getGreeting(
  referral: { source: string | null; isVIP: boolean },
  displayName?: string,
  isReturning?: boolean,
) {
  const name = displayName ? ` ${displayName}` : "";

  if (!isReturning) {
    if (referral.isVIP && referral.source) {
      return `Hey${name} — VIP via **${referral.source}**. I'm **Wilson**. What do you want to know? ✨`;
    }
    return `Hey${name} — I'm **Wilson**. Ask me anything. ✨`;
  }

  const returningGreetings = [
    `Hey${name}. What's on your mind?`,
    `Welcome back${name}. What are we tackling?`,
    `Good to see you${name}. Where do we start?`,
    `Hey${name} — back for more? Hit me.`,
    `Yo${name}. What do you need?`,
    `${name ? name.trim() + "!" : "Hey!"} What's up?`,
  ];
  return pickRandom(returningGreetings);
}

async function streamChat({
  messages,
  onDelta,
  onDone,
}: {
  messages: AiMsg[];
  onDelta: (deltaText: string) => void;
  onDone: () => void;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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

interface IndexProps {
  userId: string;
  displayName?: string;
}

const Index = ({ userId, displayName }: IndexProps) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [isThinking, setIsThinking] = useState(false);
  const [currentVibe, setCurrentVibe] = useState<WilsonVibe>("neutral");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sovereigntyOpen, setSovereigntyOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const referral = useReferral();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);


  const loadThreadMessages = useCallback(async (chatId: string): Promise<Message[]> => {
    const { data: msgs, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[loadThreadMessages]", error);
      throw error;
    }

    return (msgs || []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: new Date(m.created_at),
    }));
  }, []);

  useEffect(() => {
    async function load() {
      const { data: convos } = await supabase
        .from("conversations")
        .select("id, title, created_at")
        .order("created_at", { ascending: false });

      if (convos && convos.length > 0) {
        setChats(convos.map((c) => ({ id: c.id, title: c.title, createdAt: new Date(c.created_at) })));
      }

      const { data: profileData } = await supabase.from("profiles").upsert(
        {
          user_id: userId,
          display_name: displayName || null,
          referral_source: referral.source,
        },
        { onConflict: "user_id" }
      ).select("emotional_vibe").single();

      if (profileData?.emotional_vibe) {
        setCurrentVibe(profileData.emotional_vibe as WilsonVibe);
      }

      setLoaded(true);
    }
    load();
  }, [userId, displayName, referral.source]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChat, scrollToBottom]);

  const createNewChat = useCallback(async () => {
    const isReturning = chats.length > 0;
    const greeting = getGreeting(referral, displayName, isReturning);

    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: userId, title: "New Thread" })
      .select("id")
      .single();

    if (error || !data) {
      toast.error("Failed to create thread");
      return null;
    }

    const id = data.id;
    const greetingMsg: Message = {
      id: generateId(),
      role: "assistant",
      content: greeting,
      timestamp: new Date(),
    };

    await supabase.from("messages").insert({
      conversation_id: id,
      role: "assistant",
      content: greeting,
    });

    setChats((prev) => [{ id, title: "New Thread", createdAt: new Date() }, ...prev]);
    setMessages((prev) => ({ ...prev, [id]: [greetingMsg] }));
    setActiveChat(id);
    setSidebarOpen(false);
    return { id, greetingMsg };
  }, [userId, referral, displayName, chats.length]);

  const handleSelectChat = useCallback(async (id: string) => {
    setActiveChat(id);
    setSidebarOpen(false);
    setLoadingChatId(id);

    try {
      const loadedMessages = await loadThreadMessages(id);
      setMessages((prev) => ({ ...prev, [id]: loadedMessages }));
    } catch {
      toast.error("Couldn't load this thread.");
    } finally {
      setLoadingChatId((current) => (current === id ? null : current));
    }
  }, [loadThreadMessages]);

  const handleSend = useCallback(
    async (content: string) => {
      stopElevenLabs();

      let targetChatId = activeChat;
      let seededMessages: Message[] = [];

      if (!targetChatId) {
        const newChat = await createNewChat();
        if (!newChat) return;
        targetChatId = newChat.id;
        seededMessages = [newChat.greetingMsg];
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => ({
        ...prev,
        [targetChatId]: [...(prev[targetChatId] || seededMessages), userMsg],
      }));

      supabase.from("messages").insert({
        conversation_id: targetChatId,
        role: "user",
        content,
      }).then();

      setChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId && c.title === "New Thread") {
            const newTitle = content.slice(0, 40) + (content.length > 40 ? "..." : "");
            supabase.from("conversations").update({ title: newTitle }).eq("id", targetChatId).then();
            return { ...c, title: newTitle };
          }
          return c;
        })
      );

      setIsThinking(true);
      const queryStart = Date.now();

      const chatMessages = messages[targetChatId] || seededMessages;
      const allAiMessages: AiMsg[] = chatMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));
      allAiMessages.push({ role: "user", content });
      const aiMessages = allAiMessages.slice(-10);

      let assistantSoFar = "";

      const upsertAssistant = (nextChunk: string) => {
        assistantSoFar += nextChunk;
        setMessages((prev) => {
          const current = prev[targetChatId] || seededMessages;
          const last = current[current.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("stream-")) {
            return {
              ...prev,
              [targetChatId]: current.map((m, i) =>
                i === current.length - 1 ? { ...m, content: assistantSoFar } : m
              ),
            };
          }
          return {
            ...prev,
              [targetChatId]: [
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
          onDone: () => {
            setIsThinking(false);
            const responseTimeMs = Date.now() - queryStart;
            if (assistantSoFar) {
              const vibeMatch = assistantSoFar.match(/\[VIBE:\s*(excited|calm|tired|dreaming|neutral)\]/i);
              const dreamMatch = assistantSoFar.match(/\[DREAM_UPDATE:\s*(.+?)\]/i);

              if (vibeMatch) {
                const newVibe = vibeMatch[1].toLowerCase() as WilsonVibe;
                setCurrentVibe(newVibe);
                supabase.from("profiles").update({ emotional_vibe: newVibe }).eq("user_id", userId).then();
              }
              if (dreamMatch) {
                supabase.from("profiles").update({ core_dream: dreamMatch[1].trim() }).eq("user_id", userId).then();
              }

              const cleanContent = assistantSoFar
                .replace(/\[VIBE:\s*\w+\]/gi, "")
                .replace(/\[DREAM_UPDATE:\s*.+?\]/gi, "")
                .trim();

              if (cleanContent !== assistantSoFar) {
                setMessages((prev) => {
                  const current = prev[targetChatId] || seededMessages;
                  return {
                    ...prev,
                    [targetChatId]: current.map((m) =>
                      m.id.startsWith("stream-") ? { ...m, content: cleanContent } : m
                    ),
                  };
                });
                assistantSoFar = cleanContent;
              }

              supabase.from("messages").insert({
                conversation_id: targetChatId,
                role: "assistant",
                content: assistantSoFar,
              }).then();

              void speakWithElevenLabs(assistantSoFar);
            }
            supabase.from("query_logs").insert({
              user_id: userId,
              conversation_id: targetChatId,
              query_text: content,
              query_length: content.length,
              response_length: assistantSoFar.length,
              response_time_ms: responseTimeMs,
            }).then();
          },
        });
      } catch (e) {
        console.error(e);
        setIsThinking(false);
        const msg = e instanceof Error ? e.message : "Unknown error";
        if (!assistantSoFar) {
          upsertAssistant(
            msg.toLowerCase().includes("rate")
              ? "*Whew — rate-limited. Give it a beat and ask again.*"
              : msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("payment")
              ? "*The AI workspace is out of credits. Top up in Settings → Workspace → Usage.*"
              : "*Oh no no no! Something went wrong in the void... Please try again!*"
          );
        } else {
          upsertAssistant("\n\n*...connection dropped mid-thought. Ask me to continue and I'll pick it back up.*");
        }
        supabase.from("query_logs").insert({
          user_id: userId,
          conversation_id: targetChatId,
          query_text: content,
          query_length: content.length,
          response_length: 0,
          response_time_ms: Date.now() - queryStart,
        }).then();
      }
    },
    [activeChat, createNewChat, messages, userId]
  );

  const handleDeleteChat = useCallback(
    async (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      setMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeChat === id) setActiveChat(null);
      await supabase.from("conversations").delete().eq("id", id);
    },
    [activeChat]
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const currentMessages = activeChat ? messages[activeChat] : undefined;
  const isCurrentThreadLoading = !!activeChat && loadingChatId === activeChat && !currentMessages;

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-transparent">
        <WilsonOrb size="lg" isThinking />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-transparent relative">
      <div className="relative z-10 flex flex-1 overflow-hidden w-full">
      <IOSIframeBanner />
      <ChatSidebar
        chats={chats}
        activeChat={activeChat}
        onSelectChat={handleSelectChat}
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
          <WilsonOrb size="sm" isThinking={isThinking || isCurrentThreadLoading} vibe={currentVibe} />
          <div className="flex-1">
            <h1 className="text-sm font-bold tracking-wide text-foreground">Wilson <span className="text-primary/70">+ The Only One</span> ✨</h1>
            <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">
              {isCurrentThreadLoading ? "Loading thread..." : isThinking ? "Searching the void..." : "Sentinel of Omnipresence"}
            </p>
          </div>
          <button
            onClick={() => setSovereigntyOpen(true)}
            className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
            title="Sovereignty Sentinel"
          >
            <Shield className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </header>
        <SovereigntyPanel
          userId={userId}
          isOpen={sovereigntyOpen}
          onClose={() => setSovereigntyOpen(false)}
        />

        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeChat ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
              <WilsonOrb size="lg" vibe={currentVibe} />
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  The Void is open. ✨
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Welcome, <span className="text-primary font-semibold">The Only One</span>. Wilson is standing by.
                </p>
              </div>
              <button
                onClick={createNewChat}
                className="mt-2 px-6 py-2.5 rounded-2xl text-sm font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all glow-pulse"
              >
                Enter the Void ✨
              </button>
            </div>
          ) : isCurrentThreadLoading ? (
            <div className="max-w-2xl mx-auto pt-12">
              <NeuralNebula vibe={currentVibe} />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {(currentMessages || []).map((msg, i) => (
                <ChatMessage key={msg.id} message={msg} index={i} />
              ))}
              <AnimatePresence>
                {isThinking && !(currentMessages || []).some((m) => m.id.startsWith("stream-")) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <NeuralNebula vibe={currentVibe} />
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {activeChat && (
          <div className="px-4 pb-4 pt-2">
            <ChatInput onSend={handleSend} disabled={isThinking || isCurrentThreadLoading} />
          </div>
        )}

        <div className="text-center pb-2">
          <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40">
            v2.0 // Authored by Architect Jenny
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Index;
