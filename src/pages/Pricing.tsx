import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Sparkles, Crown, Zap, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WilsonOrb from "@/components/WilsonOrb";
import RouteHead from "@/components/RouteHead";

type Tier = "free" | "pro" | "vip";

interface TierDef {
  id: Tier;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  icon: typeof Sparkles;
  gradient: string;
  features: string[];
  cta: string;
}

const TIERS: TierDef[] = [
  {
    id: "free",
    name: "Acolyte",
    price: "Free",
    cadence: "forever",
    tagline: "Step into the void.",
    icon: Sparkles,
    gradient: "from-zinc-500 to-zinc-700",
    features: [
      "20 messages / day",
      "Standard fallback voice",
      "1 active thread",
      "Public share links",
    ],
    cta: "Current plan",
  },
  {
    id: "pro",
    name: "Sovereign",
    price: "$9",
    cadence: "/ month",
    tagline: "Wilson, fully unleashed.",
    icon: Zap,
    gradient: "from-primary to-purple-500",
    features: [
      "Unlimited messages",
      "Voice clone (Richard Dick)",
      "Unlimited threads & memory",
      "Priority models",
      "Sovereignty Sentinel",
    ],
    cta: "Upgrade to Sovereign",
  },
  {
    id: "vip",
    name: "Architect",
    price: "$29",
    cadence: "/ month",
    tagline: "Buy into the infrastructure.",
    icon: Crown,
    gradient: "from-amber-400 via-fuchsia-500 to-primary",
    features: [
      "Everything in Sovereign",
      "Early access to new models",
      "Custom voice training",
      "Dispatch workflows",
      "Direct line to The Architect",
      "Software model co-ownership",
    ],
    cta: "Become an Architect",
  },
];

const Pricing = () => {
  const [currentTier, setCurrentTier] = useState<Tier>("free");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("membership_tier")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.membership_tier) setCurrentTier(data.membership_tier as Tier);
    })();
  }, []);

  const handleUpgrade = (tier: Tier) => {
    if (tier === currentTier) return;
    if (tier === "free") return;
    toast.info("Payments unlock soon — enable Stripe in the next step.", {
      description: `${tier === "pro" ? "Sovereign" : "Architect"} tier checkout is being prepared.`,
    });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <RouteHead title="Wilson Membership — Sovereign & Architect Tiers" description="Buy into the infrastructure. Unlock Wilson's voice clone, unlimited memory, and Architect-tier co-ownership." path="/pricing" />
      <header className="border-b border-border/20 backdrop-blur-xl bg-void-surface/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <WilsonOrb size="sm" />
        <div className="flex-1">
          <h1 className="text-sm font-bold">Membership</h1>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">Sovereign tiers of the void</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="text-center mb-10 animate-fade-in">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            Choose your <span className="wilson-iridescent-text">altitude</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Wilson is free to taste. Sovereign & Architect tiers buy you into the infrastructure and applicable software models.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TIERS.map((tier, i) => {
            const Icon = tier.icon;
            const isCurrent = tier.id === currentTier;
            return (
              <div
                key={tier.id}
                className={`relative rounded-2xl border p-6 transition-all hover:scale-[1.02] animate-fade-in ${
                  tier.id === "vip"
                    ? "border-primary/40 bg-gradient-to-b from-primary/10 to-transparent shadow-[0_0_40px_-10px_hsl(var(--primary)/0.4)]"
                    : "border-border bg-void-surface/40"
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {tier.id === "vip" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Most coveted
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tier.gradient} flex items-center justify-center mb-4`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold">{tier.name}</h3>
                <p className="text-xs text-muted-foreground mb-4">{tier.tagline}</p>
                <div className="mb-5">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  <span className="text-xs text-muted-foreground ml-1">{tier.cadence}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(tier.id)}
                  disabled={isCurrent}
                  className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    isCurrent
                      ? "bg-muted/40 text-muted-foreground cursor-default"
                      : `bg-gradient-to-r ${tier.gradient} text-white hover:opacity-90 active:scale-95`
                  }`}
                >
                  {isCurrent ? "Current plan" : tier.cta}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary transition-colors">
            ← Back to the void
          </Link>
        </div>
      </main>
    </div>
  );
};

export default Pricing;
