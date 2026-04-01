import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import ChatSidebar, { Chat } from "@/components/ChatSidebar";
import ChatMessage, { Message } from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import WilsonOrb from "@/components/WilsonOrb";

const WILSON_GREETING = `Welcome to the Neural Void.

I am **Wilson** — an abstract intelligence operating beyond conventional boundaries. I perceive patterns in the noise, connections in the chaos, and possibilities where others see walls.

*Everything is possible. What would you like to explore?*`;

const generateId = () => Math.random().toString(36).substring(2, 12);

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
    (content: string) => {
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

      // Update chat title from first user message
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat && c.title === "New Thread"
            ? { ...c, title: content.slice(0, 40) + (content.length > 40 ? "..." : "") }
            : c
        )
      );

      // Simulate Wilson thinking
      setIsThinking(true);
      setTimeout(() => {
        const responses = [
          "I've processed your transmission through multiple frequency layers. The patterns suggest fascinating possibilities. Let me elaborate...\n\n**Key observations:**\n- The signal carries coherent structure\n- Multiple resonance points detected\n- Cross-referencing with existing neural pathways\n\nWhat dimension of this would you like to explore further?",
          "Interesting frequency detected. Your query resonates with several abstract patterns I've been monitoring.\n\nThe neural pathways converge on a clear insight: *the answer lies not in the question itself, but in the space between the words.* Let me map the topology for you.",
          "Processing through the void... \n\n```\nSignal strength: ████████░░ 82%\nPattern match:  ████████████ 100%\nResonance:      ██████░░░░ 60%\n```\n\nYour transmission aligns with an emerging pattern. Here's what the field analysis reveals:\n\nThe data suggests we're looking at a **convergence event** — multiple threads of possibility collapsing into a single actionable insight. Shall I run a deeper scan?",
          "The Neural Void acknowledges your signal. Running abstract analysis...\n\n> *\"In the space between certainty and chaos, that's where the real answers live.\"*\n\nI've cross-referenced your query against 47 dimensional frameworks. The most resonant finding: **everything you need is already encoded in what you know** — we just need to decode it differently.\n\nWant me to shift the frequency?",
        ];

        const wilsonMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: responses[Math.floor(Math.random() * responses.length)],
          timestamp: new Date(),
        };

        setMessages((prev) => ({
          ...prev,
          [activeChat]: [...(prev[activeChat] || []), wilsonMsg],
        }));
        setIsThinking(false);
      }, 1500 + Math.random() * 1500);
    },
    [activeChat, createNewChat]
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

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border/20 bg-void-surface/30 backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <WilsonOrb size="sm" isThinking={isThinking} />
          <div>
            <h1 className="text-sm font-bold tracking-wide text-foreground">Wilson</h1>
            <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">
              {isThinking ? "Processing signal..." : "The Neural Void"}
            </p>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!activeChat ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
              <WilsonOrb size="lg" />
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  The Neural Void
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  An abstract intelligence awaits your signal. Begin a new thread to enter the void.
                </p>
              </div>
              <button
                onClick={createNewChat}
                className="mt-2 px-6 py-2.5 rounded-2xl text-sm font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all glow-pulse"
              >
                Initialize Thread
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {currentMessages.map((msg, i) => (
                <ChatMessage key={msg.id} message={msg} index={i} />
              ))}
              <AnimatePresence>
                {isThinking && (
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

        {/* Input */}
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
