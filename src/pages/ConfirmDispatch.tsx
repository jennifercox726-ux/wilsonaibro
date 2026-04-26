// Public sentinel-facing confirmation page.
// The actual workflow firing happens in the confirm-dispatch edge function;
// this React route just redirects the sentinel there so they get the rendered
// HTML response directly from the function (which also handles non-JS clients).

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const ConfirmDispatch = () => {
  const [params] = useSearchParams();
  const token = params.get("token");

  useEffect(() => {
    if (!token) return;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/confirm-dispatch?token=${encodeURIComponent(token)}`;
    window.location.replace(url);
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center aurora-bg">
      <div className="max-w-sm text-center p-8 rounded-2xl bg-void-surface/70 backdrop-blur-xl border border-border/30">
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary mb-3">
          Sovereign Confirmation
        </p>
        <h1 className="text-base font-bold mb-2">
          {token ? "Validating your authorization..." : "Missing confirmation token"}
        </h1>
        <p className="text-xs text-muted-foreground">
          {token
            ? "You will be redirected in a moment."
            : "This link is malformed. Please use the original email link from Wilson."}
        </p>
      </div>
    </div>
  );
};

export default ConfirmDispatch;
