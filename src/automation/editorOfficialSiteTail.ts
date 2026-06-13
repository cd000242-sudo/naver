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
