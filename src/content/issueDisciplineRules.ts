// src/content/issueDisciplineRules.ts
// 사건/의혹 글 전용 검수 규칙 — 사장님 실측 지적 10항 중 "생성 후 자동 검수" 대상.
//
// [2026-09-04 사장님] 분쟁 사건 글을 읽고 열 가지를 짚었다. 그중 프롬프트로만
// 막기 어려운 여섯 가지를 여기서 탐지한다. 프롬프트(issue-claim-discipline.prompt)는
// 생성 시점에 억제하고, 이 모듈은 그럼에도 남은 것을 잡는다 — 지시는 흘러도
// 문자열 패턴은 흘리지 않는다.
//
// 탐지 범위는 이슈·사건형 카테고리(entertainment/society)로 한정한다. IC-3(해석 문장)과
// IC-4(개인 의견)는 일상·후기 글에서는 오히려 권장되는 문체라, 전 모드에 걸면
// 1인칭 체험 규칙과 정면으로 충돌한다.
//
// 확정형 범죄 표현(지적 2·6번)은 celebrityAssertionSanitizer 가 이미 렉시콘을 갖고 있다.
// 여기서 다시 정의하지 않고 그 판정을 그대로 빌린다 — 두 벌이 되면 반드시 갈라진다.

import { isRiskyAssertionSentence } from './celebrityAssertionSanitizer.js';

export type IssueDisciplineCode =
  | 'assertion'
  | 'amountConflation'
  | 'repetition'
  | 'ungroundedInterpretation'
  | 'authorOpinion'
  | 'procedureOverstatement';

export interface IssueDisciplineFinding {
  readonly code: IssueDisciplineCode;
  /** 문제 문장 원문 (치환 키로 쓰이므로 자르지 않는다). */
  readonly sentence: string;
  /** 교정 프롬프트에 그대로 넣는 지시. */
  readonly hint: string;
}

const HINTS: Record<IssueDisciplineCode, string> = {
  assertion:
    '확정형 범죄·비위 서술이다. "누가 무엇을 주장했는지"로 바꿔라 (예: "횡령했다" → "횡령이라고 주장했다").',
  amountConflation:
    '금액의 성격이 뭉개져 있다. 전체 피해 주장액과 증거 자료 기재액을 분리하고, 각 금액이 무엇인지 밝혀라.',
  repetition:
    '앞에서 이미 두 번 나온 사실을 또 반복한다. 이 문장에서 그 반복을 빼거나 문장을 삭제 수준으로 줄여라.',
  ungroundedInterpretation:
    '출처 없는 해석 문장이다. 말한 주체가 자료에 없으면 해석을 빼고 당사자 발언만 남겨라.',
  authorOpinion: '작성자 개인 의견 표현이다. 정보성 문체로 바꿔라.',
  procedureOverstatement:
    '법적 절차 상태를 과장했다. 죄명은 "거론했다", 사과 요구는 "대화의 여지를 남겼다" 수준으로 낮춰라.',
};

/** 해석·의견 판정에서 면제되는 attribution 마커. 주체가 밝혀져 있으면 해석이 아니라 인용이다. */
const ATTRIBUTION_RE =
  /에\s*따르면|측은|측이|측에서|밝혔|전했|말했|주장했|보도|기자|변호사|전문가|관계자|경찰|검찰|법원|재판부|소속사/;

const INTERPRETATION_RE =
  /(?:라는|다는)\s*(?:해석|분석|관측|시각|평가|지적)(?:도|이|은)?\s*(?:나온다|나오고|있다|제기)|로\s*보인다|것으로\s*보인다|라는\s*분석이다|것으로\s*풀이|전망이\s*나온다|해석되고\s*있다/;

const AUTHOR_OPINION_RE =
  /제\s*기준으로는|제가\s*보기에는|제\s*생각(?:에는|으로는|엔)|개인적으로는|솔직히\s*말(?:해|하면)|아무튼|어쨌든\s*제|사견/;

// 죄명이 '적용·성립·인정'된 것처럼 쓰거나, 사과 요구를 '합의'로 확대한 경우.
const PROCEDURE_OVERSTATEMENT_RE =
  /(?:사기|횡령|배임|명예훼손|공갈|절도)죄(?:가|를|는)?\s*(?:성립|적용|인정)|혐의(?:가|는)\s*(?:적용|인정)(?:됐|된|되)|합의(?:가|할|에)?\s*(?:가능성|여지|이를)|원만히\s*합의|합의\s*수순/;

