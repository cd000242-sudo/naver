/**
 * SPEC-CONVERSION-001 L2-1.5 — Stage 4: 팩트 게이트
 *
 * 5단계 체인드 파이프라인의 4단계.
 * Stage 3(draftWriter) 결과의 본문 초안을 받아, 환각 가능 패턴을 추출하고
 * 원문(rawText) 또는 외부 fact-check 소스와 매칭. 검증 실패 문장은 호출자에게
 * 명시 반환 (호출자가 재생성·삭제·통과 결정).
 *
 * SPEC-REVIEW-001 P3 의존:
 *   - SPEC 명시 파일은 src/content/factChecker.ts 였으나
 *   - 실제로는 src/naverFactCheckRAG.ts에 별도 형태로 구현됨 (v2.10.73-74)
 *   - 본 factGate는 그 인프라를 감싸는 stage 4 어댑터
 *
 * 메모리 [silent 폴백 금지]: 검증 실패 문장을 silent 삭제 X — 명시 반환만.
 * 메모리 [추정 효과 금지]: hallucinationRate 임계 약속 X — 운영 후 calibrate.
 */

import { loadChainPrompt } from './chainPromptLoader';

export interface FactGateInput {
  readonly draft: string;
  readonly sourceText?: string; // 원문 (URL 모드일 때만)
  readonly minClaimLengthChars?: number;
  readonly maxClaimsToCheck?: number;
}

export interface ClaimCandidate {
  readonly claim: string;
  readonly type: 'number' | 'duration' | 'comparison' | 'experience';
  readonly span: readonly [number, number]; // 본문 내 위치
}

export interface FactGateResult {
  readonly passed: boolean;
  readonly totalClaims: number;
  readonly verifiedClaims: number;
  readonly unverifiedClaims: readonly ClaimCandidate[];
  readonly verificationRate: number; // 0~1
  readonly reason?: string;
}

const DEFAULT_MIN_CLAIM_CHARS = 3; // "2주간"·"1년" 같은 짧은 기간 표현 허용
const DEFAULT_MAX_CLAIMS = 30;
const DEFAULT_VERIFICATION_THRESHOLD = 0.8; // 80% 이상 검증되어야 pass
const MIN_DRAFT_FOR_GATE = 500; // 500자 미만 초안은 검증 스킵

/**
 * 본문에서 검증 대상 주장(claim) 후보 추출.
 * - 숫자+단위: "12.5%", "300자", "1만원"
 * - 기간: "2주간", "한 달 동안"
 * - 비교: "X보다 Y", "더 ~한"
 * - 경험: "써보니", "직접 ~ 했어요"
 */
export function extractClaims(draft: string, max: number = DEFAULT_MAX_CLAIMS): ClaimCandidate[] {
  if (!draft) return [];
  const claims: ClaimCandidate[] = [];
  let m: RegExpExecArray | null;

  const isOverlap = (start: number, end: number): boolean =>
    claims.some((c) => Math.max(c.span[0], start) < Math.min(c.span[1], end));

  // 1-2 통합: 숫자+단위 매칭 후 단위가 기간이면 duration, 아니면 number로 분류
  //    character class에는 *단위 문자만* (한글 [가-힣] 전체 X — "150만원입니다" greedy 방지)
  const numberPattern = /\d+(?:[.,]\d+)?(?:%|원|만원|만|천원|천|백|억원|억|배|회|개월|개|분|초|일|주|달|년|시간|간|동안|째|kg|g|cm|m|mm|km|ml|L|°C|°F)+/g;
  while ((m = numberPattern.exec(draft)) !== null && claims.length < max) {
    const text = m[0];
    const start = m.index;
    const end = m.index + text.length;
    if (text.length < DEFAULT_MIN_CLAIM_CHARS || text.length > 20) continue;
    if (isOverlap(start, end)) continue;
    // 기간 단위(일/주/개월/달/년/시간) 포함 시 duration
    const isDuration = /(일|주|개월|달|년|시간)/.test(text);
    claims.push({ claim: text, type: isDuration ? 'duration' : 'number', span: [start, end] });
  }

  // 3. 한글 기간 표현 ("한 달 동안", "두 주 동안")
  if (claims.length < max) {
    const koDurationPattern = /(?:한|두|세|네|다섯|여섯|일|이|삼|사|오|육|칠|팔|구|십)\s?(?:일|주|개월|달|년|시간)\s*(?:간|동안|째|만에)?/g;
    while ((m = koDurationPattern.exec(draft)) !== null && claims.length < max) {
      const text = m[0].trim();
      const start = m.index;
      const end = m.index + m[0].length;
      if (text.length < DEFAULT_MIN_CLAIM_CHARS) continue;
      if (isOverlap(start, end)) continue;
      claims.push({ claim: text, type: 'duration', span: [start, end] });
    }
  }

  // 3. 경험 단언 (REVIEW-001 P0 — "써보니", "직접")
  //    기간 표현은 위 duration에서 이미 잡았으므로 여기서는 중복 X.
  if (claims.length < max) {
    const expPattern = /(?:써보니|직접 [가-힣]{2,8}|테스트해보니|체험해보니|사용해보니)/g;
    while ((m = expPattern.exec(draft)) !== null && claims.length < max) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (!isOverlap(start, end)) {
        claims.push({ claim: m[0], type: 'experience', span: [start, end] });
      }
    }
  }

  return claims.slice(0, max);
}

