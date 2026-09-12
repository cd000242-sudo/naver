// src/crawler/issueHarness/captionRelevanceGate.ts
//
// [2026-09-12 사장님 지적] "굳이 API로 비용 들여가면서 수집할 필요 없이 성능을 끌어낼 수
// 있잖아. 사이트가 아니라 일렉트론 앱인데."
//
// 맞는 지적이다. 지금까지는 이미지가 글과 맞는지를 Gemini Vision 으로 판별했다. 그런데
// 검색 소스는 이미지마다 **캡션 텍스트**를 같이 준다(네이버 이미지 API 의 title 은 원문
// 캡션에 가깝다). 사람도 사진을 보기 전에 캡션부터 읽는다. 텍스트로 알 수 있는 것을 그림으로
// 되살 이유가 없다.
//
// 이 판정기는 순수 함수다 — 네트워크도 모델도 쓰지 않는다.
//
// 무엇을 하는가
//   - 캡션·출처 주소에서 주제어(인물·작품·사건)가 실제로 나오는지 본다
//   - 검색어와 겹치는 것만으로는 통과시키지 않는다(검색어는 어차피 그 말로 찾았으니까)
//   - 근거가 없으면 통과시키지 않는다 — 빈 슬롯이 엉뚱한 사진보다 낫다(2026-08-17 정책 유지)
//
// 무엇을 못 하는가
//   - 워터마크·화질·구도는 텍스트로 알 수 없다. 그건 해상도·디코딩 검사와 Vision 게이트의 몫이다.
//   - 캡션이 아예 없는 소스는 판정 불가로 남는다. 없는 근거를 지어내지 않는다.

/** 판정에 쓸 최소 정보. 후보 전체를 받지 않아 테스트가 쉽다. */
export interface CaptionRelevanceInput {
  readonly caption?: string;
  readonly pageUrl?: string;
  readonly url?: string;
}

/** 이 글이 무엇에 관한 글인지. 주제어가 핵심이고 나머지는 보조다. */
export interface CaptionRelevanceContext {
  /** 인물·작품·팀 등 글의 중심 대상. 가장 강한 신호다. */
  readonly subject?: string;
  /** 이 이미지가 들어갈 소제목. */
  readonly heading?: string;
  /** 글의 메인 키워드. */
  readonly mainKeyword?: string;
}

export interface CaptionRelevanceVerdict {
  /** 통과 여부. 근거가 없으면 false. */
  readonly relevant: boolean;
  /** 0~100. 통과 판정과 별개로 순위를 매길 때 쓴다. */
  readonly score: number;
  /** 캡션에서 실제로 발견한 말들. 로그에 그대로 남겨 사람이 판단할 수 있게 한다. */
  readonly matched: readonly string[];
  /** 판정 불가(캡션·주소 텍스트가 아예 없음). */
  readonly undecidable: boolean;
}

/** 조사·기호를 떼고 비교 가능한 형태로 만든다. 형태소 분석기는 쓰지 않는다. */
function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s ]+/g, '')
    .replace(/[.,!?·•|/\\\-–—_()[\]{}"'`~:;#*<>]+/g, '');
}

/** 비교 단위로 쓸 낱말. 두 글자 미만은 우연히 겹치므로 버린다. */
export function relevanceTokens(value: string): string[] {
  const out: string[] = [];
  for (const raw of String(value || '').split(/[\s .,!?·•|/\\\-–—_()[\]{}"'`~:;#*<>]+/)) {
    const token = raw.trim().toLowerCase();
    if (token.length < 2) continue;
    if (/^\d+$/.test(token)) continue;
    out.push(token);
  }
  return out;
}

/** 이미지 주소에서 사람이 읽을 수 있는 부분만 뽑는다(파일명·경로). */
function readableFromUrl(url: string): string {
  try {
    const parsed = new URL(String(url));
    return decodeURIComponent(`${parsed.hostname} ${parsed.pathname}`);
  } catch {
    return '';
  }
}

const SUBJECT_POINTS = 60;
const HEADING_POINTS = 25;
const KEYWORD_POINTS = 15;

/** 통과 하한. 주제어 하나만 맞아도 통과하고, 소제목·키워드만으로는 통과하지 못한다. */
export const CAPTION_RELEVANCE_PASS_SCORE = SUBJECT_POINTS;

/**
 * 캡션 텍스트만으로 관련성을 판정한다. 네트워크·모델 호출 없음.
 *
 * 통과 조건은 하나다 — **주제어가 캡션(또는 출처 주소)에 실제로 나올 것.**
 * 소제목·키워드 겹침은 점수만 올리고 단독 통과는 못 시킨다. 소제목 말은 일반어가 많아
 * ("이유", "조합", "영화") 아무 사진에나 걸리기 때문이다.
 */
export function judgeCaptionRelevance(
  candidate: CaptionRelevanceInput,
  context: CaptionRelevanceContext,
): CaptionRelevanceVerdict {
  const haystackRaw = [
    String(candidate.caption || ''),
    readableFromUrl(String(candidate.pageUrl || '')),
    readableFromUrl(String(candidate.url || '')),
  ].join(' ').trim();

  if (!normalize(haystackRaw)) {
    return { relevant: false, score: 0, matched: [], undecidable: true };
  }

  const haystack = normalize(haystackRaw);
  const matched: string[] = [];
  let score = 0;

  const subjectTokens = relevanceTokens(context.subject || '');
  const subjectHit = subjectTokens.filter((t) => haystack.includes(normalize(t)));
  if (subjectHit.length > 0) {
    score += SUBJECT_POINTS;
    matched.push(...subjectHit);
  }

  const headingTokens = relevanceTokens(context.heading || '');
  const headingHit = headingTokens.filter((t) => t.length >= 3 && haystack.includes(normalize(t)));
  if (headingHit.length > 0) {
    score += Math.min(HEADING_POINTS, headingHit.length * 8);
    matched.push(...headingHit);
  }

  const keywordTokens = relevanceTokens(context.mainKeyword || '');
  const keywordHit = keywordTokens.filter((t) => haystack.includes(normalize(t)));
  if (keywordHit.length > 0) {
    score += Math.min(KEYWORD_POINTS, keywordHit.length * 8);
    matched.push(...keywordHit);
  }

  const unique = [...new Set(matched)];
  return {
    relevant: score >= CAPTION_RELEVANCE_PASS_SCORE,
    score: Math.min(100, score),
    matched: unique,
    undecidable: false,
  };
}
