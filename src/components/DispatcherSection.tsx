import { useEffect, useState } from "react";
import { Plus, Trash2, Power, Zap, ShieldAlert, History, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Workflow {
  id: string;
  workflow_file: string;
  display_name: string;
  description: string | null;
  tier: "auto" | "confirm";
  armed: boolean;
  ref: string;
}

interface DispatchLog {
  id: string;
  workflow_id: string;
  trigger_source: string;
  status: string;
  github_status_code: number | null;
  error_message: string | null;
  dispatched_at: string | null;
  created_at: string;
}

interface DispatcherSectionProps {
  userId: string;
}

const DispatcherSection = ({ userId }: DispatcherSectionProps) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [firing, setFiring] = useState<string | null>(null);

  // Add form state
  const [newFile, setNewFile] = useState("");
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<"auto" | "confirm">("confirm");
  const [newRef, setNewRef] = useState("main");

  const load = async () => {
    setLoading(true);
    const [{ data: wfs }, { data: logRows }] = await Promise.all([
      supabase
        .from("dispatch_workflows")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("dispatch_log")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setWorkflows((wfs as Workflow[]) ?? []);
    setLogs((logRows as DispatchLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addWorkflow = async () => {
    if (!newFile.trim() || !newName.trim()) {
      toast.error("Workflow file and name required");
      return;
    }
    const { data, error } = await supabase
      .from("dispatch_workflows")
      .insert({
        user_id: userId,
        workflow_file: newFile.trim(),
        display_name: newName.trim(),
        tier: newTier,
        ref: newRef.trim() || "main",
        armed: false,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setWorkflows((w) => [...w, data as Workflow]);
    setNewFile("");
    setNewName("");
    setNewTier("confirm");
    setNewRef("main");
    setShowAdd(false);
    toast.success(`Workflow "${data.display_name}" registered (disarmed)`);
  };

  const toggleArmed = async (wf: Workflow) => {
    const next = !wf.armed;
    if (next && wf.tier === "auto") {
      const ok = window.confirm(
        `Arm "${wf.display_name}" as AUTO-FIRE?\n\nIf the Sovereignty protocol triggers, this workflow will execute IMMEDIATELY with no human confirmation.`,
      );
      if (!ok) return;
    }
    const { data, error } = await supabase
      .from("dispatch_workflows")
      .update({ armed: next })
      .eq("id", wf.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setWorkflows((w) => w.map((x) => (x.id === wf.id ? (data as Workflow) : x)));
    toast.success(next ? "Armed" : "Disarmed");
  };

  const removeWorkflow = async (wf: Workflow) => {
    if (!window.confirm(`Delete workflow "${wf.display_name}"?`)) return;
    await supabase.from("dispatch_workflows").delete().eq("id", wf.id);
    setWorkflows((w) => w.filter((x) => x.id !== wf.id));
    toast.success("Workflow removed");
  };

  const testFire = async (wf: Workflow) => {
    setFiring(wf.id);
    try {
      const { data, error } = await supabase.functions.invoke("sentinel-dispatcher", {
        body: {
          workflow_id: wf.id,
          trigger_source: "test_fire",
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Test fired "${wf.display_name}" (dry_run=true)`);
      } else {
        toast.error(data?.error ?? "Test fire failed");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test fire failed");
    } finally {
      setFiring(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === "dispatched") return "text-primary";
    if (status === "pending_confirmation") return "text-yellow-400";
    if (status === "failed") return "text-destructive";
    return "text-muted-foreground";
  };

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">Loading workflows...</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          Dispatcher Workflows ({workflows.length})
        </p>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="text-[10px] uppercase tracking-wider text-primary hover:opacity-80"
        >
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-2 p-3 rounded-xl bg-muted/20 border border-border/20">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name (e.g. Perimeter Defense)"
            className="w-full px-3 py-2 rounded-lg bg-background/50 border border-border/30 text-xs focus:outline-none focus:border-primary/50"
          />
          <input
            value={newFile}
            onChange={(e) => setNewFile(e.target.value)}
            placeholder="Workflow file (e.g. example-perimeter-defense.yml)"
            className="w-full px-3 py-2 rounded-lg bg-background/50 border border-border/30 text-xs font-mono focus:outline-none focus:border-primary/50"
          />
          <input
            value={newRef}
            onChange={(e) => setNewRef(e.target.value)}
            placeholder="Ref (default: main)"
            className="w-full px-3 py-2 rounded-lg bg-background/50 border border-border/30 text-xs font-mono focus:outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setNewTier("auto")}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold ${
                newTier === "auto"
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-background/30 text-muted-foreground border border-border/20"
              }`}
            >
              🟢 Auto-Fire
            </button>
            <button
              onClick={() => setNewTier("confirm")}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold ${
                newTier === "confirm"
                  ? "bg-yellow-400/15 text-yellow-300 border border-yellow-400/30"
                  : "bg-background/30 text-muted-foreground border border-border/20"
              }`}
            >
              🟡 Sentinel Confirm
            </button>
          </div>
          <button
            onClick={addWorkflow}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25"
          >
            <Plus className="w-3 h-3 inline mr-1" />
            Register Workflow
          </button>
        </div>
      )}

      <div className="space-y-2">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="p-3 rounded-xl bg-muted/30 border border-border/20 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold truncate">{wf.display_name}</p>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded ${
                      wf.tier === "auto"
                        ? "bg-primary/15 text-primary"
                        : "bg-yellow-400/15 text-yellow-300"
                    }`}
                  >
                    {wf.tier === "auto" ? "AUTO" : "CONFIRM"}
                  </span>
                  {wf.armed && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                      ARMED
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  {wf.workflow_file} @ {wf.ref}
                </p>
              </div>
              <button
                onClick={() => removeWorkflow(wf)}
                className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => toggleArmed(wf)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 ${
                  wf.armed
                    ? "bg-destructive/15 text-destructive border border-destructive/30"
                    : "bg-muted/40 text-muted-foreground border border-border/20 hover:bg-muted/60"
                }`}
              >
                <Power className="w-3 h-3" />
                {wf.armed ? "Disarm" : "Arm"}
              </button>
              <button
                onClick={() => testFire(wf)}
                disabled={firing === wf.id}
                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50"
              >
                <Zap className="w-3 h-3" />
                {firing === wf.id ? "Firing..." : "Test Fire"}
              </button>
            </div>
          </div>
        ))}

        {workflows.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center py-2">
            No workflows registered yet.
          </p>
        )}
      </div>

      <div className="border-t border-border/20 pt-3">
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
        >
          <History className="w-3 h-3" />
          Dispatch History ({logs.length})
          <RefreshCw
            className="w-3 h-3 ml-auto cursor-pointer hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              load();
            }}
          />
        </button>

        {showHistory && (
          <div className="mt-2 space-y-1.5">
            {logs.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">No dispatches yet.</p>
            )}
            {logs.map((log) => {
              const wf = workflows.find((w) => w.id === log.workflow_id);
              return (
                <div
                  key={log.id}
                  className="p-2 rounded-lg bg-muted/20 border border-border/15 text-[10px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">
                      {wf?.display_name ?? "(deleted)"}
                    </span>
                    <span className={`uppercase tracking-wider ${statusColor(log.status)}`}>
                      {log.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {log.trigger_source.replace(/_/g, " ")} ·{" "}
                    {new Date(log.created_at).toLocaleString()}
                    {log.github_status_code && ` · HTTP ${log.github_status_code}`}
                  </p>
                  {log.error_message && (
                    <p className="text-destructive mt-0.5 truncate">{log.error_message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg p-2.5 bg-yellow-400/5 border border-yellow-400/20">
        <p className="text-[10px] text-yellow-300/90 flex items-start gap-1.5">
          <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
          <span>
            Confirm-tier emails to sentinels are staged. Until your sender domain is verified,
            confirmation links appear in the edge function logs and must be relayed manually.
          </span>
        </p>
      </div>
    </div>
  );
};

export default DispatcherSection;
