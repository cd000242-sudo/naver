export function campaignFreshness(snapshot: unknown, lane: string, now?: number): {
  collectedAt: string | null; stale: boolean; needsLogin: boolean; failed: boolean;
};
