import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, MessageSquare, Users, Clock, AlertTriangle, TrendingUp, Shield, ChevronDown, Loader2, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import WilsonOrb from "@/components/WilsonOrb";

interface QueryLog {
  id: string;
  query_text: string;
  query_length: number;
  response_length: number | null;
  response_time_ms: number | null;
  created_at: string;
  conversation_id: string | null;
  user_id: string;
}

interface Stats {
  totalQueries: number;
  uniqueUsers: number;
  avgResponseMs: number;
  errorRate: number;
  avgQueryLength: number;
  avgResponseLength: number;
}

interface TopQuery {
  text: string;
  count: number;
}

interface SignupRow {
  user_id: string;
  display_name: string | null;
  emotional_vibe: string | null;
  core_dream: string | null;
  referral_source: string | null;
  first_seen_at: string;
  created_at: string;
}

const Analytics = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalQueries: 0,
    uniqueUsers: 0,
    avgResponseMs: 0,
    errorRate: 0,
    avgQueryLength: 0,
    avgResponseLength: 0,
  });
  const [topQueries, setTopQueries] = useState<TopQuery[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threadCache, setThreadCache] = useState<Record<string, { role: string; content: string; created_at: string }[]>>({});
  const [threadLoading, setThreadLoading] = useState<string | null>(null);

  async function handleToggle(log: QueryLog) {
    if (expandedId === log.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(log.id);
    if (!log.conversation_id || threadCache[log.conversation_id]) return;
    setThreadLoading(log.conversation_id);
    const { data } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", log.conversation_id)
      .order("created_at", { ascending: true });
    if (data) {
      setThreadCache((prev) => ({ ...prev, [log.conversation_id!]: data }));
    }
    setThreadLoading(null);
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Check admin status (RLS lets admins read all roles, normal users see only their own)
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      const adminFlag = !!roleRows;
      setIsAdmin(adminFlag);

      const now = new Date();
      const since = new Date();
      if (timeRange === "24h") since.setHours(now.getHours() - 24);
      else if (timeRange === "7d") since.setDate(now.getDate() - 7);
      else since.setDate(now.getDate() - 30);

      // Admins see ALL query_logs via the new admin RLS policy. Regular users
      // only see their own — RLS handles both cases automatically.
      const { data, error } = await supabase
        .from("query_logs")
        .select("*")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error || !data) {
        setLoading(false);
        return;
      }

      setLogs(data as QueryLog[]);

      const total = data.length;
      const failed = data.filter((d) => d.response_length === 0).length;
      const responseTimes = data
        .filter((d) => d.response_time_ms != null)
        .map((d) => d.response_time_ms!);
      const avgMs = responseTimes.length
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;
      const avgQL = total
        ? Math.round(data.reduce((a, b) => a + b.query_length, 0) / total)
        : 0;
      const validResponses = data.filter((d) => d.response_length && d.response_length > 0);
      const avgRL = validResponses.length
        ? Math.round(validResponses.reduce((a, b) => a + (b.response_length || 0), 0) / validResponses.length)
        : 0;

      // Unique users — admins see real count across all queries; users always see 1 (themselves)
      const uniqueUserIds = new Set(data.map((d) => d.user_id));

      setStats({
        totalQueries: total,
        uniqueUsers: uniqueUserIds.size,
        avgResponseMs: avgMs,
        errorRate: total ? Math.round((failed / total) * 100 * 100) / 100 : 0,
        avgQueryLength: avgQL,
        avgResponseLength: avgRL,
      });

      // Top queries by similarity (group by first 60 chars)
      const freq: Record<string, number> = {};
      data.forEach((d) => {
        const key = d.query_text.slice(0, 60).toLowerCase().trim();
        freq[key] = (freq[key] || 0) + 1;
      });
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([text, count]) => ({ text, count }));
      setTopQueries(sorted);

      setLoading(false);
    }
    fetchData();
  }, [timeRange, userId]);

  const statCards = [
    {
      label: "Total Queries",
      value: stats.totalQueries,
      icon: MessageSquare,
      color: "text-primary",
    },
    {
      label: isAdmin ? "Unique Users" : "You",
      value: stats.uniqueUsers,
      icon: Users,
      color: "text-accent",
    },
    {
      label: "Avg Response",
      value: stats.avgResponseMs ? `${(stats.avgResponseMs / 1000).toFixed(1)}s` : "—",
      icon: Clock,
      color: "text-accent",
    },
    {
      label: "Error Rate",
      value: `${stats.errorRate}%`,
      icon: AlertTriangle,
      color: stats.errorRate > 5 ? "text-destructive" : "text-primary",
    },
  ];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center aurora-bg">
        <WilsonOrb size="lg" isThinking />
      </div>
    );
  }

  return (
    <div className="min-h-screen aurora-bg">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/20 bg-void-surface/30 backdrop-blur-xl">
        <button
          onClick={() => navigate("/")}
          className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <WilsonOrb size="sm" />
        <div className="flex-1">
          <h1 className="text-sm font-bold tracking-wide text-foreground flex items-center gap-2">
            Wilson Analytics ✨
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest bg-accent/20 text-accent px-2 py-0.5 rounded-full border border-accent/30">
                <Shield className="w-2.5 h-2.5" />
                Admin
              </span>
            )}
          </h1>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">
            {isAdmin ? "All-user telemetry" : "Your private telemetry"}
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Time Range Filter */}
        <div className="flex gap-2">
          {(["24h", "7d", "30d"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                timeRange === range
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/50"
              }`}
            >
              {range === "24h" ? "24 Hours" : range === "7d" ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl bg-void-surface/40 backdrop-blur-lg border border-border/20 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">{card.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Top Queries */}
        <div className="rounded-2xl bg-void-surface/40 backdrop-blur-lg border border-border/20 p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            Top Queries
          </h2>
          {topQueries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No queries yet — start chatting with Wilson to see data here!
            </p>
          ) : (
            <div className="space-y-2">
              {topQueries.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="text-[10px] font-bold text-primary/50 w-5 text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 truncate text-foreground/80">{q.text}</div>
                  <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">
                    {q.count}×
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Queries */}
        <div className="rounded-2xl bg-void-surface/40 backdrop-blur-lg border border-border/20 p-4">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-primary" />
            Recent Queries {isAdmin && <span className="text-[9px] text-accent">· all users</span>}
          </h2>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No queries logged yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {logs.slice(0, 100).map((log) => {
                const isOpen = expandedId === log.id;
                const thread = log.conversation_id ? threadCache[log.conversation_id] : null;
                const isLoadingThread = threadLoading === log.conversation_id;
                return (
                  <div key={log.id} className="border-b border-border/10 pb-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(log)}
                      className="w-full text-left flex items-start gap-3 text-sm hover:bg-muted/20 active:bg-muted/30 rounded-lg px-2 py-1.5 transition-colors"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 mt-1 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-foreground/90 ${isOpen ? "whitespace-pre-wrap break-words" : "truncate"}`}>
                          {log.query_text}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(log.created_at).toLocaleString()} ·{" "}
                          {log.response_time_ms ? `${(log.response_time_ms / 1000).toFixed(1)}s` : "—"} ·{" "}
                          {log.response_length ? `${log.response_length} chars` : "failed"}
                          {isAdmin && (
                            <span className="ml-1 text-accent/70">
                              · user {log.user_id.slice(0, 8)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                          log.response_length && log.response_length > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {log.response_length && log.response_length > 0 ? "OK" : "ERR"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="mt-2 ml-6 mr-2 space-y-2">
                        {!log.conversation_id ? (
                          <p className="text-[11px] text-muted-foreground italic">No conversation linked to this query.</p>
                        ) : isLoadingThread ? (
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading thread…
                          </div>
                        ) : thread && thread.length > 0 ? (
                          <>
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                              Full thread · {thread.length} message{thread.length === 1 ? "" : "s"}
                            </p>
                            {thread.map((m, idx) => (
                              <div
                                key={idx}
                                className={`rounded-lg p-2.5 text-xs ${
                                  m.role === "user"
                                    ? "bg-primary/5 border border-primary/20"
                                    : "bg-accent/5 border border-accent/20"
                                }`}
                              >
                                <div className="text-[9px] uppercase tracking-widest font-bold mb-1 opacity-70">
                                  {m.role === "user" ? "User" : "Wilson"} ·{" "}
                                  {new Date(m.created_at).toLocaleTimeString()}
                                </div>
                                <div className="whitespace-pre-wrap break-words text-foreground/90">
                                  {m.content}
                                </div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">Thread is empty or was deleted.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
