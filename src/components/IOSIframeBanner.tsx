import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

const PUBLISHED_URL = "https://wilsonaibro.lovable.app";
const DISMISS_KEY = "wilson_ios_iframe_banner_dismissed";

const isIOS =
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

const isInIframe = typeof window !== "undefined" && window.self !== window.top;

const IOSIframeBanner = () => {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!isIOS || !isInIframe) return;
    const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(wasDismissed);
  }, []);

  if (!isIOS || !isInIframe || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  // Use _top to break out of the iframe, fallback to opening in new tab
  const openInSafari = () => {
    try {
      window.top!.location.href = PUBLISHED_URL;
    } catch {
      window.open(PUBLISHED_URL, "_blank");
    }
  };

  return (
    <div className="fixed top-0 inset-x-0 z-50 px-3 pt-3 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-primary/30 bg-void-surface/95 px-4 py-3 shadow-lg backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary mb-0.5">
              Voice input on iPhone
            </p>
            <p className="text-xs text-muted-foreground leading-snug">
              Safari blocks the mic inside previews. Open Wilson directly to
              talk to him.
            </p>
            <button
              onClick={openInSafari}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 transition-colors"
            >
              Open in Safari
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IOSIframeBanner;
