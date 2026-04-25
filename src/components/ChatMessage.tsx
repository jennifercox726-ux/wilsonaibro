import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Volume2, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { markdownToHtml } from "@/lib/simpleMarkdown";
import {
  speakWithElevenLabs,
  stopElevenLabs,
  isElevenLabsSpeaking,
  subscribeToElevenLabs,
  primeElevenLabsPlayback,
} from "@/lib/elevenLabsTTS";
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

function stripChartTags(content: string): string {
  return content.replace(/<WilsonChart\s+[\s\S]*?\/>/g, "").trim();
}

const ChatMessage = ({ message, index }: ChatMessageProps) => {
  const isWilson = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const [loadingVoice, setLoadingVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const requestedRef = useRef(false);

  const cleanContent = useMemo(
    () => (isWilson ? stripChartTags(message.content) : message.content),
    [message.content, isWilson],
  );

  useEffect(() => {
    return subscribeToElevenLabs(() => {
      const playing = isElevenLabsSpeaking();
      if (requestedRef.current) {
        setSpeaking(playing);
        if (!playing) requestedRef.current = false;
      }
    });
  }, []);

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

  const handleSpeak = async () => {
    if (speaking || loadingVoice) {
      stopElevenLabs();
      requestedRef.current = false;
      setSpeaking(false);
      setLoadingVoice(false);
      return;
    }

    primeElevenLabsPlayback();
    requestedRef.current = true;
    setLoadingVoice(true);
    const result = await speakWithElevenLabs(cleanContent);
    setLoadingVoice(false);
    if (result === "blocked") {
      // iOS/Safari blocked autoplay despite priming; do not show a failure toast.
      requestedRef.current = false;
    } else if (result === "error") {
      requestedRef.current = false;
      toast.error("ElevenLabs voice unavailable — try again in a moment.");
    }
  };

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

  const isActive = speaking || loadingVoice;

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
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60">
            Wilson
          </span>
        )}
        <div ref={proseRef} className={`wilson-prose text-sm ${isWilson ? "" : "text-foreground/90"}`}>
          <div dangerouslySetInnerHTML={{ __html: markdownToHtml(cleanContent) }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div className="flex items-center gap-1">
            {isWilson && (
              <button
                onClick={handleSpeak}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                title={isActive ? "Stop" : "Play voice"}
                aria-label={isActive ? "Stop voice" : "Play voice"}
              >
                {loadingVoice ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading
                  </>
                ) : speaking ? (
                  <>
                    <Square className="h-3 w-3" />
                    Stop
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3 w-3" />
                    Play
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
