import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bookmark, Trash2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Snippet {
  id: string;
  content: string;
  created_at: string;
  conversation_id: string | null;
}

interface SavedSnippetsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SavedSnippetsPanel = ({ isOpen, onClose }: SavedSnippetsPanelProps) => {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    supabase
      .from("saved_snippets")
      .select("id, content, created_at, conversation_id")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error("Couldn't load saved snippets");
        else setSnippets((data as Snippet[]) || []);
        setLoading(false);
      });
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    const { error } = await supabase.from("saved_snippets").delete().eq("id", id);
    if (error) toast.error("Couldn't delete snippet");
  };

  const handleCopy = async (s: Snippet) => {
    try {
      await navigator.clipboard.writeText(s.content);
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 bottom-0 z-[61] w-full sm:w-[420px] bg-void-surface/95 border-l border-border/30 flex flex-col"
            style={{ backdropFilter: "blur(24px)" }}
          >
            <div className="flex items-center justify-between p-4 border-b border-border/20">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                  Saved Snippets
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="text-center text-xs text-muted-foreground py-8">
                  Loading the vault...
                </div>
              ) : snippets.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8 px-4">
                  No saved snippets yet. Tap the bookmark icon on any Wilson message to save it here for later.
                </div>
              ) : (
                snippets.map((s) => (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border border-border/30 bg-background/40 p-3 group"
                  >
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap line-clamp-6">
                      {s.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString()} ·{" "}
                        {new Date(s.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopy(s)}
                          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                          title="Copy"
                        >
                          {copiedId === s.id ? (
                            <Check className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SavedSnippetsPanel;
