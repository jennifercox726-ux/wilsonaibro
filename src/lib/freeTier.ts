/**
 * Free tier access module for Wilson + The Only One
 * All features available to everyone at no cost
 */

/**
 * Check if OpenRouter API key is configured
 */
export async function checkApiKeyConfiguration(): Promise<{
  isConfigured: boolean;
  message: string;
}> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      isConfigured: false,
      message:
        "⚠️ OpenRouter API key not configured. Please add OPENROUTER_API_KEY to Replit Secrets to enable chat.",
    };
  }

  return {
    isConfigured: true,
    message: "✅ Ready to chat with Wilson",
  };
}

/**
 * Grant unlimited free access to all features
 */
export function grantFreeAccess(): void {
  localStorage.setItem("wilson_free_access", "true");
  localStorage.setItem("wilson_access_level", "unlimited");
  console.log("🟢 Free unlimited access granted to Wilson + The Only One");
}

/**
 * Check if user has free access (always true)
 */
export function hasFreeAccess(): boolean {
  return true; // Everyone gets free access
}

/**
 * Get remaining usage (unlimited for free)
 */
export function getRemainingUsage(): {
  messages: number;
  threads: number;
  isUnlimited: boolean;
} {
  return {
    messages: Infinity,
    threads: Infinity,
    isUnlimited: true,
  };
}

/**
 * Initialize free tier on user login
 */
export function initializeFreeTier(): void {
  grantFreeAccess();
}
