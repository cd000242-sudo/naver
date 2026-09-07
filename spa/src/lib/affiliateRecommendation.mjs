/** Browser-compatible gates. These are editorial screening defaults, not outcome probabilities. */
export const AFFILIATE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const AFFILIATE_MIN_DEMAND = 50;
const compact = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const tokens = (text) => String(text || '').toLowerCase().match(/[a-z0-9가-힣]+/g) || [];
const numberOrNull = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const neutralIntent = new Set(['추천', '가격', '비교', '후기', '리뷰', '장점', '단점', '스펙', '구매', '효능', '먹는법', '보관법']);
export function measuredSearchVolume(row) {
  if (!row || row.pcSearchVolumeLt10 || row.mobileSearchVolumeLt10) return null;
  const pc = numberOrNull(row.pcSearchVolume);
  const mobile = numberOrNull(row.mobileSearchVolume);
  return pc === null || mobile === null ? null : pc + mobile;
}
const timestamp = (value) => typeof value === 'number' ? value : Date.parse(value || '');
const isFresh = (value, now, maxAgeMs) => {
  const at = timestamp(value);
  return Number.isFinite(at) && at <= now + 60_000 && now - at <= maxAgeMs;
};

function relevance(item, query) {
  const queryTokens = tokens(query).filter((token) => !neutralIntent.has(token));
  const name = compact(item.name);
  if (!queryTokens.length || !name) return 'unknown';
  const nameParts = String(item.name || '').toLowerCase().match(/[a-z0-9]+|[가-힣]+/g) || [];
  const queryModelParts = String(query || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  if (queryModelParts.some(part => !nameParts.includes(part))) return 'mismatch';
  if (queryTokens.some((token) => !name.includes(token)
    || (/^[a-z0-9]+$/.test(token) && !nameParts.includes(token)))) return 'mismatch';
  const coreTokens = tokens(item.keyword);
  const identity = coreTokens.length > 1 ? coreTokens[0] : '';
  const model = queryTokens.some((token) => /[a-z]/.test(token) && /[0-9]/.test(token));
  // The shared first word alone is insufficient: require another product term or an exact model.
  return model || (queryTokens.length >= 2 && identity && queryTokens.includes(identity)) ? 'matched' : 'unknown';
}

function candidateResult(item, evidence, options) {
  const { now, collectedAt, maxAgeMs } = options;
  const query = String(evidence.query || '').trim();
  const volume = numberOrNull(evidence.monthlySearches);
  const documents = numberOrNull(evidence.documentCount);
  const top = evidence.serpTop;
  const sampled = numberOrNull(top?.sampled);
  const exact = numberOrNull(top?.exact);
  const sourceValid = evidence.source === 'naver-searchad+blog-search';
  const measurementFresh = isFresh(evidence.measuredAt, now, maxAgeMs);
  const sameQuery = Boolean(query && evidence.serpQuery) && compact(evidence.serpQuery) === compact(query);
  const demandVerified = sourceValid && measurementFresh && volume !== null;
  const serpValid = Number.isInteger(sampled) && Number.isInteger(exact) && sampled >= 5
    && exact >= 0 && exact <= sampled && documents !== null && documents >= sampled;
  const competitionVerified = sourceValid && measurementFresh && sameQuery && documents !== null && serpValid;
  const relation = relevance(item, query);
  const ratio = volume !== null && documents !== null ? volume / Math.max(1, documents) : null;
  const reasons = [];
  if (!isFresh(collectedAt, now, maxAgeMs)) reasons.push('product-stale-or-unverified');
  if (!demandVerified) reasons.push('demand-unverified');
  if (demandVerified && volume === 0) reasons.push('no-measured-demand');
  else if (demandVerified && volume < AFFILIATE_MIN_DEMAND) reasons.push('demand-below-screening-minimum');
  if (relation === 'mismatch') reasons.push('product-intent-mismatch');
  if (relation === 'unknown') reasons.push('product-intent-unverified');
  if (!competitionVerified) reasons.push('same-query-serp-unverified');
  if (competitionVerified && ((ratio !== null && ratio < 1) || exact >= 6)) reasons.push('competition-saturated');
  else if (competitionVerified && exact >= 3) reasons.push('direct-competition-needs-review');
  const excluded = reasons.some((reason) => ['no-measured-demand', 'product-intent-mismatch', 'competition-saturated'].includes(reason));
  return {
    status: excluded ? 'excluded' : reasons.length ? 'research' : 'ready',
    reasons,
    meaning: '근거 통과 작성 후보 — 성과 보장 아님',
    query,
    demand: { status: demandVerified ? 'verified' : 'unknown', query, monthlySearches: volume },
    competition: { status: competitionVerified ? 'verified' : 'unknown', query, documentCount: documents, ratio, serpTop: top || null },
    relevance: { status: relation, productQuery: String(item.keyword || ''),
      scope: relation !== 'matched' ? 'unknown' : tokens(query).some(token => /[a-z]/.test(token) && /[0-9]/.test(token)) ? 'model' : 'product-family' },
    freshness: { collectedAt: collectedAt || null, measuredAt: evidence.measuredAt || null, maxAgeHours: maxAgeMs / 3_600_000 },
    evidence: sourceValid ? [{ source: evidence.source, query, measuredAt: evidence.measuredAt || null }] : [],
    screening: { minimumMonthlySearches: AFFILIATE_MIN_DEMAND, minimumDemandDocumentRatio: 1, validatedOutcomeThreshold: false },
  };
}

const statusOrder = { ready: 0, research: 1, excluded: 2 };
function compareResults(a, b) {
  return (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
    || Number(b.relevance?.status === 'matched') - Number(a.relevance?.status === 'matched')
    || Number(b.competition?.status === 'verified') - Number(a.competition?.status === 'verified')
    || (b.demand?.monthlySearches ?? -1) - (a.demand?.monthlySearches ?? -1);
}

export function assessAffiliateRecommendation(item = {}, options = {}) {
  const normalized = { now: timestamp(options.now ?? Date.now()), collectedAt: options.collectedAt ?? item.collectedAt,
    maxAgeMs: numberOrNull(options.maxAgeMs) ?? AFFILIATE_MAX_AGE_MS };
  const evidence = Array.isArray(item.keywordEvidence) ? item.keywordEvidence.filter((entry) => entry && typeof entry === 'object' && entry.query) : [];
  if (!evidence.length) {
    // Legacy counts remain visible as observations, but do not manufacture query provenance.
    return candidateResult(item, { query: item.needKeyword || item.keyword || '', monthlySearches: item.needKeyword ? item.needVolume : item.searchVolume,
      documentCount: item.needKeyword ? item.needDocs : item.documentCount }, normalized);
  }
  return evidence.map((entry) => candidateResult(item, entry, normalized)).sort(compareResults)[0];
}

export function selectAffiliateCandidate(item, options) {
  const result = assessAffiliateRecommendation(item, options);
  return (item.keywordEvidence || []).find((entry) => entry.query === result.query) || null;
}

export function compareAffiliateRecommendations(a, b) {
  return compareResults(a.recommendation || { status: 'research' }, b.recommendation || { status: 'research' });
}

export function verifiedProductEvidence(item, { now = Date.now(), maxAgeMs = AFFILIATE_MAX_AGE_MS } = {}) {
  return (Array.isArray(item.productEvidence) ? item.productEvidence : []).filter((entry) => {
    if (!entry || entry.sourceType !== 'official-product' || !entry.id || typeof entry.excerpt !== 'string' || entry.excerpt.trim().length < 8) return false;
    try {
      const url = new URL(entry.sourceUrl);
      const host = url.hostname.replace(/\.+$/, '');
      return url.protocol === 'https:' && !url.username && !url.password && host.includes('.')
        && !/(^localhost$|\.localhost$|\.local$|^\d+(?:\.\d+){3}$|:)/i.test(host)
        && isFresh(entry.verifiedAt, timestamp(now), maxAgeMs);
    } catch { return false; }
  });
}

/** Exact excerpt-backed spec phrasing only; search counts and seller titles are not performance proof. */
export function validateEvidenceTitle(item, row, options = {}) {
  const title = String(row?.title || '').replace(/\s+/g, ' ').trim();
  if (title.length < 12 || title.length > 52 || /(1위|최저가|무조건|100\s*%|필수템|인생템|오늘만|품절\s*임박|써보|사용해|체험|직접|효과|개선|해결|걱정\s*없)/.test(title)) return null;
  const evidence = verifiedProductEvidence(item, options);
  const claims = Array.isArray(row?.claims) ? row.claims : [];
  if (!claims.length || claims.length > 3) return null;
  for (const claim of claims) {
    const source = evidence.find((entry) => entry.id === claim?.evidenceId);
    if (!source || typeof claim.text !== 'string' || claim.text.length < 3 || typeof claim.quote !== 'string'
      || !source.excerpt.includes(claim.quote) || !claim.quote.includes(claim.text) || !title.includes(claim.text)) return null;
  }
  const anchor = String(item.keyword || '').trim();
  if (!anchor || !title.includes(anchor)) return null;
  // All non-neutral claim text must be verbatim supported, not an inferred question or performance promise.
  let remainder = title.replace(anchor, '');
  for (const claim of claims) remainder = remainder.replace(claim.text, '');
  remainder = remainder.replace(/구매 전|표기 확인|사양 확인|구성 확인|공식 표기|확인할 점|구매 체크/g, '').replace(/[\s·,:?!—–-]/g, '');
  if (remainder) return null;
  return { text: title, status: 'verified', axis: claims.map((claim) => claim.text).join(' · '),
    whyClick: '구매 전 공식 상품 본문의 표기 확인', evidenceIds: [...new Set(claims.map((claim) => claim.evidenceId))],
    claims: claims.map(({ text, evidenceId, quote }) => ({ text, evidenceId, quote })) };
}
