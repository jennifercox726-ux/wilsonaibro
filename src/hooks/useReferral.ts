import { useEffect, useState } from "react";

export interface ReferralInfo {
  source: string | null;
  isVIP: boolean;
}

/**
 * Detects referral source from URL params (?ref=xxx or ?utm_source=xxx)
 * and persists it in localStorage so Wilson can greet VIP friends.
 */
export function useReferral(): ReferralInfo {
  const [info, setInfo] = useState<ReferralInfo>({ source: null, isVIP: false });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || params.get("utm_source");

    if (ref) {
      localStorage.setItem("wilson_referral", ref);
      setInfo({ source: ref, isVIP: true });
      // Clean URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      url.searchParams.delete("utm_source");
      window.history.replaceState({}, "", url.pathname);
    } else {
      const stored = localStorage.getItem("wilson_referral");
      if (stored) {
        setInfo({ source: stored, isVIP: true });
      }
    }
  }, []);

  return info;
}
