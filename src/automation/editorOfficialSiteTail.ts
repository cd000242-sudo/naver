import type { Page } from 'puppeteer';
import { insertTailLinkCardBlock } from './editorTailActions.js';

export const OFFICIAL_SITE_ACTION_KEYWORDS = [
  '비즈니스',
  '경제',
  '금융',
  '부동산',
  '지원금',
  '보조금',
  '대출',
  '티켓',
  '예매',
  '공연',
  '콘서트',
  '전시',
  '여행',
  '항공',
  'KTX',
  '숙소',
  '호텔',
  '건강',
  '병원',
  '검진',
  '보험',
  '의료',
  '교육',
  '자격증',
  '시험',
  '수강',
  '학원',
  '취업',
  '채용',
  '이직',
  '공채',
  '정부',
  '민원',
  '신청',
  '발급',
  '등록',
  '맛집',
  '카페',
  '레스토랑',
] as const;

export const OFFICIAL_SITE_HOOKS = [
  '🔗 관련 사이트 바로가기!!',
  '🌐 공식 사이트 바로가기!!',
  '📌 관련 공식 사이트 바로가기!!',
] as const;

export function shouldSearchOfficialSiteTail(input: {
  title?: string;
  hashtags?: readonly string[];
}): boolean {
  const titleLower = String(input.title || '').toLowerCase();
  const hashtagText = (input.hashtags || []).join(' ').toLowerCase();
  const combinedText = `${titleLower} ${hashtagText}`;

  return OFFICIAL_SITE_ACTION_KEYWORDS.some(keyword => (
    combinedText.includes(keyword.toLowerCase())
  ));
}

export function pickOfficialSiteHook(random: () => number = Math.random): string {
  const randomValue = random();
  const index = Math.min(
    OFFICIAL_SITE_HOOKS.length - 1,
    Math.floor(randomValue * OFFICIAL_SITE_HOOKS.length)
  );
  return OFFICIAL_SITE_HOOKS[index];
}

export type OfficialSiteSearchResult = {
  success: boolean;
  siteName?: string;
  url?: string;
};

export type FindRelevantOfficialSite = (
  query: string,
  category?: string,
  context?: string
) => Promise<OfficialSiteSearchResult>;

export type OfficialSiteTailResult = {
  attempted: boolean;
  inserted: boolean;
  cardReady: boolean;
};

const UNAVAILABLE_OFFICIAL_SITE_PATTERNS = [
  /서비스를\s*찾을\s*수\s*없/i,
  /요청하신\s*페이지를\s*찾을\s*수\s*없/i,
  /페이지를\s*찾을\s*수\s*없/i,
  /not\s*found/i,
  /404\s*(?:error|not\s*found)?/i,
] as const;

export function normalizeOfficialSiteUrl(rawUrl?: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || /\s/.test(trimmed)) return '';

  try {
    const url = new URL(trimmed);
    if (!/^https?:$/.test(url.protocol)) return '';
    // Link cards and Naver hashtags must not share a fragment tail.
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function isGovServiceInfoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(^|\.)gov\.kr$/i.test(parsed.hostname)
      && /\/portal\/service\/serviceInfo\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function verifyOfficialSiteUrlAvailable(input: {
  url: string;
  fetchOfficialSite?: typeof fetch;
}): Promise<{ ok: boolean; reason?: string }> {
  const { url, fetchOfficialSite = globalThis.fetch } = input;
  const normalized = normalizeOfficialSiteUrl(url);
  if (!normalized) return { ok: false, reason: 'invalid-url' };

  if (typeof fetchOfficialSite !== 'function') {
    return isGovServiceInfoUrl(normalized)
      ? { ok: false, reason: 'gov-service-info-unverified' }
      : { ok: true };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), 6000)
    : null;

  try {
    const response = await fetchOfficialSite(normalized, {
      method: 'GET',
      redirect: 'follow',
      signal: controller?.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 BetterLifeNaver/official-site-check',
      },
    } as RequestInit);
    if (timeout) clearTimeout(timeout);

    if (!response.ok) {
      return { ok: false, reason: `http-${response.status}` };
    }

    const html = await response.text().catch(() => '');
    const sample = html.slice(0, 120000);
    if (UNAVAILABLE_OFFICIAL_SITE_PATTERNS.some(pattern => pattern.test(sample))) {
      return { ok: false, reason: 'unavailable-page-text' };
    }

    return { ok: true };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    return isGovServiceInfoUrl(normalized)
      ? { ok: false, reason: `gov-service-info-check-failed:${(error as Error).message}` }
      : { ok: true, reason: `check-skipped:${(error as Error).message}` };
  }
}

async function getDefaultOfficialSiteFinder(): Promise<FindRelevantOfficialSite> {
  const { findRelevantOfficialSite } = await import('../contentGenerator.js');
  return findRelevantOfficialSite as FindRelevantOfficialSite;
}

export async function insertOfficialSiteTailBlock(input: {
  self: any;
  page: Page;
  title?: string;
  hashtags?: readonly string[];
  bodyText?: string;
  noCtaMode?: boolean;
  random?: () => number;
  findRelevantOfficialSite?: FindRelevantOfficialSite;
  fetchOfficialSite?: typeof fetch;
}): Promise<OfficialSiteTailResult> {
  const {
    self,
    page,
    title,
    hashtags,
    bodyText,
    noCtaMode = false,
    random,
    findRelevantOfficialSite,
    fetchOfficialSite,
  } = input;

  if (!shouldSearchOfficialSiteTail({ title, hashtags })) {
    return { attempted: false, inserted: false, cardReady: false };
  }

  try {
    const modeText = noCtaMode ? ' (CTA 없는 모드)' : '';
    self.log?.(`   🔗 [공식사이트] 행동 유발 키워드 감지${modeText} → 관련 공식 사이트 검색 중...`);

    const finder = findRelevantOfficialSite || await getDefaultOfficialSiteFinder();
    const siteResult = await finder(
      title || hashtags?.[0] || '',
      undefined,
      bodyText?.substring(0, 500),
    );

    const normalizedUrl = normalizeOfficialSiteUrl(siteResult.url);
    if (!siteResult.success || !normalizedUrl) {
      self.log?.(`   ⚠️ [공식사이트] 적합한 사이트 없음 → 건너뜀`);
      return { attempted: true, inserted: false, cardReady: false };
    }

    const availability = await verifyOfficialSiteUrlAvailable({
      url: normalizedUrl,
      fetchOfficialSite,
    });
    if (!availability.ok) {
      self.log?.(`   ⚠️ [공식사이트] 서비스 없음/오류 페이지로 판단되어 삽입 건너뜀 (${availability.reason})`);
      return { attempted: true, inserted: false, cardReady: false };
    }

    self.log?.(`   ✅ [공식사이트] 검증 완료: ${siteResult.siteName} (${normalizedUrl})`);

    const { cardReady } = await insertTailLinkCardBlock({
      self,
      page,
      label: pickOfficialSiteHook(random),
      url: normalizedUrl,
    });

    self.log?.(`   ✅ [공식사이트] 관련 사이트 바로가기 삽입 완료: ${siteResult.siteName}`);
    return { attempted: true, inserted: true, cardReady };
  } catch (siteError) {
    self.log?.(`   ⚠️ [공식사이트] 검색 실패 (무시): ${(siteError as Error).message}`);
    return { attempted: true, inserted: false, cardReady: false };
  }
}
