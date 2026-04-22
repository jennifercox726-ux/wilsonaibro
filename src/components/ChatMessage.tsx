import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Volume2, Square } from "lucide-react";
import { toast } from "sonner";
import { markdownToHtml } from "@/lib/simpleMarkdown";
import { beginSpeechPlayback, speakText, stopSpeaking, unlockTTS } from "@/lib/speechSynthesis";
import WilsonOrb from "./WilsonOrb";


export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
  index: number;
}

// Strip any leftover chart tags from content
function stripChartTags(content: string): string {
  return content.replace(/<WilsonChart\s+[\s\S]*?\/>/g, "").trim();
}

const ChatMessage = ({ message, index }: ChatMessageProps) => {
  const isWilson = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const cleanContent = useMemo(
    () => (isWilson ? stripChartTags(message.content) : message.content),
    [message.content, isWilson]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = cleanContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }

    const primedAudio = beginSpeechPlayback();
    unlockTTS();
    setSpeaking(true);

    speakText(cleanContent, primedAudio)
      .catch((err) => {
        console.warn("[Wilson TTS] playback failed:", err);
        toast.error("Voice playback failed — Wilson couldn't start audio on this device.");
      })
      .finally(() => setSpeaking(false));
  };

  // Wire up click-to-copy on rendered code blocks
  const proseRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = proseRef.current;
    if (!root) return;
    const handler = async (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-copy-btn]") as HTMLButtonElement | null;
      if (!target) return;
      const wrapper = target.closest(".wilson-code-wrapper") as HTMLElement | null;
      const encoded = wrapper?.getAttribute("data-code") || "";
      const code = decodeURIComponent(encoded);
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      const label = target.querySelector("span");
      const original = label?.textContent || "Copy";
      target.classList.add("copied");
      if (label) label.textContent = "Copied";
      setTimeout(() => {
        target.classList.remove("copied");
        if (label) label.textContent = original;
      }, 1600);
    };
    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [cleanContent]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={`group flex gap-3 ${isWilson ? "items-start" : "items-start justify-end"}`}
    >
      {isWilson && <WilsonOrb size="sm" />}
      <div
        className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
          isWilson ? "thought-block-wilson" : "thought-block"
        }`}
      >
        {isWilson && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60 mb-1 block">
            Wilson
          </span>
        )}
        <div ref={proseRef} className={`wilson-prose text-sm ${isWilson ? "" : "text-foreground/90"}`}>
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(cleanContent) }} />
        </div>
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-[10px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div className="flex items-center gap-1">
            {isWilson && (
              <button
                onClick={handleSpeak}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-semibold uppercase tracking-wider transition-colors"
                title={speaking ? "Stop" : "Play voice"}
                aria-label={speaking ? "Stop voice" : "Play voice"}
              >
                {speaking ? (
                  <>
                    <Square className="w-3 h-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3 h-3" />
                    Play
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              title="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
