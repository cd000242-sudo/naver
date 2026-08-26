// src/content/sourceFactChecklist.ts
// 원본에서 뽑은 핵심 사실을 프롬프트에 "목록"으로 박아 넣는다.
//
// [2026-08-26 사장님 실측] URL 모드로 뽑은 글의 핵심 fact 보존율이 17%였다.
// 원문 9,787자에서 사실을 6분의 1도 못 가져왔고, 나머지는 감상으로 채워졌다.
//
// 지시가 없어서가 아니다. contentUrlModeDirective 는 이미 이렇게 말하고 있었다.
//   "원본의 모든 사실(fact), 숫자, 인명, 지명, 제품명, 인용문, 사례를 빠짐없이 포함하라."
// 4만 자 프롬프트 맨 앞의 산문 한 줄이었고, 모델은 흘렸다.
//
// 이 세션에서 반복해서 확인한 것과 같은 패턴이다 — 산문 지시는 흘리고, 구조화된
// 목록·스키마 필드는 채운다(해시태그·요약 표에서 같은 일이 있었다).
// 그래서 "빠짐없이"라는 형용사 대신 **지켜야 할 사실 목록**을 준다.
//
// 검증기(sourceFidelityCheck)와 같은 추출기를 쓴다. 채점 기준과 지시가 어긋나면
// 모델이 지시를 다 따라도 점수가 안 오르기 때문이다.

import { extractCoreFacts } from './sourceFidelityCheck.js';

/** 목록에 올릴 최대 개수. 검증기 기본값(30)과 맞춘다. */
export const FACT_CHECKLIST_MAX = 30;

/** 이보다 짧은 원문은 검증기도 검사를 건너뛴다 — 목록도 만들지 않는다. */
const MIN_RAW_TEXT = 500;

export interface FactChecklistResult {
  readonly block: string;
  readonly facts: readonly string[];
}

const EMPTY: FactChecklistResult = { block: '', facts: [] };

export function buildSourceFactChecklist(
  rawText: string | null | undefined,
  max: number = FACT_CHECKLIST_MAX,
): FactChecklistResult {
  const text = String(rawText ?? '').trim();
  if (text.length < MIN_RAW_TEXT) return EMPTY;

  const facts = extractCoreFacts(text, max);
  if (facts.length === 0) return EMPTY;

  const numbered = facts.map((fact, i) => `  ${i + 1}. ${fact}`).join('\n');

  const block = `## 1-A. 반드시 본문에 들어가야 할 원본 사실 ${facts.length}개

아래는 원본에서 뽑아낸 핵심 사실이다. 이 글이 완성됐는지는 분량이 아니라
**이 목록을 다 다뤘는지**로 판단한다. 하나라도 빠지면 끝난 글이 아니다.

${numbered}

- 쓰는 방법: 목록을 그대로 나열하지 마라. 각 사실을 문장 안에 자연스럽게 녹인다.
  숫자·날짜·인명·인용문은 **원문 그대로** 쓴다(바꿔 말하지 마라).
- 인용문은 큰따옴표를 붙여 원문 그대로 옮긴다. 요약하거나 풀어쓰지 마라.
- 목록에 없는 사실도 원본에 있으면 함께 담아라. 이 목록은 최소선이지 전부가 아니다.
- ⛔ 목록을 다 담기 전에 글을 끝내지 마라. 감상·수식어로 자리를 채우고 사실을
  빠뜨리는 것이 가장 나쁜 실패다.
`;

  return { block, facts };
}

/**
 * 키워드 모드용 — URL 원본이 없어도 수집한 자료가 있으면 같은 목록을 준다.
 *
 * [2026-08-26 사장님 지시] "URL 글생성뿐만 아니라 키워드로 글생성도 마찬가지야."
 * 키워드 모드도 검색·크롤링으로 모은 자료(rawText)를 재료로 쓴다. 재료가 있는데
 * 결과물이 그 사실을 안 담는 문제는 URL 모드와 똑같다.
 *
 * URL 모드와 다른 점 하나: 그쪽은 "원본 한 편을 재구성"하지만 키워드 모드는
 * 여러 자료를 모은 것이라 서로 어긋나는 내용이 섞일 수 있다. 그래서 "빠짐없이"
 * 대신 "확인된 것만, 확인된 대로"를 앞세운다.
 */
export function buildKeywordFactChecklist(
  rawText: string | null | undefined,
  max: number = FACT_CHECKLIST_MAX,
): FactChecklistResult {
  const text = String(rawText ?? '').trim();
  if (text.length < MIN_RAW_TEXT) return EMPTY;

  const facts = extractCoreFacts(text, max);
  if (facts.length === 0) return EMPTY;

  const numbered = facts.map((fact, i) => `  ${i + 1}. ${fact}`).join('\n');

  const block = `[수집 자료에서 지켜야 할 사실 ${facts.length}개]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

아래는 이번 글을 위해 모은 자료에서 뽑아낸 사실이다. 글이 완성됐는지는 분량이 아니라
**이 목록을 다 다뤘는지**로 판단한다.

${numbered}

- 각 사실을 문장 안에 자연스럽게 녹인다. 목록을 그대로 나열하지 마라.
- 숫자·날짜·인명·인용문은 **자료에 있는 그대로** 쓴다. 반올림하거나 바꿔 말하지 마라.
- 자료끼리 어긋나면 지어내서 맞추지 말고, 어느 쪽이 어떤 조건에서 맞는지 그대로 쓴다.
- 목록에 없어도 자료에 있는 사실은 함께 담아라. 이 목록은 최소선이다.
- ⛔ 사실을 빠뜨린 채 감상·수식어로 자리를 채우지 마라. 그게 가장 나쁜 실패다.
- ⛔ 목록에 없는 숫자·날짜·인용을 지어내지 마라. 없는 것은 없다고 쓴다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

  return { block, facts };
}
