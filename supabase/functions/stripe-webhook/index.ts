// Stripe webhook: verifies signature, updates profiles.membership_tier on payment events
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const PRICE_TIER: Record<string, "pro" | "vip"> = {
  [Deno.env.get("STRIPE_PRICE_SOVEREIGN") ?? "__none_pro__"]: "pro",
  [Deno.env.get("STRIPE_PRICE_ARCHITECT") ?? "__none_vip__"]: "vip",
};

function tierFromSub(sub: Stripe.Subscription): "pro" | "vip" | "free" {
  if (sub.status !== "active" && sub.status !== "trialing") return "free";
  const priceId = sub.items.data[0]?.price.id;
  return (priceId && PRICE_TIER[priceId]) || "free";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe not configured", { status: 500, headers: corsHeaders });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400, headers: corsHeaders });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  async function setTier(userId: string, tier: "free" | "pro" | "vip", extra: Record<string, unknown> = {}) {
    const { error } = await supabase
      .from("profiles")
      .update({ membership_tier: tier, ...extra })
      .eq("user_id", userId);
    if (error) console.error("[stripe-webhook] update profile failed", error);
    else console.log(`[stripe-webhook] user ${userId} -> ${tier}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.user_id ?? s.client_reference_id;
        const tier = (s.metadata?.tier as "pro" | "vip") ?? "pro";
        if (userId && s.payment_status === "paid") {
          await setTier(userId, tier, {
            stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer?.id,
            stripe_subscription_id: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (userId) await setTier(userId, tierFromSub(sub), { stripe_subscription_id: sub.id });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id;
        if (userId) await setTier(userId, "free");
        break;
      }
      default:
        console.log("[stripe-webhook] unhandled", event.type);
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
