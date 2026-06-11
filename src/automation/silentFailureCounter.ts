// SPEC-STABILITY-2026 R12 — silent-failure frequency counter.
//
// C/B-grade catches tolerate a failure and keep publishing (by design).
// What was missing is FREQUENCY: a tolerated failure that fires on every
// post is an early warning (selector rot, editor redesign) that today only
// shows up when something user-visible finally breaks. Call sites record a
// site key here without changing behavior; the publish flow logs a summary
// at the end of each post and the operations dashboard can read the getter.

const counts = new Map<string, number>();

export function recordSilentFailure(site: string): void {
  const key = String(site || 'unknown').trim() || 'unknown';
  counts.set(key, (counts.get(key) || 0) + 1);
}

export function getSilentFailureCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of counts.entries()) out[key] = value;
  return out;
}

/** One-line summary for the publish-end log; null when nothing fired. */
export function formatSilentFailureSummary(): string | null {
  if (counts.size === 0) return null;
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}×${value}`);
  return `[SilentFailures] 이번 발행에서 허용된 실패: ${parts.join(' · ')}`;
}

export function resetSilentFailureCounts(): void {
  counts.clear();
}
