import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { markdownToHtml } from "@/lib/simpleMarkdown";
import WilsonOrb from "@/components/WilsonOrb";
import RouteHead from "@/components/RouteHead";
import { Sparkles } from "lucide-react";

interface SharedMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

const SharedThread = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("Wilson conversation");
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: convo } = await supabase
        .from("conversations")
        .select("id, title, is_public")
        .eq("share_token", token)
        .eq("is_public", true)
        .maybeSingle();

      if (!convo) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTitle(convo.title || "Wilson conversation");

      const { data: msgs } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true });

      setMessages((msgs || []) as SharedMessage[]);
      setLoading(false);
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-transparent">
      <RouteHead title={`${title} — Shared with Wilson`} description="A shared conversation thread from Wilson." path={`/share/${token}`} />
      <header className="border-b border-border/20 backdrop-blur-xl bg-void-surface/30 px-4 py-3 flex items-center gap-3">
        <WilsonOrb size="sm" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate">{title}</h1>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">Shared from Wilson ✨</p>
        </div>
        <Link
          to="/"
          className="rounded-xl bg-primary/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary border border-primary/20 hover:bg-primary/25 transition-all flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" /> Try Wilson
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {loading && <div className="text-center text-muted-foreground text-sm py-12">Loading thread...</div>}
        {notFound && (
          <div className="text-center text-muted-foreground text-sm py-12">
            This thread isn't public or has been removed.
          </div>
        )}
        {!loading && !notFound && messages.map((m) => {
          const isWilson = m.role === "assistant";
          const clean = m.content.replace(/<WilsonChart\s+[\s\S]*?\/>/g, "").replace(/\[VIBE:\s*\w+\]/gi, "").replace(/\[DREAM_UPDATE:\s*.+?\]/gi, "").trim();
          return (
            <div key={m.id} className={`flex gap-3 ${isWilson ? "items-start" : "items-start justify-end"}`}>
              {isWilson && <WilsonOrb size="sm" />}
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${isWilson ? "thought-block-wilson" : "thought-block"}`}>
                {isWilson && (
                  <span className="wilson-iridescent-text mb-1 block text-[11px] font-bold uppercase tracking-[0.25em]">
                    Wilson
                  </span>
                )}
                <div className="wilson-prose text-sm" dangerouslySetInnerHTML={{ __html: markdownToHtml(clean) }} />
              </div>
            </div>
          );
        })}
        {!loading && !notFound && (
          <div className="pt-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all">
              <Sparkles className="w-4 h-4" /> Enter the Void
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default SharedThread;
