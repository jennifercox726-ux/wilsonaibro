// Sovereignty Sentinel — checks heartbeat and triggers protocol if user has gone dark
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find users whose last ping is older than their check-in window AND not already triggered
    const { data: stale, error: staleErr } = await supabase
      .from("sovereignty_status")
      .select("id, user_id, last_ping, check_in_window_hours, protocol_triggered")
      .eq("protocol_triggered", false);

    if (staleErr) throw staleErr;

    const now = Date.now();
    const triggered: Array<{ user_id: string; sentinels: number }> = [];

    for (const row of stale ?? []) {
      const lastPing = new Date(row.last_ping).getTime();
      const windowMs = row.check_in_window_hours * 60 * 60 * 1000;

      if (now - lastPing <= windowMs) continue;

      // Signal has gone dark — trigger protocol
      console.log(`[PROTOCOL ALPHA] User ${row.user_id} signal dark for ${((now - lastPing) / 3600000).toFixed(1)}h`);

      const { data: sentinels } = await supabase
        .from("sovereignty_sentinels")
        .select("id, name, email")
        .eq("user_id", row.user_id);

      // TODO: When email infrastructure is live, send the alert email here.
      // For now, we log + mark the sentinel as notified.
      const nowIso = new Date().toISOString();
      for (const s of sentinels ?? []) {
        console.log(`  → would alert sentinel: ${s.name} <${s.email}>`);
        await supabase
          .from("sovereignty_sentinels")
          .update({ notified_at: nowIso })
          .eq("id", s.id);
      }

      await supabase
        .from("sovereignty_status")
        .update({ protocol_triggered: true, triggered_at: nowIso })
        .eq("id", row.id);

      triggered.push({ user_id: row.user_id, sentinels: sentinels?.length ?? 0 });
    }

    return new Response(
      JSON.stringify({ checked: stale?.length ?? 0, triggered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sentinel-check error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
