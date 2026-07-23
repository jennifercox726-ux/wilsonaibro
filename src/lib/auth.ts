/**
 * Auth utilities for Wilson + The Only One
 * All users get full access - no paywalls
 */

/**
 * Grant full access tier to all users (free forever)
 */
export function grantFullAccess(): void {
  // All users get full access - no restrictions
  localStorage.setItem("wilson_access_level", "full");
  localStorage.setItem("wilson_access_granted_at", new Date().toISOString());
}

/**
 * Check if user has full access
 */
export function hasFullAccess(): boolean {
  // Always grant full access - no paywalls
  return true;
}

/**
 * Get user's tier (always "full" for Wilson)
 */
export function getUserTier(): "full" | "free" {
  // Everyone gets full tier - no restrictions
  return "full";
}

/**
 * Verify access (always returns true)
 */
export function verifyAccess(): boolean {
  // No verification needed - everyone has access
  return true;
}
