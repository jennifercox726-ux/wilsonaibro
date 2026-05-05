import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Ghost } from "lucide-react";
import { loadGhostMode, saveGhostMode, GhostModeState } from "@/lib/ghostMode";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function GhostModePanel({ isOpen, onClose }: Props) {
  const [state, setState] = useState<GhostModeState>({ enabled: false, terms: [] });
  const [input, setInput] = useState("");

  useEffect(() => {
    if (isOpen) setState(loadGhostMode());
  }, [isOpen]);

  const update = (next: GhostModeState) => {
    setState(next);
    saveGhostMode(next);
  };

  const addTerm = () => {
    const t = input.trim();
    if (!t) return;
    if (state.terms.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    update({ ...state, terms: [...state.terms, t] });
    setInput("");
  };

  const removeTerm = (t: string) => {
    update({ ...state, terms: state.terms.filter((x) => x !== t) });
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
                <Ghost className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold tracking-wide">Ghost Mode</h2>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Filters static — sentences mentioning these terms are hidden from Wilson's replies so you can focus on the dream.
            </p>

            <label className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30 mb-4 cursor-pointer">
              <span className="text-xs font-semibold">Enable Ghost Mode</span>
              <input
                type="checkbox"
                checked={state.enabled}
                onChange={(e) => update({ ...state, enabled: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
            </label>

            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Filtered terms
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {state.terms.length === 0 && (
                <span className="text-xs text-muted-foreground/60 italic">No terms yet.</span>
              )}
              {state.terms.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/15 text-primary text-xs border border-primary/30"
                >
                  {t}
                  <button onClick={() => removeTerm(t)} className="hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTerm()}
                placeholder="Add a term (e.g. Leo)"
                className="flex-1 text-xs bg-muted/20 border border-border/30 rounded-xl px-3 py-2 focus:outline-none focus:border-primary/40"
              />
              <button
                onClick={addTerm}
                className="px-3 py-2 rounded-xl bg-primary/15 text-primary text-xs font-semibold border border-primary/30 hover:bg-primary/25"
              >
                Add
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
