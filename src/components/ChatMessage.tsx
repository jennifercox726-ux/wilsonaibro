import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Volume2, Square } from "lucide-react";
import { markdownToHtml } from "@/lib/simpleMarkdown";
import { speakText, speakTextSync, stopSpeaking, unlockTTS } from "@/lib/speechSynthesis";
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
    // CRITICAL: stay synchronous so iOS Safari keeps the user-gesture context.
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    unlockTTS();
    setSpeaking(true);

    // First attempt: synchronous Web Speech (works reliably on iOS Safari)
    const sync = speakTextSync(cleanContent);
    if (sync) {
      // Poll for end of speech so we can flip the button back
      const synth = window.speechSynthesis;
      const poll = window.setInterval(() => {
        if (!synth.speaking && !synth.pending) {
          window.clearInterval(poll);
          setSpeaking(false);
        }
      }, 300);
      return;
    }

    // Fallback (desktop / non-iOS): async path with Edge TTS
    speakText(cleanContent).finally(() => setSpeaking(false));
  };

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
        <div className={`wilson-prose text-sm ${isWilson ? "" : "text-foreground/90"}`}>
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
