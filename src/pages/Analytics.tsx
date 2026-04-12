import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, MessageSquare, Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";
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

const Analytics = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalQueries: 0,
    uniqueUsers: 0,
    avgResponseMs: 0,
    errorRate: 0,
    avgQueryLength: 0,
    avgResponseLength: 0,
  });
  const [topQueries, setTopQueries] = useState<TopQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const now = new Date();
      const since = new Date();
      if (timeRange === "24h") since.setHours(now.getHours() - 24);
      else if (timeRange === "7d") since.setDate(now.getDate() - 7);
      else since.setDate(now.getDate() - 30);

      const { data, error } = await supabase
        .from("query_logs")
        .select("*")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

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

      setStats({
        totalQueries: total,
        uniqueUsers: 1, // RLS scopes to current user
        avgResponseMs: avgMs,
        errorRate: total ? Math.round((failed / total) * 100 * 100) / 100 : 0,
        avgQueryLength: avgQL,
        avgResponseLength: avgRL,
      });

      // Top queries by similarity (simple: group by first 50 chars)
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
  }, [timeRange]);

  const statCards = [
    {
      label: "Total Queries",
      value: stats.totalQueries,
      icon: MessageSquare,
      color: "text-primary",
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
    {
      label: "Avg Query Length",
      value: `${stats.avgQueryLength} chars`,
      icon: TrendingUp,
      color: "text-primary",
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
          <h1 className="text-sm font-bold tracking-wide text-foreground">Wilson Analytics ✨</h1>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">
            Neural Void Telemetry
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
            Recent Queries
          </h2>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No queries logged yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.slice(0, 20).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm border-b border-border/10 pb-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-foreground/80">{log.query_text}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(log.created_at).toLocaleString()} ·{" "}
                      {log.response_time_ms ? `${(log.response_time_ms / 1000).toFixed(1)}s` : "—"} ·{" "}
                      {log.response_length ? `${log.response_length} chars` : "failed"}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      log.response_length && log.response_length > 0
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {log.response_length && log.response_length > 0 ? "OK" : "ERR"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
