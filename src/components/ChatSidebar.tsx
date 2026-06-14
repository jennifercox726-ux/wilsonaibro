import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, Trash2, X, Search, Bookmark } from "lucide-react";

export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
}

interface ChatSidebarProps {
  chats: Chat[];
  activeChat: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSnippets: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const ChatSidebar = ({
  chats,
  activeChat,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onOpenSnippets,
  isOpen,
  onClose,
}: ChatSidebarProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, query]);

  return (
    <>
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

        {/* Search */}
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search threads..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-background/40 border border-border/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
            />
          </div>
        </div>

        {/* Saved snippets shortcut */}
        <div className="px-3 pt-2 pb-1">
          <button
            onClick={onOpenSnippets}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-primary/80 hover:text-primary bg-primary/5 hover:bg-primary/10 border border-primary/15 transition-all"
          >
            <Bookmark className="w-3.5 h-3.5" />
            Favorites & Snippets
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 && query.trim() && (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
              No threads match "{query}"
            </div>
          )}
          <AnimatePresence>
            {filtered.map((chat) => (
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
        </div>

        <div className="p-4 border-t border-border/20">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 text-center">
            The Neural Void • Wilson v1
          </div>
        </div>
      </motion.aside>
    </>
  );
};

export default ChatSidebar;
