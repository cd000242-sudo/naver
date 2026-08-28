// src/content/factVerificationReport.ts
// 집필 후 검증 패스 — 본문의 사실 주장을 자료와 대조하고 "리포트"로만 돌려준다.
//
// [2026-08-28 사장님 지시] 외부 LLM 팩트체크 규칙에는 본문 맨 끝에
// "✅사실검증 | 주장 N개 중 …" 푸터를 붙이라는 항목이 있었다. 여기서는 붙이지 않는다.
//
// 이유: evidenceIntegrity.buildEvidenceMetaLeakRule 이 이미 반대 규칙을 강제하고 있다.
// 라이브 실측(포스트 224357080956)에서 "현재 자료에는 ~가 제시되지 않았으므로" 류
// 근거 메타 서술이 본문에 노출돼 독자가 이탈했다. 검증 결과는 글쓴이용 정보지
// 독자용 문장이 아니다. 그래서 같은 내용을 앱 리포트/로그로만 내보낸다.
//
// 경고 전용이다. 본문을 고치지도, 발행을 막지도 않는다
// (사장님 제약: 게이트는 경고-only, 발행은 유지).

import { findUngroundedNumbers } from './numericGroundingCheck.js';

/** 발행 시점이 지나면 거짓이 되는 상대 날짜 표현. */
const RELATIVE_DATE_RE =
  /(이번\s*달|이달|다음\s*달|지난\s*달|이번\s*주|다음\s*주|지난\s*주|올해|내년|작년|내일|모레|어제|오늘|최근\s*며칠)/g;

/** 자료가 그 표현을 그대로 쓴 경우에만 허용되는 수량 한정어. */
const ABSOLUTE_QUANTIFIER_RE =
  /(모든|전부|유일(?:한|하게)?|최초(?:로|의)?|최대(?:의|로)?|전국(?:적으로|의)?|100%|전\s*지자체)/g;

/** 자료 근거 없이 붙는 이유·전망 서술. */
const SPECULATION_RE =
  /([^.!?\n]{0,30}(?:것으로\s*보인다|것으로\s*풀이된다|전망이다|전망된다|분석된다|해석된다|기대된다|노린\s*것))/g;

/**
 * 월이 없는 날짜. "23일 0시", "29일과 30일" 처럼 월을 안 붙이면 발행일 기준으로 오독된다.
 * 앞쪽 40자 안에 "N월"이 있으면 그 월에 묶인 것으로 보고 넘어간다.
 * 기간 표현("30일간", "3일째", "며칠")은 날짜가 아니므로 제외한다.
 */
const DAY_WITHOUT_MONTH_RE = /(?<!\d\s?월\s?)(?<!\d)(\d{1,2})\s?일(?!\s?간|째|\s?동안|용|치)/g;

/** 검증 못 한 것을 독자에게 중계하는 서술. 지시로 막았는데도 실측에서 샜다. */
const UNVERIFIED_NARRATION_RE =
  /([^.!?\n]{0,40}(?:자료에\s*(?:함께\s*)?(?:나오|언급|없|있)|원문에\s*(?:특정|명시)|확인되지\s*않|제시되지\s*않|제공된\s*(?:문구|자료))[^.!?\n]{0,40})/g;

const MAX_PER_KIND = 5;
/** 이보다 짧은 자료로는 대조 자체가 성립하지 않는다. */
const MIN_SOURCE_CHARS = 500;

export type FactIssueKind =
  | 'UNGROUNDED_NUMBER'
  | 'RELATIVE_DATE'
  | 'UNGROUNDED_QUANTIFIER'
  | 'SPECULATION'
  | 'DAY_WITHOUT_MONTH'
  | 'UNVERIFIED_NARRATION';

export interface FactIssue {
  readonly kind: FactIssueKind;
  readonly examples: readonly string[];
  readonly message: string;
}

export interface FactVerificationReport {
  /** 대조할 자료가 없어 검사를 건너뛴 경우 false. */
  readonly checked: boolean;
  readonly totalClaims: number;
  readonly verifiedClaims: number;
  readonly issues: readonly FactIssue[];
  /** 앱 로그·리포트 UI용 한 줄. 본문에는 절대 넣지 않는다. */
  readonly summaryLine: string;
}

const EMPTY: FactVerificationReport = {
  checked: false,
  totalClaims: 0,
  verifiedClaims: 0,
  issues: [],
  summaryLine: '',
};

