import { motion } from "framer-motion";
import { markdownToHtml } from "@/lib/simpleMarkdown";
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

const ChatMessage = ({ message, index }: ChatMessageProps) => {
  const isWilson = message.role === "assistant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={`flex gap-3 ${isWilson ? "items-start" : "items-start justify-end"}`}
    >
      {isWilson && <WilsonOrb size="sm" />}
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
          isWilson
            ? "thought-block-wilson"
            : "thought-block"
        }`}
      >
        {isWilson && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60 mb-1 block">
            Wilson
          </span>
        )}
        <div className={`wilson-prose text-sm ${isWilson ? "" : "text-foreground/90"}`}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        <span className="text-[10px] text-muted-foreground mt-2 block">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
