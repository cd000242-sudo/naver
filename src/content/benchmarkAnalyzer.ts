/**
 * SPEC-CONVERSION-001 L2-4.3 — 상위 블로거 글 구조·분량·키워드 분석기
 *
 * 입력: 수집된 블로그 글 raw HTML 또는 plain text + 메타(URL, 카테고리)
 * 출력: 분석 결과 JSON (구조 패턴, 분량 통계, TF-IDF 상위 키워드)
 *
 * 본 모듈은 *분석만* 수행. 수집은 top-blogger-collector(L2-4.2)가 책임.
 * 저작권 보호: 본문 원문은 분석 후 만료(TTL 7일 — L2-4.6 호출자 책임).
 *
 * 메모리 [silent 폴백 금지]: 분석 불가 입력은 명시 reason + 빈 결과.
 * 메모리 [추정 효과 금지]: "이 패턴 따르면 X% 상승" 약속 X — 통계만.
 */

export interface BenchmarkInput {
  readonly url: string;
  readonly category: string;
  readonly title: string;
  readonly bodyText: string;       // markdown 또는 plain
  readonly publishedAt?: string;   // ISO date
}

export interface HeadingInfo {
  readonly level: number; // 1~6
  readonly text: string;
  readonly position: number; // 본문 내 캐릭터 위치
}

export interface KeywordFreq {
  readonly term: string;
  readonly count: number;
  readonly density: number; // 0~1, count / totalTokens
}

export interface BenchmarkAnalysis {
  readonly url: string;
  readonly category: string;
  readonly title: string;
  readonly stats: {
    readonly charCount: number;
    readonly wordCount: number;
    readonly headingCount: number;
    readonly avgHeadingDistance: number;  // 헤딩 간 평균 글자수
    readonly paragraphCount: number;
    readonly imageHintCount: number;       // 본문 내 이미지 마크다운/태그 수
  };
  readonly headings: readonly HeadingInfo[];
  readonly topKeywords: readonly KeywordFreq[];
  readonly structureSignature: string; // 헤딩 레벨 시퀀스 ("1-2-2-2-2" 식)
  readonly analyzedAt: string;
  readonly fallbackReason?: string;
}

const MIN_BODY_CHARS = 200;
const TOP_KEYWORDS_N = 15;
const STOPWORDS_KO: ReadonlySet<string> = new Set([
  '있다', '없다', '같다', '하다', '되다', '있는', '없는',
  '그리고', '하지만', '그러나', '또한', '그래서', '따라서',
  '저는', '제가', '우리', '이건', '저건', '그건', '이거', '저거',
  '진짜', '정말', '너무', '엄청', '아주', '많이', '조금',
  '오늘', '어제', '지금', '이번', '다음', '저번',
  '입니다', '이에요', '예요', '거예요', '거든요',
]);

export function extractHeadings(body: string): HeadingInfo[] {
  if (!body) return [];
  const heads: HeadingInfo[] = [];
  const re = /(^|\n)(#{1,6})\s+([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const level = m[2].length;
    const text = m[3].trim().slice(0, 120);
    const position = m.index + (m[1] ? 1 : 0);
    heads.push({ level, text, position });
  }
  return heads;
}

export function tokenizeKorean(text: string): string[] {
  if (!text) return [];
  // 한글·영문 토큰 추출 (간단). 한글은 2자 이상 단위, 영문은 3자 이상.
  const tokens: string[] = [];
  const re = /[가-힣]{2,}|[A-Za-z]{3,}|\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].toLowerCase();
    if (!STOPWORDS_KO.has(t)) tokens.push(t);
  }
  return tokens;
}

export function topKeywords(tokens: readonly string[], topN: number = TOP_KEYWORDS_N): KeywordFreq[] {
  if (tokens.length === 0) return [];
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const total = tokens.length;
  return [...freq.entries()]
    .map(([term, count]) => ({ term, count, density: count / total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function analyzeBenchmark(input: BenchmarkInput): BenchmarkAnalysis {
  const analyzedAt = new Date().toISOString();
  const baseEmpty: BenchmarkAnalysis = {
    url: input.url,
    category: input.category,
    title: input.title,
    stats: {
      charCount: 0,
      wordCount: 0,
      headingCount: 0,
      avgHeadingDistance: 0,
      paragraphCount: 0,
      imageHintCount: 0,
    },
    headings: [],
    topKeywords: [],
    structureSignature: '',
    analyzedAt,
  };

  if (!input.bodyText || input.bodyText.length < MIN_BODY_CHARS) {
    return {
      ...baseEmpty,
      fallbackReason: `BODY_TOO_SHORT: ${input.bodyText?.length ?? 0}자 < ${MIN_BODY_CHARS}자`,
    };
  }

  const body = input.bodyText;
  const headings = extractHeadings(body);
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const tokens = tokenizeKorean(body);
  const imageHintCount = (body.match(/!\[[^\]]*\]\([^)]+\)|<img[^>]+>/g) ?? []).length;
  const structureSignature = headings.map((h) => String(h.level)).join('-');

  let avgHeadingDistance = 0;
  if (headings.length >= 2) {
    let sum = 0;
    for (let i = 1; i < headings.length; i++) {
      sum += headings[i].position - headings[i - 1].position;
    }
    avgHeadingDistance = Math.round(sum / (headings.length - 1));
  }

  return {
    url: input.url,
    category: input.category,
    title: input.title,
    stats: {
      charCount: body.length,
      wordCount: tokens.length,
      headingCount: headings.length,
      avgHeadingDistance,
      paragraphCount: paragraphs.length,
      imageHintCount,
    },
    headings,
    topKeywords: topKeywords(tokens),
    structureSignature,
    analyzedAt,
  };
}

export interface BenchmarkAggregate {
  readonly totalSamples: number;
  readonly perCategoryCount: Readonly<Record<string, number>>;
  readonly avgCharCount: number;
  readonly avgHeadingCount: number;
  readonly avgImageHintCount: number;
  readonly topStructureSignatures: readonly { signature: string; count: number }[];
}

export function aggregateBenchmarks(analyses: readonly BenchmarkAnalysis[]): BenchmarkAggregate {
  if (analyses.length === 0) {
    return {
      totalSamples: 0,
      perCategoryCount: {},
      avgCharCount: 0,
      avgHeadingCount: 0,
      avgImageHintCount: 0,
      topStructureSignatures: [],
    };
  }
  const valid = analyses.filter((a) => a.stats.charCount > 0);
  const perCat: Record<string, number> = {};
  const sigCount = new Map<string, number>();
  let charSum = 0;
  let headingSum = 0;
  let imgSum = 0;
  for (const a of valid) {
    perCat[a.category] = (perCat[a.category] ?? 0) + 1;
    sigCount.set(a.structureSignature, (sigCount.get(a.structureSignature) ?? 0) + 1);
    charSum += a.stats.charCount;
    headingSum += a.stats.headingCount;
    imgSum += a.stats.imageHintCount;
  }
  const topSigs = [...sigCount.entries()]
    .filter(([sig]) => sig.length > 0)
    .map(([signature, count]) => ({ signature, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const n = Math.max(1, valid.length);
  return {
    totalSamples: valid.length,
    perCategoryCount: perCat,
    avgCharCount: Math.round(charSum / n),
    avgHeadingCount: Math.round((headingSum / n) * 10) / 10,
    avgImageHintCount: Math.round((imgSum / n) * 10) / 10,
    topStructureSignatures: topSigs,
  };
}
