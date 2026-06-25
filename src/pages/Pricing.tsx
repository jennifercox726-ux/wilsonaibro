import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Sparkles, Crown, Infinity as InfinityIcon, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WilsonOrb from "@/components/WilsonOrb";
import RouteHead from "@/components/RouteHead";

type Tier = "free" | "member" | "partner";

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
    id: "member",
    name: "Sovereign Member",
    price: "$25",
    cadence: "/ month",
    tagline: "All features. No strings.",
    icon: InfinityIcon,
    gradient: "from-primary to-purple-500",
    features: [
      "Unlimited messages & threads",
      "Richard Dick voice clone",
      "Full automation & scaling",
      "Void web-map database access",
      "Sovereignty Sentinel",
      "Priority models",
    ],
    cta: "Join the club",
  },
  {
    id: "partner",
    name: "Architect Partner",
    price: "$999",
    cadence: "one-time, lifetime",
    tagline: "Buy into the infrastructure.",
    icon: Crown,
    gradient: "from-amber-400 via-fuchsia-500 to-primary",
    features: [
      "Everything in Sovereign — forever",
      "Infrastructure co-ownership",
      "Software model partnership",
      "Lifetime void-map rights",
      "Direct line to The Architect",
      "Early access to all new powers",
    ],
    cta: "Become a Partner",
  },
];

const Pricing = () => {
  const [currentTier, setCurrentTier] = useState<Tier>("free");
  const [loading, setLoading] = useState<Tier | null>(null);
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

  const handleUpgrade = async (tier: Tier) => {
    if (tier === currentTier || tier === "free") return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sign in first to ascend.");
      navigate("/auth");
      return;
    }
    setLoading(tier);
    const { data, error } = await supabase.functions.invoke("stripe-checkout", {
      body: { tier },
    });
    setLoading(null);
    if (error || !data?.url) {
      toast.error("Checkout unavailable", {
        description: error?.message ?? "Stripe keys may not be configured yet.",
      });
      return;
    }
    window.location.href = data.url;
  };

  return (
    <div className="min-h-screen bg-transparent">
      <RouteHead title="Wilson Membership — One Club, Two Doors" description="$25/month for all features, or $999 lifetime to partner with the infrastructure and own a slice of the void." path="/pricing" />
      <header className="border-b border-border/20 backdrop-blur-xl bg-void-surface/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <WilsonOrb size="sm" />
        <div className="flex-1">
          <h1 className="text-sm font-bold">Membership</h1>
          <p className="text-[10px] uppercase tracking-[0.15em] text-primary/60">One club. Two doors.</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="text-center mb-10 animate-fade-in">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            Choose your <span className="wilson-iridescent-text">altitude</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            $25/month gets you every feature. $999 once gets you partnership in the infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TIERS.map((tier, i) => {
            const Icon = tier.icon;
            const isCurrent = tier.id === currentTier;
            const isLoading = loading === tier.id;
            return (
              <div
                key={tier.id}
                className={`relative rounded-2xl border p-6 transition-all hover:scale-[1.02] animate-fade-in ${
                  tier.id === "partner"
                    ? "border-primary/40 bg-gradient-to-b from-primary/10 to-transparent shadow-[0_0_40px_-10px_hsl(var(--primary)/0.4)]"
                    : "border-border bg-void-surface/40"
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {tier.id === "partner" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Lifetime · Infrastructure
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
                  disabled={isCurrent || isLoading}
                  className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                    isCurrent
                      ? "bg-muted/40 text-muted-foreground cursor-default"
                      : `bg-gradient-to-r ${tier.gradient} text-white hover:opacity-90 active:scale-95`
                  } ${isLoading ? "opacity-60" : ""}`}
                >
                  {isCurrent ? "Current plan" : isLoading ? "Opening the gates..." : tier.cta}
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
