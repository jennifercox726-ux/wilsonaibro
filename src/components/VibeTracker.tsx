import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface VibeTrackerProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const VIBES = [
  { key: "unstoppable", label: "Unstoppable", emoji: "⚡" },
  { key: "dreaming", label: "Dreaming", emoji: "✨" },
  { key: "calm", label: "Calm", emoji: "🌊" },
  { key: "neutral", label: "Neutral", emoji: "◎" },
  { key: "tired", label: "Tired", emoji: "🌙" },
  { key: "static", label: "Static", emoji: "📡" },
];

interface VibeLog {
  id: string;
  vibe: string;
  note: string | null;
  logged_on: string;
}

export default function VibeTracker({ userId, isOpen, onClose }: VibeTrackerProps) {
  const [logs, setLogs] = useState<VibeLog[]>([]);
  const [todayVibe, setTodayVibe] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const { data } = await supabase
        .from("vibe_logs")
        .select("id, vibe, note, logged_on")
        .order("logged_on", { ascending: false })
        .limit(14);
      if (data) {
        setLogs(data);
        const todays = data.find((l) => l.logged_on === today);
        if (todays) {
          setTodayVibe(todays.vibe);
          setNote(todays.note || "");
        }
      }
    })();
  }, [isOpen, today]);

  const save = async (vibe: string) => {
    setSaving(true);
    setTodayVibe(vibe);
    const { error } = await supabase
      .from("vibe_logs")
      .upsert({ user_id: userId, vibe, note: note || null, logged_on: today }, { onConflict: "user_id,logged_on" });
    setSaving(false);
    if (error) {
      toast.error("Couldn't log vibe.");
      return;
    }
    toast.success(`Vibe logged: ${vibe}`);
    const { data } = await supabase
      .from("vibe_logs")
      .select("id, vibe, note, logged_on")
      .order("logged_on", { ascending: false })
      .limit(14);
    if (data) setLogs(data);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="w-full max-w-md bg-void-surface border border-border/40 rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold tracking-wide">Vibe Tracker</h2>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Today's frequency
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {VIBES.map((v) => (
                <button
                  key={v.key}
                  disabled={saving}
                  onClick={() => save(v.key)}
                  className={`px-2 py-3 rounded-xl border text-xs font-semibold transition-all ${
                    todayVibe === v.key
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-muted/20 border-border/30 text-foreground/80 hover:bg-muted/40"
                  }`}
                >
                  <div className="text-lg mb-1">{v.emoji}</div>
                  {v.label}
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => todayVibe && save(todayVibe)}
              placeholder="Optional note about today's frequency..."
              className="w-full text-xs bg-muted/20 border border-border/30 rounded-xl p-2 mb-4 resize-none h-16 focus:outline-none focus:border-primary/40"
            />

            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Last 14 days
            </p>
            <div className="flex gap-1 flex-wrap">
              {logs.length === 0 && (
                <p className="text-xs text-muted-foreground/60 italic">No logs yet — set today's vibe.</p>
              )}
              {logs.slice().reverse().map((l) => {
                const v = VIBES.find((x) => x.key === l.vibe);
                return (
                  <div
                    key={l.id}
                    title={`${l.logged_on}: ${l.vibe}${l.note ? ` — ${l.note}` : ""}`}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-muted/30 border border-border/30 text-sm"
                  >
                    {v?.emoji || "·"}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