function collect(body: string, re: RegExp): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(re)) {
    const value = match[0].trim();
    if (value) seen.add(value);
    if (seen.size >= MAX_PER_KIND) break;
  }
  return [...seen];
}

/** 자료가 같은 표현을 쓰지 않은 한정어만 남긴다. */
function unsupportedQuantifiers(body: string, source: string): string[] {
  return collect(body, ABSOLUTE_QUANTIFIER_RE).filter((word) => !source.includes(word));
}

/**
 * 월이 앞에 붙지 않은 날짜만 남긴다.
 * 같은 문장 앞쪽 40자 안에 "N월"이 있으면 그 월에 묶인 것으로 본다.
 */
export function monthlessDates(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(DAY_WITHOUT_MONTH_RE)) {
    const at = match.index ?? 0;
    const window = body.slice(Math.max(0, at - 40), at);
    if (/\d{1,2}\s?월[^.!?\n]{0,20}$/.test(window)) continue;
    const value = match[0].trim();
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_PER_KIND) break;
  }
  return out;
}

export function buildFactVerificationReport(
  body: string | undefined,
  sourceText: string | undefined,
): FactVerificationReport {
  try {
    const text = String(body ?? '').trim();
    const source = String(sourceText ?? '').trim();
    if (!text || source.length < MIN_SOURCE_CHARS) return EMPTY;

    const issues: FactIssue[] = [];

    const ungroundedNumbers = findUngroundedNumbers(text, source);
    if (ungroundedNumbers.length > 0) {
      issues.push({
        kind: 'UNGROUNDED_NUMBER',
        examples: ungroundedNumbers,
        message: `자료에 없는 수치 ${ungroundedNumbers.length}건`,
      });
    }

    const relativeDates = collect(text, RELATIVE_DATE_RE);
    if (relativeDates.length > 0) {
      issues.push({
        kind: 'RELATIVE_DATE',
        examples: relativeDates,
        message: `상대 날짜 ${relativeDates.length}건 — 절대 날짜로 바꾸세요`,
      });
    }

    const quantifiers = unsupportedQuantifiers(text, source);
    if (quantifiers.length > 0) {
      issues.push({
        kind: 'UNGROUNDED_QUANTIFIER',
        examples: quantifiers,
        message: `자료에 없는 수량 한정어 ${quantifiers.length}건`,
      });
    }

    const speculation = collect(text, SPECULATION_RE);
    if (speculation.length > 0) {
      issues.push({
        kind: 'SPECULATION',
        examples: speculation,
        message: `자료 근거가 필요한 추정·전망 서술 ${speculation.length}건`,
      });
    }

    const monthless = monthlessDates(text);
    if (monthless.length > 0) {
      issues.push({
        kind: 'DAY_WITHOUT_MONTH',
        examples: monthless,
        message: `월 없는 날짜 ${monthless.length}건 — 발행 뒤 오독됩니다`,
      });
    }

    const narration = collect(text, UNVERIFIED_NARRATION_RE);
    if (narration.length > 0) {
      issues.push({
        kind: 'UNVERIFIED_NARRATION',
        examples: narration,
        message: `미검증 정보를 독자에게 중계한 서술 ${narration.length}건 — 삭제 대상`,
      });
    }

    // 검사 대상이 된 주장 수 = 수치 주장 + 위에서 걸린 표현들.
    const numberClaims = findUngroundedNumbers(text, source).length;
    const flagged = issues.reduce((sum, issue) => sum + issue.examples.length, 0);
    const totalClaims = Math.max(flagged, numberClaims);

    return {
      checked: true,
      totalClaims,
      verifiedClaims: Math.max(0, totalClaims - flagged),
      issues,
      summaryLine: describeFactVerification(totalClaims, flagged, issues),
    };
  } catch {
    return EMPTY;
  }
}

/** 앱 리포트 한 줄. 본문 푸터가 아니다 — 로그·UI 전용. */
export function describeFactVerification(
  totalClaims: number,
  flagged: number,
  issues: readonly FactIssue[],
): string {
  if (flagged === 0) {
    return `사실검증 | 검사한 주장 ${totalClaims}건, 확인 필요 0건`;
  }
  const detail = issues.map((issue) => issue.message).join(' · ');
  return `사실검증 | 검사한 주장 ${totalClaims}건 중 확인 필요 ${flagged}건 — ${detail}`;
}