/**
 * 주장(claim)이 sourceText에 보존됐는지 검증.
 * 정확/부분 매칭 — sourceFidelityCheck와 동일 휴리스틱.
 */
function isClaimVerified(claim: string, sourceText: string): boolean {
  if (!sourceText) return false;
  const haystack = sourceText.replace(/\s+/g, '');
  const needle = claim.replace(/\s+/g, '');
  if (haystack.includes(needle)) return true;
  if (needle.length >= 5) {
    const partial = needle.slice(0, Math.floor(needle.length * 0.8));
    if (haystack.includes(partial)) return true;
  }
  return false;
}

export function evaluateFactGate(input: FactGateInput): FactGateResult {
  const draft = input.draft ?? '';

  if (draft.length < MIN_DRAFT_FOR_GATE) {
    return {
      passed: true,
      totalClaims: 0,
      verifiedClaims: 0,
      unverifiedClaims: [],
      verificationRate: 1,
      reason: `초안 ${draft.length}자 < ${MIN_DRAFT_FOR_GATE}자 — 검증 스킵`,
    };
  }

  // sourceText 없으면 (키워드 모드) — 경험·기간만 검증, 숫자는 통과 허용
  const claims = extractClaims(draft, input.maxClaimsToCheck ?? DEFAULT_MAX_CLAIMS);
  const totalClaims = claims.length;

  if (totalClaims === 0) {
    return {
      passed: true,
      totalClaims: 0,
      verifiedClaims: 0,
      unverifiedClaims: [],
      verificationRate: 1,
      reason: '검증 대상 주장 없음 — 통과',
    };
  }

  const sourceText = input.sourceText ?? '';
  const unverified: ClaimCandidate[] = [];
  let verified = 0;

  for (const c of claims) {
    if (sourceText && isClaimVerified(c.claim, sourceText)) {
      verified++;
    } else if (!sourceText && c.type === 'number') {
      // sourceText 없으면 숫자는 검증 불가, 통과 허용
      verified++;
    } else {
      unverified.push(c);
    }
  }

  const verificationRate = totalClaims > 0 ? verified / totalClaims : 1;
  const passed = verificationRate >= DEFAULT_VERIFICATION_THRESHOLD;

  return {
    passed,
    totalClaims,
    verifiedClaims: verified,
    unverifiedClaims: unverified.slice(0, 15),
    verificationRate,
    reason: passed
      ? undefined
      : `팩트 검증율 ${(verificationRate * 100).toFixed(0)}% (임계 ${(DEFAULT_VERIFICATION_THRESHOLD * 100).toFixed(0)}%) — 미검증 ${unverified.length}건`,
  };
}

export function buildFactGateRetryInstruction(result: FactGateResult): string {
  if (result.passed) return '';
  const unverifiedList = result.unverifiedClaims
    .slice(0, 10)
    .map((c) => `  • [${c.type}] "${c.claim}"`)
    .join('\n');

  return loadChainPrompt('stage4_factgate', {
    VERIFICATION_RATE_PCT: (result.verificationRate * 100).toFixed(0),
    UNVERIFIED_COUNT: String(result.unverifiedClaims.length),
    UNVERIFIED_LIST: unverifiedList || '  (없음)',
  });
}
