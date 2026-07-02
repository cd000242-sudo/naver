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

// [2026-07-02] 서버가 잘못된 경로를 HTTP 200으로 에러 페이지에 리다이렉트하는 케이스 차단.
//   실측: bokjiro.go.kr/ssis-crms → 200 + 최종 URL /error/error.html (본문엔 에러 '문구'가
//   없고 "Document" 제목 + "ERROR" 토큰뿐이라 문구 스캔으로 못 걸러짐).
//   따라서 응답 본문이 아니라 '최종 리다이렉트 URL 경로'가 에러 페이지인지 직접 판정한다.
const ERROR_PAGE_URL_PATTERN =
  /(?:^|\/)(?:error|errors|404|403|500|nopage|not[-_]?found)(?:\/|\.|$)|error[._-]?(?:page|html?|jsp|do|aspx?|php)/i;

export function isErrorPageUrl(candidateUrl?: string): boolean {
  try {
    const pathname = new URL(String(candidateUrl || '')).pathname.toLowerCase();
    return ERROR_PAGE_URL_PATTERN.test(pathname);
  } catch {
    return false;
  }
}

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
  // 요청 URL 자체가 이미 에러 페이지 경로면 fetch 전에 즉시 거부.
  if (isErrorPageUrl(normalized)) return { ok: false, reason: 'error-url' };

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

    // 200이지만 redirect follow 후 최종 URL이 에러 페이지면 거부 (bokjiro.go.kr/ssis-crms 사례).
    const finalUrl = (response as { url?: string }).url || normalized;
    if (isErrorPageUrl(finalUrl)) {
      return { ok: false, reason: `error-redirect:${finalUrl}` };
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
