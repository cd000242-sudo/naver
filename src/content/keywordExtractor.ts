/**
 * SPEC-CONVERSION-001 L3-3.1 — 본문 핵심 키워드 추출
 *
 * 본문(markdown 또는 plain)에서 *시각적으로 묘사 가능한* 명사·고유명사·구를
 * 빈도+섹션 가중치 기반으로 추출. 이미지 프롬프트 빌더(promptBuilder)가
 * 본 결과를 받아 이미지 생성 프롬프트에 주입한다.
 *
 * 결정론. 외부 의존성 X. NLP 라이브러리 미사용 (가벼운 휴리스틱).
 *
 * 메모리 [silent 폴백 금지]: 본문 짧으면 빈 결과 + reason.
 * 메모리 [추정 효과 금지]: "이미지 일치율 X% 상승" 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

export interface KeywordExtractInput {
  readonly bodyText: string;
  readonly title?: string;
  readonly maxKeywords?: number;
  readonly minTermLength?: number;          // 한글 기준 최소 글자수 (기본 2)
}

export interface ExtractedKeyword {
  readonly term: string;
  readonly score: number;                    // 가중 빈도 점수
  readonly count: number;                    // 본문 등장 횟수
  readonly inTitle: boolean;                 // 제목에 포함 여부
  readonly visualHint: 'concrete' | 'abstract' | 'unknown';
}

export interface KeywordExtractResult {
  readonly keywords: readonly ExtractedKeyword[];
  readonly totalTokens: number;
  readonly fallbackReason?: string;
}

const DEFAULT_MAX_KEYWORDS = 10;
const DEFAULT_MIN_TERM_LENGTH = 2;
const MIN_BODY_CHARS = 100;

// 제목 가중치, 헤딩 가중치
const WEIGHT_TITLE = 5;
const WEIGHT_HEADING = 3;

const STOPWORDS_KO: ReadonlySet<string> = new Set([
  '있다', '없다', '같다', '하다', '되다', '있는', '없는', '되는',
  '그리고', '하지만', '그러나', '또한', '그래서', '따라서',
  '저는', '제가', '우리', '이건', '저건', '그건', '이거', '저거', '거기',
  '진짜', '정말', '너무', '엄청', '아주', '많이', '조금',
  '오늘', '어제', '지금', '이번', '다음', '저번', '잠깐',
  '입니다', '이에요', '예요', '거예요', '거든요', '더라고요',
  '있어요', '없어요', '되어요', '해요', '드려요',
]);

// 시각적·구체적 명사 힌트 (이미지 프롬프트 변환 친화)
const CONCRETE_HINTS: ReadonlySet<string> = new Set([
  '제품', '공간', '장면', '음식', '카페', '맛집', '풍경', '사진',
  '디자인', '모습', '인테리어', '메뉴', '재료', '색상', '소재',
]);

function tokenize(text: string, minLen: number): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  // 한글 명사 후보 (2~10자), 영문 (3자+), 숫자+단위
  const re = /[가-힣]{2,10}|[A-Za-z]{3,}|\d+(?:\.\d+)?[가-힣%]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].toLowerCase();
    if (t.length < minLen) continue;
    if (STOPWORDS_KO.has(t)) continue;
    tokens.push(t);
  }
  return tokens;
}

function classifyVisualHint(term: string): 'concrete' | 'abstract' | 'unknown' {
  if (CONCRETE_HINTS.has(term)) return 'concrete';
  // 휴리스틱: 끝이 '감/적/식'이면 추상, '품/집/실/장/관'이면 구체
  if (/(감|적|식)$/.test(term)) return 'abstract';
  if (/(품|집|실|장|관|점|소|당)$/.test(term)) return 'concrete';
  return 'unknown';
}

function extractHeadingTexts(body: string): string[] {
  const heads: string[] = [];
  const re = /(^|\n)#{1,6}\s+([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) heads.push(m[2].trim());
  return heads;
}

export function extractKeywords(input: KeywordExtractInput): KeywordExtractResult {
  const body = input.bodyText ?? '';
  if (body.length < MIN_BODY_CHARS) {
    return {
      keywords: [],
      totalTokens: 0,
      fallbackReason: `BODY_TOO_SHORT: ${body.length}자 < ${MIN_BODY_CHARS}자`,
    };
  }

  const minLen = Math.max(1, input.minTermLength ?? DEFAULT_MIN_TERM_LENGTH);
  const maxKw = Math.max(1, input.maxKeywords ?? DEFAULT_MAX_KEYWORDS);

  const titleTokens = input.title ? new Set(tokenize(input.title, minLen)) : new Set<string>();
  const headingTokens = new Set<string>();
  for (const h of extractHeadingTexts(body)) {
    for (const t of tokenize(h, minLen)) headingTokens.add(t);
  }

  const allTokens = tokenize(body, minLen);
  const counts = new Map<string, number>();
  for (const t of allTokens) counts.set(t, (counts.get(t) ?? 0) + 1);

  const scored: ExtractedKeyword[] = [];
  for (const [term, count] of counts) {
    let score = count;
    if (titleTokens.has(term)) score += WEIGHT_TITLE;
    if (headingTokens.has(term)) score += WEIGHT_HEADING;
    scored.push({
      term,
      score,
      count,
      inTitle: titleTokens.has(term),
      visualHint: classifyVisualHint(term),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    keywords: scored.slice(0, maxKw),
    totalTokens: allTokens.length,
  };
}

/**
 * 추출 결과를 이미지 프롬프트 빌더에 넘길 수 있는 핵심 단어 배열로 변환.
 * concrete > unknown > abstract 순으로 정렬.
 */
export function selectVisualKeywords(result: KeywordExtractResult, n: number = 5): string[] {
  if (result.keywords.length === 0) return [];
  const ordered = [...result.keywords].sort((a, b) => {
    const aRank = a.visualHint === 'concrete' ? 0 : a.visualHint === 'unknown' ? 1 : 2;
    const bRank = b.visualHint === 'concrete' ? 0 : b.visualHint === 'unknown' ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    return b.score - a.score;
  });
  return ordered.slice(0, n).map((k) => k.term);
}
