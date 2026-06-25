import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string;
}

const PRESETS = [
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "30m", ms: 30 * 60 * 1000 },
  { label: "2h", ms: 2 * 60 * 60 * 1000 },
];

const YoloToggle = ({ userId }: Props) => {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("yolo_mode")
      .select("expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    setExpiresAt(data ? new Date(data.expires_at).getTime() : null);
  };

  useEffect(() => {
    load();
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = expiresAt !== null && expiresAt > now;
  const remainingMs = active ? expiresAt! - now : 0;
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  const engage = async (ms: number) => {
    setBusy(true);
    const newExp = new Date(Date.now() + ms).toISOString();
    const { error } = await supabase
      .from("yolo_mode")
      .upsert({ user_id: userId, expires_at: newExp, engaged_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`YOLO engaged — full auto until ${new Date(newExp).toLocaleTimeString()}`);
    setExpiresAt(new Date(newExp).getTime());
  };

  const disengage = async () => {
    setBusy(true);
    const { error } = await supabase.from("yolo_mode").delete().eq("user_id", userId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("YOLO disengaged — confirmations re-armed");
    setExpiresAt(null);
  };

  return (
    <div
      className={`p-3 rounded-xl border ${
        active
          ? "bg-warning/10 border-warning/40"
          : "bg-muted/20 border-border/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Rocket
            className={`w-3.5 h-3.5 ${active ? "text-warning animate-pulse" : "text-muted-foreground"}`}
          />
          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold">
            {active ? "YOLO Active" : "YOLO Mode"}
          </span>
        </div>
        {active ? (
          <span className="text-[11px] font-mono text-warning">
            {mm}:{ss}
          </span>
        ) : (
          <span className="text-[9px] text-muted-foreground">Skip confirms, time-boxed</span>
        )}
      </div>

      <div className="mt-2 flex gap-1.5">
        {active ? (
          <button
            disabled={busy}
            onClick={disengage}
            className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-destructive/15 text-destructive border border-destructive/30 disabled:opacity-50"
          >
            Disengage
          </button>
        ) : (
          PRESETS.map((p) => (
            <button
              key={p.label}
              disabled={busy}
              onClick={() => engage(p.ms)}
              className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-background/30 text-muted-foreground border border-border/20 hover:text-warning hover:border-warning/30 disabled:opacity-50"
            >
              {p.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default YoloToggle;
