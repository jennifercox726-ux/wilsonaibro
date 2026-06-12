// Creates a Stripe Checkout Session: member (subscription) or partner (one-time lifetime)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TierKey = "member" | "partner";

const TIER_CONFIG: Record<TierKey, { priceEnv: string; mode: "subscription" | "payment" }> = {
  member: { priceEnv: "STRIPE_PRICE_MEMBER", mode: "subscription" },
  partner: { priceEnv: "STRIPE_PRICE_PARTNER", mode: "payment" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error("User not found");

    const { tier } = await req.json() as { tier: TierKey };
    const cfg = TIER_CONFIG[tier];
    if (!cfg) throw new Error(`Invalid tier: ${tier}`);
    const priceId = Deno.env.get(cfg.priceEnv);
    if (!priceId) throw new Error(`Missing price ID env var: ${cfg.priceEnv}`);

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const origin = req.headers.get("origin") ?? "https://wilsonaibro.lovable.app";

    const session = await stripe.checkout.sessions.create({
      mode: cfg.mode,
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?status=cancelled`,
      client_reference_id: user.id,
      metadata: { user_id: user.id, tier },
      ...(cfg.mode === "subscription"
        ? { subscription_data: { metadata: { user_id: user.id, tier } } }
        : { payment_intent_data: { metadata: { user_id: user.id, tier } } }),
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[stripe-checkout]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
