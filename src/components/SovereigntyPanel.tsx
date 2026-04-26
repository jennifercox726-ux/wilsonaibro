import { useEffect, useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface Sentinel {
  id: string;
  name: string;
  email: string;
  notified_at: string | null;
}

interface Status {
  id: string;
  last_ping: string;
  check_in_window_hours: number;
  protocol_triggered: boolean;
  triggered_at: string | null;
}

interface SovereigntyPanelProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const SovereigntyPanel = ({ userId, isOpen, onClose }: SovereigntyPanelProps) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [sentinels, setSentinels] = useState<Sentinel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: statusRow } = await supabase
      .from("sovereignty_status")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!statusRow) {
      const { data: created } = await supabase
        .from("sovereignty_status")
        .insert({ user_id: userId })
        .select("*")
        .single();
      setStatus(created as Status);
    } else {
      setStatus(statusRow as Status);
    }

    const { data: sent } = await supabase
      .from("sovereignty_sentinels")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    setSentinels((sent as Sentinel[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const checkIn = async () => {
    const { data, error } = await supabase
      .from("sovereignty_status")
      .update({ last_ping: new Date().toISOString(), protocol_triggered: false, triggered_at: null })
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) {
      toast.error("Check-in failed");
      return;
    }
    setStatus(data as Status);
    toast.success("Sovereignty Status: SECURE ✨");
  };

  const addSentinel = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      toast.error("Name and email required");
      return;
    }
    const { data, error } = await supabase
      .from("sovereignty_sentinels")
      .insert({ user_id: userId, name: newName.trim(), email: newEmail.trim() })
      .select("*")
      .single();
    if (error) {
      toast.error("Failed to add sentinel");
      return;
    }
    setSentinels((s) => [...s, data as Sentinel]);
    setNewName("");
    setNewEmail("");
    toast.success(`Sentinel ${data.name} added`);
  };

  const removeSentinel = async (id: string) => {
    await supabase.from("sovereignty_sentinels").delete().eq("id", id);
    setSentinels((s) => s.filter((x) => x.id !== id));
  };

  const updateWindow = async (hours: number) => {
    const { data } = await supabase
      .from("sovereignty_status")
      .update({ check_in_window_hours: hours })
      .eq("user_id", userId)
      .select("*")
      .single();
    if (data) setStatus(data as Status);
  };

  const hoursSincePing = status
    ? (Date.now() - new Date(status.last_ping).getTime()) / 3600000
    : 0;
  const hoursLeft = status ? Math.max(0, status.check_in_window_hours - hoursSincePing) : 0;
  const isDark = status?.protocol_triggered;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="fixed inset-x-4 top-16 bottom-16 z-50 max-w-md mx-auto rounded-3xl bg-void-surface/95 backdrop-blur-xl border border-border/30 shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
              <div className="flex items-center gap-2">
                {isDark ? (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-primary" />
                )}
                <h2 className="text-sm font-bold tracking-wide">Sovereignty Sentinel</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {loading ? (
                <p className="text-xs text-muted-foreground text-center">Loading...</p>
              ) : (
                <>
                  {/* Status */}
                  <div
                    className={`rounded-2xl p-4 border ${
                      isDark
                        ? "bg-destructive/10 border-destructive/30"
                        : "bg-primary/5 border-primary/20"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                      Status
                    </p>
                    <p
                      className={`text-base font-bold ${
                        isDark ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {isDark ? "🚨 PROTOCOL ALPHA TRIGGERED" : "✨ SECURE"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last ping: {status ? new Date(status.last_ping).toLocaleString() : "—"}
                    </p>
                    {!isDark && (
                      <p className="text-xs text-muted-foreground">
                        {hoursLeft.toFixed(1)}h until protocol fires
                      </p>
                    )}
                    <button
                      onClick={checkIn}
                      className="mt-3 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-all"
                    >
                      <Shield className="w-4 h-4 inline mr-2" />
                      Check In Now
                    </button>
                  </div>

                  {/* Window */}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
                      Check-in window
                    </p>
                    <div className="flex gap-2">
                      {[24, 48, 72, 168].map((h) => (
                        <button
                          key={h}
                          onClick={() => updateWindow(h)}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition ${
                            status?.check_in_window_hours === h
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {h === 168 ? "1w" : `${h}h`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sentinels */}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
                      Trusted Sentinels ({sentinels.length})
                    </p>
                    <div className="space-y-2">
                      {sentinels.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/20"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                          </div>
                          <button
                            onClick={() => removeSentinel(s.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {sentinels.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                          No sentinels yet — add one below.
                        </p>
                      )}
                    </div>

                    <div className="mt-3 space-y-2">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Name"
                        className="w-full px-3 py-2 rounded-xl bg-muted/30 border border-border/20 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <input
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="email@domain.com"
                        type="email"
                        className="w-full px-3 py-2 rounded-xl bg-muted/30 border border-border/20 text-sm focus:outline-none focus:border-primary/50"
                      />
                      <button
                        onClick={addSentinel}
                        className="w-full px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                      >
                        <Plus className="w-3.5 h-3.5 inline mr-1.5" />
                        Add Sentinel
                      </button>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground/70 italic text-center px-2">
                    Email delivery is staged. Once your sender domain is verified, alerts will dispatch automatically.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SovereigntyPanel;
