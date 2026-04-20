/**
 * Long-tail depth scanner.
 *
 * 2026 통합랭킹의 핵심 전략은 "롱테일 수직 파고들기" — 빅키워드 정면돌파
 * 대신 2~4어절 조합 키워드로 "디테일한 틈새"를 차지하는 것이다. 나무위키
 * /공식사이트가 다루지 않는 구체 영역이 블로그의 생존 전략.
 *
 * 이 스캐너는:
 *   1) 메인 키워드의 어절 수를 세서 너무 짧으면 경고 (1어절 = 빅키워드 위험)
 *   2) 제목 내 롱테일 확장 패턴을 검출 (지역/조건/수치/기간/대상 한정어)
 *   3) 본문 내 롱테일 어휘(구체 명사) 밀도를 대략 측정
 *
 * 수정은 하지 않는다. 호출자가 경고 정보로 재생성 판단.
 */

export interface LongtailDepthResult {
  /** Main keyword word count (공백 분리 어절). */
  keywordWordCount: number;
  /** 1~2어절 keyword = 빅키워드, 3+ 어절 = 롱테일. */
  isLonggetail: boolean;
  /** Title contains at least one modifier (numeric / temporal / targeting). */
  titleHasModifier: boolean;
  modifiersFound: string[];
  /** Count of "concrete noun" indicators in body (조건/기준/차이/비교 etc). */
  bodyConcretenessSignals: number;
  warnings: string[];
}

/**
 * Modifier patterns that indicate long-tail narrowing in the title.
 */
const TITLE_MODIFIER_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'temporal', regex: /\d+\s*(년|월|일|주|시간|분)/ },
  { name: 'numeric', regex: /\d+\s*(가지|개|%|원|위|등)/ },
  { name: 'target', regex: /(대학생|주부|직장인|자영업자|초보|전문가|어르신|2030|3040)/ },
  { name: 'condition', regex: /(조건|기준|없을\s*때|안\s*될\s*때|못할\s*때)/ },
  { name: 'location', regex: /(강남|홍대|서울|지방|수도권|\S+역)/ },
  { name: 'comparison', regex: /(vs|비교|차이|대안)/i },
  { name: 'method', regex: /(꿀팁|법|방법|수단|가이드|루틴)/ },
];

/**
 * Body-level indicators of concrete, long-tail-worthy content.
 */
const BODY_CONCRETENESS_PATTERNS: RegExp[] = [
  /\d+\s*(분|초|시간|일|주|개월|년)\s*(만에|내|이내)/,
  /\d+\s*%\s*(할인|절약|감소|증가)/,
  /(단계|조건|기준|절차)\s*\d+/,
  /(포인트|핵심|비교)\s*(\d+|세|가지)/,
];

export function scanLongtailDepth(
  title: string,
  mainKeyword: string,
  bodyText: string,
): LongtailDepthResult {
  const warnings: string[] = [];

  // 1) Main keyword word count
  const keyword = (mainKeyword || '').trim();
  const keywordWords = keyword ? keyword.split(/\s+/).filter(Boolean) : [];
  const keywordWordCount = keywordWords.length;
  const isLonggetail = keywordWordCount >= 3;

  if (keywordWordCount === 1 && keyword.length < 6) {
    warnings.push(
      `메인 키워드가 1어절("${keyword}")로 너무 짧습니다. 나무위키/공식사이트와 정면 경쟁 — 롱테일 2~4어절 조합 권장`,
    );
  } else if (keywordWordCount === 2 && keyword.length < 10) {
    warnings.push(
      `메인 키워드가 2어절("${keyword}")로 여전히 빅키워드 영역. 구체 한정어(조건/기간/대상) 추가 권장`,
    );
  }

  // 2) Title modifiers
  const modifiersFound: string[] = [];
  for (const { name, regex } of TITLE_MODIFIER_PATTERNS) {
    if (regex.test(title)) modifiersFound.push(name);
  }
  const titleHasModifier = modifiersFound.length > 0;
  if (!titleHasModifier) {
    warnings.push(
      '제목에 구체 한정어(숫자/기간/대상/조건/비교)가 없습니다. 롱테일 효과 약함',
    );
  }

  // 3) Body concreteness signals
  let bodyConcretenessSignals = 0;
  for (const p of BODY_CONCRETENESS_PATTERNS) {
    const matches = bodyText.match(p);
    if (matches) bodyConcretenessSignals += matches.length;
  }
  if (bodyConcretenessSignals < 2 && bodyText.length > 500) {
    warnings.push(
      `본문에 구체 수치/조건/절차 신호가 ${bodyConcretenessSignals}개. 2개 이상 권장 (DIA+ 1차 경험 데이터 신호)`,
    );
  }

  return {
    keywordWordCount,
    isLonggetail,
    titleHasModifier,
    modifiersFound,
    bodyConcretenessSignals,
    warnings,
  };
}
