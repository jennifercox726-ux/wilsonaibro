import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { useSpeechToText } from "@/hooks/useSpeechToText";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const isSpeechSupported =
  typeof window !== "undefined" &&
  ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseInputRef = useRef<string>("");

  const {
    isListening,
    transcript,
    finalTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechToText();

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Live interim transcription mirrored into the input
  useEffect(() => {
    if (!isListening) return;
    const combined = (baseInputRef.current + (baseInputRef.current ? " " : "") + transcript).trimStart();
    setInput(combined);
  }, [transcript, isListening]);

  // Commit finalized chunks to the base input
  useEffect(() => {
    if (!finalTranscript) return;
    baseInputRef.current = (baseInputRef.current + (baseInputRef.current ? " " : "") + finalTranscript).trim();
    setInput(baseInputRef.current);
  }, [finalTranscript]);

  // Surface errors via toast
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    if (isListening) stopListening();
    onSend(input.trim());
    setInput("");
    baseInputRef.current = "";
    resetTranscript();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      // Seed the base with whatever the user has already typed
      baseInputRef.current = input;
      startListening();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full max-w-2xl mx-auto"
    >
      <div
        className={`relative flex items-end gap-2 rounded-2xl border px-4 py-3 transition-all duration-300 ${
          isFocused
            ? "border-primary/40 bg-void-surface/80 glow-pulse"
            : "border-border/50 bg-void-surface/50"
        }`}
        style={{
          backdropFilter: "blur(20px)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Manual edits become the new base for the next dictation
            if (!isListening) baseInputRef.current = e.target.value;
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening..." : "Transmit to Wilson..."}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 resize-none outline-none font-sans min-h-[24px]"
        />
        <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
          {isSpeechSupported && (
            <button
              onClick={toggleListening}
              className={`p-2 rounded-xl transition-colors ${
                isListening
                  ? "text-red-400 bg-red-400/20 animate-pulse"
                  : "text-muted-foreground hover:text-primary hover:bg-primary/10"
              }`}
              title={isListening ? "Stop listening" : "Voice input"}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            className="p-2 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatInput;