// "이번에 처음", "최초 폭로" — 과거 기록을 확인하지 않고 쓰는 시점 단정(IC-6).
const FIRST_EVER_RE = /최초\s*(?:폭로|공개|제기)|처음\s*(?:나온|제기된|알려진)\s*(?:주장|의혹|폭로)|그동안\s*알려지지\s*않(?:았|은)/;

// 금액 토큰: "7억", "1억 5천만 원", "8억원", "1,500만원".
const AMOUNT_RE = /[0-9][0-9,.]*\s*(?:억|천만|백만|만)?\s*원|[0-9][0-9,.]*\s*억/g;

const DAMAGE_WORD_RE = /피해(?:액|금액|규모)|편취|가로챈|가로챘|빼돌린/;
const EVIDENCE_WORD_RE = /차용증|계약서|이체(?:내역|증)|영수증|증거\s*자료|공개한\s*자료/;
const CLAIM_MARKER_RE = /주장|추산|추정|밝혔|언급|거론|호소|라고\s*했/;

export function splitIssueSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?。？！])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeAmount(raw: string): string {
  return raw.replace(/[\s,]/g, '');
}

function collectAmounts(sentence: string): string[] {
  const found = sentence.match(AMOUNT_RE) || [];
  return Array.from(new Set(found.map(normalizeAmount)));
}

/**
 * IC-2 — 금액 혼동.
 * (1) 한 문장에 서로 다른 금액이 둘 이상 있으면서 '증거 자료'와 '전체 피해'를 함께 말한다.
 * (2) 피해액을 주장 표시 없이 확정 서술한다.
 */
export function detectAmountConflation(sentence: string): boolean {
  const amounts = collectAmounts(sentence);
  if (amounts.length === 0) return false;
  if (amounts.length >= 2 && EVIDENCE_WORD_RE.test(sentence) && DAMAGE_WORD_RE.test(sentence)) return true;
  if (DAMAGE_WORD_RE.test(sentence) && !CLAIM_MARKER_RE.test(sentence)) return true;
  return false;
}

/** IC-3 — 말한 주체 없이 해석·전망을 붙인 문장. */
export function detectUngroundedInterpretation(sentence: string): boolean {
  if (!INTERPRETATION_RE.test(sentence)) return false;
  return !ATTRIBUTION_RE.test(sentence);
}

/** IC-4 — 작성자 개인 의견. */
export function detectAuthorOpinion(sentence: string): boolean {
  return AUTHOR_OPINION_RE.test(sentence);
}

/** IC-5 · IC-6 · IC-7 — 절차 단계 과장, 합의 확대, 시점 단정. */
export function detectProcedureOverstatement(sentence: string): boolean {
  return PROCEDURE_OVERSTATEMENT_RE.test(sentence) || FIRST_EVER_RE.test(sentence);
}

/**
 * IC-1 — 같은 사실 3회 이상 반복.
 * 금액 토큰과 단서 문구("당사자 주장", "법적 판단 전")를 세어 3회째부터 그 문장을 집는다.
 * 2회까지는 허용이므로 세 번째 등장 문장만 findings 에 들어간다.
 */
export function detectRepeatedFacts(sentences: string[]): Map<number, string> {
  const counts = new Map<string, number>();
  const flagged = new Map<number, string>();
  const disclaimerKeys = ['당사자 주장', '법적 판단 전', '확정된 사실이 아', '수사 중'];

  sentences.forEach((sentence, index) => {
    const keys = new Set<string>(collectAmounts(sentence));
    for (const d of disclaimerKeys) if (sentence.includes(d)) keys.add(d);
    for (const key of keys) {
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      if (next > 2 && !flagged.has(index)) flagged.set(index, key);
    }
  });
  return flagged;
}

export function auditIssueDiscipline(bodyPlain: string): IssueDisciplineFinding[] {
  const sentences = splitIssueSentences(bodyPlain);
  const repeated = detectRepeatedFacts(sentences);
  const findings: IssueDisciplineFinding[] = [];
  const seen = new Set<string>();

  const add = (code: IssueDisciplineCode, sentence: string): void => {
    const dedupeKey = `${code}::${sentence}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    findings.push({ code, sentence, hint: HINTS[code] });
  };

  sentences.forEach((sentence, index) => {
    if (isRiskyAssertionSentence(sentence)) add('assertion', sentence);
    if (detectAmountConflation(sentence)) add('amountConflation', sentence);
    if (detectUngroundedInterpretation(sentence)) add('ungroundedInterpretation', sentence);
    if (detectAuthorOpinion(sentence)) add('authorOpinion', sentence);
    if (detectProcedureOverstatement(sentence)) add('procedureOverstatement', sentence);
    if (repeated.has(index)) add('repetition', sentence);
  });

  return findings;
}
