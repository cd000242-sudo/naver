/**
 * Decides whether the incident/allegation overlays (issue-brief skeleton, claim discipline, post-generation
 * issue audit) apply to a SEO / mate post.
 *
 * [2026-11-06] The category hint "경제" maps to the society prompt category, so every finance or policy
 * information post ("2026 청년도약계좌 조건", "국민취업지원제도 조건") also received the incident skeleton
 * (timeline headings, no FAQ) and the allegation discipline rules. Those blocks are written for disputes and
 * scandals. A 경제 post is treated as incident-type only when its keyword carries an incident signal.
 * Homefeed keeps its story skeleton for 경제 (feed readers arrive for the story).
 */
const INCIDENT_SIGNALS = /수사|기소|재판|판결|고소|고발|구속|송치|의혹|논란|폭로|사기|횡령|조작|압수수색|피해자|가해자|사망|혐의|사건|유출/u;

export function skipsIncidentOverlays(
  mode: string | undefined,
  categoryHint: string | undefined,
  primaryKeyword: string | undefined,
): boolean {
  if (mode !== 'seo' && mode !== 'mate') return false;
  if (!String(categoryHint || '').includes('경제')) return false;
  const keyword = String(primaryKeyword || '').trim();
  // Without a keyword there is nothing to judge — keep the previous behaviour.
  if (!keyword) return false;
  return !INCIDENT_SIGNALS.test(keyword);
}
