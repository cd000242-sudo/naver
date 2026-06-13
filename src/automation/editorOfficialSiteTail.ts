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

    if (!siteResult.success || !siteResult.url) {
      self.log?.(`   ⚠️ [공식사이트] 적합한 사이트 없음 → 건너뜀`);
      return { attempted: true, inserted: false, cardReady: false };
    }

    self.log?.(`   ✅ [공식사이트] 검증 완료: ${siteResult.siteName} (${siteResult.url})`);

    const { cardReady } = await insertTailLinkCardBlock({
      self,
      page,
      label: pickOfficialSiteHook(random),
      url: siteResult.url,
    });

    self.log?.(`   ✅ [공식사이트] 관련 사이트 바로가기 삽입 완료: ${siteResult.siteName}`);
    return { attempted: true, inserted: true, cardReady };
  } catch (siteError) {
    self.log?.(`   ⚠️ [공식사이트] 검색 실패 (무시): ${(siteError as Error).message}`);
    return { attempted: true, inserted: false, cardReady: false };
  }
}
