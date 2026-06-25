import { useEffect, useState } from "react";
import { Copy, Check, Link2, Mail, Share2, Loader2, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  conversationTitle?: string;
}

function randomToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 22);
}

const ShareDialog = ({ open, onOpenChange, conversationId, conversationTitle }: ShareDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !conversationId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("conversations")
        .select("share_token, is_public")
        .eq("id", conversationId)
        .single();
      setIsPublic(!!data?.is_public);
      setToken(data?.share_token ?? null);
      setLoading(false);
    })();
  }, [open, conversationId]);

  const shareUrl = token ? `${window.location.origin}/share/${token}` : "";
  const shareText = `Check out my conversation with Wilson ✨${conversationTitle ? `: "${conversationTitle}"` : ""}`;

  const togglePublic = async () => {
    if (!conversationId) return;
    setLoading(true);
    const newPublic = !isPublic;
    let newToken = token;
    if (newPublic && !newToken) newToken = randomToken();
    const { error } = await supabase
      .from("conversations")
      .update({ is_public: newPublic, share_token: newToken })
      .eq("id", conversationId);
    setLoading(false);
    if (error) {
      toast.error("Couldn't update sharing.");
      return;
    }
    setIsPublic(newPublic);
    setToken(newToken);
    toast.success(newPublic ? "Public link active." : "Sharing disabled.");
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Wilson", text: shareText, url: shareUrl });
      } catch {/* user cancelled */}
    } else {
      handleCopy();
    }
  };

  const intents = shareUrl
    ? [
        { label: "X / Twitter", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, color: "from-zinc-700 to-zinc-900" },
        { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`, color: "from-green-500 to-emerald-600" },
        { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, color: "from-sky-400 to-blue-600" },
        { label: "Reddit", href: `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`, color: "from-orange-500 to-red-600" },
        { label: "Email", href: `mailto:?subject=${encodeURIComponent("Wilson conversation")}&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`, color: "from-violet-500 to-fuchsia-600" },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" /> Share this thread
          </DialogTitle>
          <DialogDescription>
            Generate a read-only public link and broadcast it anywhere.
          </DialogDescription>
        </DialogHeader>

        <button
          onClick={togglePublic}
          disabled={loading}
          className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
            isPublic
              ? "border-primary/40 bg-primary/10"
              : "border-border bg-muted/30 hover:bg-muted/50"
          }`}
        >
          <div className="flex items-center gap-3">
            {isPublic ? (
              <Globe className="w-4 h-4 text-primary" />
            ) : (
              <Lock className="w-4 h-4 text-muted-foreground" />
            )}
            <div className="text-left">
              <div className="text-sm font-semibold">
                {isPublic ? "Public link active" : "Private"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {isPublic ? "Anyone with the link can read" : "Only you can see this"}
              </div>
            </div>
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </button>

        {isPublic && shareUrl && (
          <>
            <div className="flex gap-2 rounded-xl border border-border bg-muted/30 p-2">
              <div className="flex-1 truncate px-2 py-1.5 text-xs font-mono text-foreground/80">
                {shareUrl}
              </div>
              <button
                onClick={handleCopy}
                className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {intents.map((i) => (
                <a
                  key={i.label}
                  href={i.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-center text-[11px] font-bold uppercase tracking-wider rounded-xl p-3 text-white bg-gradient-to-br ${i.color} hover:scale-[1.03] active:scale-95 transition-transform`}
                >
                  {i.label}
                </a>
              ))}
              <button
                onClick={nativeShare}
                className="text-[11px] font-bold uppercase tracking-wider rounded-xl p-3 border border-primary/40 text-primary hover:bg-primary/10 flex items-center justify-center gap-1"
              >
                <Share2 className="w-3 h-3" /> More
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;
