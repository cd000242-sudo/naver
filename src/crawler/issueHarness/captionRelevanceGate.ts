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
//
// [2026-10-08] 통과 조건 강화 — 주제어 하나만으로는 더 이상 통과하지 못한다.
//   주제어(누구) + 소제목/장면 근거(무슨 장면) 둘 다 있어야 한다. 장면 근거는 소제목의
//   비일반어(또는 쿼리 플랜의 행사·팬덤 검색어)가 캡션/주소에 실제로 나오는 것이다.
//   일반어("근황", "사진")·숫자+단위("36세")는 근거가 아니다(relevanceVocabulary.ts).
//   소제목에 쓸 만한 낱말이 하나도 없으면 그 소제목만 예전처럼 주제어 단독 규칙으로 내려간다.

import { relevanceTokens, sceneEvidenceTokens, stemKorean } from './relevanceVocabulary.js';

export { relevanceTokens };

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
  /** 쿼리 플랜이 이 소제목에 준 행사·팬덤 검색어, 프로그램명. 장면 근거 후보다. */
  readonly sceneTerms?: readonly string[];
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
  /** 캡션·주소에서 발견한 장면 근거(소제목·행사 낱말). */
  readonly sceneMatched: readonly string[];
  /** false 면 소제목에 쓸 낱말이 없어 주제어 단독 규칙으로 판정했다. */
  readonly sceneRequired: boolean;
}

/** 조사·기호를 떼고 비교 가능한 형태로 만든다. 형태소 분석기는 쓰지 않는다. */
function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s ]+/g, '')
    .replace(/[.,!?·•|/\\\-–—_()[\]{}"'`~:;#*<>]+/g, '');
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

/** 통과 하한. 주제어 점수가 바닥이고, 소제목·키워드만으로는 통과하지 못한다. */
export const CAPTION_RELEVANCE_PASS_SCORE = SUBJECT_POINTS;

/** 단어 경계를 보존한 비교용 문자열 — 장면 낱말이 두 단어에 걸쳐 우연히 맞는 것을 막는다. */
function toSpaced(value: string): string {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** 장면 낱말(+조사 뗀 형태)이 단어 안에 실제로 들어 있는지. */
function sceneTokenPresent(spaced: string, token: string): boolean {
  const forms = new Set([token, stemKorean(token)]);
  for (const form of forms) {
    if (form.length >= 2 && spaced.includes(form)) return true;
  }
  return false;
}

/**
 * 캡션 텍스트만으로 관련성을 판정한다. 네트워크·모델 호출 없음.
 *
 * 통과 조건은 둘이다.
 *   1) 주제어가 캡션(또는 출처 주소)에 실제로 나올 것 — 누구의 사진인가.
 *   2) 소제목/장면 낱말이 캡션에 나올 것 — 어떤 장면의 사진인가.
 * 2)의 낱말은 일반어·숫자+단위를 뺀 것이다(relevanceVocabulary.ts). 소제목에 그런 낱말이
 * 하나도 없으면 sceneRequired=false 로 그 소제목만 주제어 단독 규칙으로 내려간다 — 막연한
 * 소제목이 영원히 빈 슬롯으로 남지 않게 하되, 낱말이 있는 소제목은 절대 느슨해지지 않는다.
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

  const sceneTokens = sceneEvidenceTokens(context);
  const sceneRequired = sceneTokens.length > 0;

  if (!normalize(haystackRaw)) {
    return { relevant: false, score: 0, matched: [], undecidable: true, sceneMatched: [], sceneRequired };
  }

  const haystack = normalize(haystackRaw);
  const spaced = toSpaced(haystackRaw);
  const matched: string[] = [];
  let score = 0;

  const subjectTokens = relevanceTokens(context.subject || '');
  const subjectHit = subjectTokens.filter((t) => haystack.includes(normalize(t)));
  if (subjectHit.length > 0) {
    score += SUBJECT_POINTS;
    matched.push(...subjectHit);
  }

  const sceneHit = sceneTokens.filter((t) => sceneTokenPresent(spaced, t));
  if (sceneHit.length > 0) {
    score += Math.min(HEADING_POINTS, sceneHit.length * 8);
    matched.push(...sceneHit);
  }

  const keywordTokens = relevanceTokens(context.mainKeyword || '');
  const keywordHit = keywordTokens.filter((t) => haystack.includes(normalize(t)));
  if (keywordHit.length > 0) {
    score += Math.min(KEYWORD_POINTS, keywordHit.length * 8);
    matched.push(...keywordHit);
  }

  const sceneOk = !sceneRequired || sceneHit.length > 0;
  const unique = [...new Set(matched)];
  return {
    relevant: score >= CAPTION_RELEVANCE_PASS_SCORE && sceneOk,
    score: Math.min(100, score),
    matched: unique,
    undecidable: false,
    sceneMatched: sceneHit,
    sceneRequired,
  };
}

/**
 * Keeps only candidates whose caption/URL passes the strict gate. Used before downloading in
 * free mode and for the broad subject-only fallback in every mode, so generic subject photos
 * never land under a specific heading. Pure; order is preserved.
 */
export function filterByCaptionEvidence<T extends CaptionRelevanceInput>(
  pool: readonly T[],
  subjectContext: { readonly mainSubject?: string; readonly heading?: string } | undefined,
  sceneTerms?: readonly string[],
): T[] {
  const context: CaptionRelevanceContext = {
    subject: subjectContext?.mainSubject,
    heading: subjectContext?.heading,
    mainKeyword: subjectContext?.mainSubject,
    sceneTerms: (sceneTerms || []).filter(Boolean),
  };
  return pool.filter((candidate) => judgeCaptionRelevance(candidate, context).relevant);
}
