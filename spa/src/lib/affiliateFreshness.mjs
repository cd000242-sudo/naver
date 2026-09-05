export function campaignFreshness(snapshot, lane, now = Date.now()) {
  const site = snapshot?.sites?.[lane];
  const collectedAt = site && 'collectedAt' in site ? site.collectedAt : snapshot?.collectedAt || null;
  const age = now - Date.parse(collectedAt);
  return {
    collectedAt,
    stale: !Number.isFinite(age) || age < -300000 || age > 48 * 3600000,
    needsLogin: site?.status === 'login-required',
    failed: Boolean(site?.status && site.status !== 'ready'),
  };
}
