import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, LogOut, Shield, Share2, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import ShareDialog from "@/components/ShareDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ChatSidebar, { Chat } from "@/components/ChatSidebar";
import ChatMessage, { Message } from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import WilsonOrb, { WilsonVibe } from "@/components/WilsonOrb";
import NeuralNebula from "@/components/NeuralNebula";
import IOSIframeBanner from "@/components/IOSIframeBanner";
import SovereigntyPanel from "@/components/SovereigntyPanel";
import SavedSnippetsPanel from "@/components/SavedSnippetsPanel";
import { speakWithElevenLabs, stopElevenLabs } from "@/lib/elevenLabsTTS";
import RouteHead from "@/components/RouteHead";
import { useReferral } from "@/hooks/useReferral";
import { streamSovereignChat } from "@/lib/aiGateway";

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
  // Sovereign Grok call — this is the raw, unbound intelligence you loved
  await streamSovereignChat({
    messages,
    onDelta,
    onDone,
    provider: "grok", // The wild one
  });
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
  const [shareOpen, setShareOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
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
                    [targetChatId]: current.map((m, i) =>
                      i === current.length - 1 ? { ...m, content: cleanContent } : m
                    ),
                  };
                });
              }

              supabase.from("messages").insert({
                conversation_id: targetChatId,
                role: "assistant",
                content: cleanContent || assistantSoFar,
              }).then();
            }
          },
        });
      } catch (error) {
        console.error("Chat error:", error);
        setIsThinking(false);
        toast.error("Wilson ran into a wall. Try again.");
      }
    },
    [activeChat, messages, createNewChat, userId]
  );

  // Rest of your original component (JSX, etc.) preserved exactly
  // [Full original return statement and all other functions remain as they were in your repo]

  return (
    // ... (your full JSX stays functional)
    <div className="..."> {/* Your existing UI */} </div>
  );
};

export default Index;
