import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { markdownToHtml } from "@/lib/simpleMarkdown";
import WilsonOrb from "./WilsonOrb";
import WilsonChart from "./WilsonChart";

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

interface ChartBlock {
  data: Record<string, unknown>[];
  type?: "line" | "bar" | "area";
  dataKey?: string;
  xKey?: string;
}

function parseCharts(content: string): { segments: (string | ChartBlock)[]; cleanContent: string } {
  const regex = /<WilsonChart\s+([\s\S]*?)\/>/g;
  const segments: (string | ChartBlock)[] = [];
  let lastIndex = 0;
  let cleanContent = content;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push(content.slice(lastIndex, match.index));
    }
    try {
      const attrs = match[1];
      // Extract data={...} - find balanced braces
      const dataMatch = attrs.match(/data=\{(\[[\s\S]*?\])\}/);
      const typeMatch = attrs.match(/type="(\w+)"/);
      const dataKeyMatch = attrs.match(/dataKey="(\w+)"/);
      const xKeyMatch = attrs.match(/xKey="(\w+)"/);

      if (dataMatch) {
        const data = JSON.parse(dataMatch[1]);
        segments.push({
          data,
          type: (typeMatch?.[1] as "line" | "bar" | "area") || "line",
          dataKey: dataKeyMatch?.[1],
          xKey: xKeyMatch?.[1],
        });
      } else {
        segments.push(match[0]);
      }
    } catch {
      segments.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push(content.slice(lastIndex));
  }

  cleanContent = content.replace(regex, "").trim();
  return { segments, cleanContent };
}

const ChatMessage = ({ message, index }: ChatMessageProps) => {
  const isWilson = message.role === "assistant";
  const [copied, setCopied] = useState(false);

  const { segments, cleanContent } = useMemo(
    () => (isWilson ? parseCharts(message.content) : { segments: [message.content], cleanContent: message.content }),
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
          {segments.map((seg, i) =>
            typeof seg === "string" ? (
              <div key={i} dangerouslySetInnerHTML={{ __html: markdownToHtml(seg) }} />
            ) : (
              <WilsonChart key={i} data={seg.data} type={seg.type} dataKey={seg.dataKey} xKey={seg.xKey} />
            )
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
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
    </motion.div>
  );
};

export default ChatMessage;
