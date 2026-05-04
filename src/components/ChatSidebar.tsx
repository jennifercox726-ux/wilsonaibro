import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, Trash2, X, FileText, Webhook, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";

export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
}

interface Draft {
  id: string;
  title: string;
  impact_summary: string | null;
  profit_summary: string | null;
  full_report: string | null;
  created_at: string;
  read_at: string | null;
}

interface ChatSidebarProps {
  chats: Chat[];
  activeChat: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

const ChatSidebar = ({
  chats,
  activeChat,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isOpen,
  onClose,
  userId,
}: ChatSidebarProps) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [openDraft, setOpenDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState(false);

  // Load drafts + subscribe to realtime
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("pe_drafts")
        .select("id, title, impact_summary, profit_summary, full_report, created_at, read_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled && data) setDrafts(data as Draft[]);
    };
    load();

    const channel = supabase
      .channel(`pe_drafts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pe_drafts", filter: `user_id=eq.${userId}` },
        (payload) => {
          setDrafts((prev) => [payload.new as Draft, ...prev].slice(0, 20));
          toast.success("New draft incoming", { description: (payload.new as Draft).title });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const webhookUrl = userId
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pe-monitor?user=${userId}`
    : "";

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("Webhook URL copied");
    setTimeout(() => setCopied(false), 1800);
  };

  const openAndMarkRead = async (d: Draft) => {
    setOpenDraft(d);
    if (!d.read_at && userId) {
      await supabase.from("pe_drafts").update({ read_at: new Date().toISOString() }).eq("id", d.id);
      setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
  };

  const deleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("pe_drafts").delete().eq("id", id);
    setDrafts((prev) => prev.filter((x) => x.id !== id));
  };

  const unreadCount = drafts.filter((d) => !d.read_at).length;

  return (
    <>
      {/* Overlay on mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 sm:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : -280 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed left-0 top-0 bottom-0 w-[260px] z-50 flex flex-col border-r border-border/30 bg-void-surface/95"
        style={{ backdropFilter: "blur(24px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/20">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Neural Threads
          </span>
          <div className="flex gap-1">
            <button
              onClick={onNewChat}
              className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors sm:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <AnimatePresence>
            {chats.map((chat) => (
              <motion.button
                key={chat.id}
                layout
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                onClick={() => onSelectChat(chat.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm transition-all group ${
                  activeChat === chat.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                <span className="flex-1 truncate">{chat.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </motion.button>
            ))}
          </AnimatePresence>

          {/* Drafts section */}
          {userId && (
            <div className="mt-6 pt-3 border-t border-border/20">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  PE Drafts
                </span>
                {unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                    {unreadCount}
                  </span>
                )}
              </div>

              {drafts.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-muted-foreground/60 leading-relaxed">
                  No drafts yet. Wire your webhook below to start receiving Preliminary Impact &amp; Profit reports.
                </div>
              ) : (
                <div className="space-y-1">
                  {drafts.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => openAndMarkRead(d)}
                      className="w-full flex items-start gap-2 px-3 py-2 rounded-xl text-left transition-all group text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                    >
                      <FileText className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${!d.read_at ? "text-primary" : "opacity-40"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs truncate ${!d.read_at ? "font-medium text-foreground" : ""}`}>
                          {d.title}
                        </div>
                        {d.impact_summary && (
                          <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                            {d.impact_summary}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => deleteDraft(d.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with webhook */}
        <div className="p-3 border-t border-border/20 space-y-2">
          {userId && (
            <button
              onClick={copyWebhook}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors text-[10px]"
              title="Copy your PE webhook URL"
            >
              <Webhook className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1 truncate text-left">Copy PE webhook URL</span>
              {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 opacity-60" />}
            </button>
          )}
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 text-center">
            The Neural Void • Wilson v1
          </div>
        </div>
      </motion.aside>

      {/* Draft viewer */}
      <Sheet open={!!openDraft} onOpenChange={(o) => !o && setOpenDraft(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{openDraft?.title}</SheetTitle>
            <SheetDescription className="text-xs">
              {openDraft && new Date(openDraft.created_at).toLocaleString()}
            </SheetDescription>
          </SheetHeader>
          {openDraft && (
            <div className="mt-6 space-y-5 text-sm">
              {openDraft.impact_summary && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Impact</h3>
                  <p className="text-foreground/90 leading-relaxed">{openDraft.impact_summary}</p>
                </section>
              )}
              {openDraft.profit_summary && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Profit</h3>
                  <p className="text-foreground/90 leading-relaxed">{openDraft.profit_summary}</p>
                </section>
              )}
              {openDraft.full_report && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Full Report</h3>
                  <pre className="whitespace-pre-wrap text-xs text-foreground/80 leading-relaxed font-sans">
                    {openDraft.full_report}
                  </pre>
                </section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ChatSidebar;
