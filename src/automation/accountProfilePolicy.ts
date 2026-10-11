// Stable per-account hash that names the browser profile directory (existing profiles depend on it).
// [2026-10-11] The per-account fake UA/screen profile (buildNaverAutomationProfile) is gone: the publish window reports
//   this PC exactly as the user's own Chrome does. Measured before: 26 of 81 fingerprint fields differed.
export function hashAutomationAccountId(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
