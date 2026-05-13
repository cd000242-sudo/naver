/**
 * [v2.10.169] 환각(Hallucination) 표지 탐지 — 원본 vs 결과 의미 왜곡 차단.
 *
 * 사용자 보고 사례 (2026-05-13):
 *   - 원본: 정준하의 "이중생활" = 비공개 *기부/선행* (긍정적)
 *   - 결과: "이중생활" = *폭로/논란/민낯* (부정적 환각)
 *   - 소제목은 원본 충실, 본문에서 *의미 왜곡* 환각 발생
 *
 * 핵심 검증:
 *   1. 한글 인명/명사 보존율 (sourceFidelityCheck 영문 위주 한계 보완)
 *   2. 감정 방향성(positive/negative) mismatch 탐지
 *   3. 원본 *없는* 부정 키워드가 결과에 *있으면* 환각 의심
 *
 * 차단 기준 (보수적 — 정상 글 false-positive 방지):
 *   - sentimentMismatch > 0.5 AND positiveOriginal > 3 AND negativeResult > 3
 *   - 한 가지 신호만으로는 차단 안 함 (warning만)
 */

export interface HallucinationCheckResult {
  readonly isLikelyHallucinated: boolean;
  readonly sentimentMismatch: number;  // 0~1
  readonly positiveOriginal: number;
  readonly negativeOriginal: number;
  readonly positiveResult: number;
  readonly negativeResult: number;
  readonly suspiciousNegativeKeywords: readonly string[];  // 원본에 없는데 결과에 있는 부정 키워드
  readonly missingPositiveKeywords: readonly string[];     // 원본에 있는데 결과에 없는 긍정 키워드
  readonly warnings: readonly string[];
}

// 한글 긍정 어휘 (기부/선행/감동 등)
const POSITIVE_KEYWORDS = [
  '기부', '후원', '선행', '봉사', '도움', '나눔', '기증', '헌신',
  '진심', '진정성', '영향력', '선한', '아름다운',
  '감동', '존경', '훈훈', '따뜻', '사랑', '격려', '응원',
  '친절', '배려', '겸손', '솔직', '정직', '성실',
  '뜻깊', '의미있', '값진', '귀한', '소중',
  '희망', '용기', '희생', '헌신적', '아낌없',
];

// 한글 부정 어휘 (폭로/논란/비판 등) — *AI 환각 일반 패턴*
const NEGATIVE_KEYWORDS = [
  '폭로', '논란', '의혹', '비판', '비난', '비방', '비웃',
  '실망', '분노', '충격', '경악', '눈물바다', '난리',
  '민낯', '이중성', '위선', '거짓', '사기', '기만',
  '추락', '몰락', '하락', '위기', '갈등', '분쟁',
  '결별', '파국', '파탄', '결말', '종말',
  '의심', '수상', '의문', '석연치 않', '미심쩍',
  '진실 공방', '진실은', '실체', '뒷이야기', '내막',
];

/**
 * 텍스트에서 긍정/부정 어휘 출현 횟수 계산.
 */
function countSentimentKeywords(text: string): { positive: number; negative: number } {
  if (!text) return { positive: 0, negative: 0 };
  const t = String(text);
  let positive = 0;
  let negative = 0;
  for (const kw of POSITIVE_KEYWORDS) {
    const matches = t.match(new RegExp(kw, 'g'));
    if (matches) positive += matches.length;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    const matches = t.match(new RegExp(kw, 'g'));
    if (matches) negative += matches.length;
  }
  return { positive, negative };
}

/**
 * 환각 의심 표지 탐지.
 *
 * @param rawText - 크롤링된 원본 텍스트
 * @param resultBody - LLM 생성 결과 본문
 */
export function checkHallucination(rawText: string, resultBody: string): HallucinationCheckResult {
  const warnings: string[] = [];
  const suspiciousNegative: string[] = [];
  const missingPositive: string[] = [];

  const orig = countSentimentKeywords(rawText);
  const result = countSentimentKeywords(resultBody);

  // 1. 원본에 없는 부정 키워드가 결과에 *있으면* 환각 의심
  for (const kw of NEGATIVE_KEYWORDS) {
    const origHas = rawText.includes(kw);
    const resultHas = resultBody.includes(kw);
    if (!origHas && resultHas) {
      suspiciousNegative.push(kw);
    }
  }

  // 2. 원본에 있는 긍정 키워드가 결과에 *없으면* 누락 의심
  for (const kw of POSITIVE_KEYWORDS) {
    const origHas = rawText.includes(kw);
    const resultHas = resultBody.includes(kw);
    if (origHas && !resultHas) {
      missingPositive.push(kw);
    }
  }

  // 3. sentiment mismatch 점수 계산
  // 원본의 dominant sentiment vs 결과의 dominant sentiment
  let sentimentMismatch = 0;
  const origTotal = orig.positive + orig.negative;
  const resultTotal = result.positive + result.negative;
  if (origTotal >= 3 && resultTotal >= 3) {
    // 원본 긍정 ratio - 결과 긍정 ratio (절대값)
    const origPosRatio = orig.positive / origTotal;
    const resultPosRatio = result.positive / resultTotal;
    sentimentMismatch = Math.abs(origPosRatio - resultPosRatio);
  }

  // 4. 차단 판정 (보수적 — 강한 신호 2개 이상 필요)
  // - sentimentMismatch > 0.5 (positive↔negative 큰 차이)
  // - 원본 긍정 ≥ 3 + 결과 부정 ≥ 3 (원본은 긍정인데 결과는 부정)
  const isLikelyHallucinated =
    sentimentMismatch > 0.5 &&
    orig.positive >= 3 &&
    result.negative >= 3 &&
    suspiciousNegative.length >= 2;

  // 경고 메시지 생성
  if (suspiciousNegative.length >= 3) {
    warnings.push(`원본에 없는 부정 키워드 ${suspiciousNegative.length}개 결과에 출현: ${suspiciousNegative.slice(0, 5).join(', ')}`);
  }
  if (missingPositive.length >= 3) {
    warnings.push(`원본의 긍정 키워드 ${missingPositive.length}개 결과에 누락: ${missingPositive.slice(0, 5).join(', ')}`);
  }
  if (sentimentMismatch > 0.4) {
    const origMain = orig.positive >= orig.negative ? '긍정' : '부정';
    const resultMain = result.positive >= result.negative ? '긍정' : '부정';
    warnings.push(`감정 방향 mismatch: 원본=${origMain}(P${orig.positive}/N${orig.negative}) → 결과=${resultMain}(P${result.positive}/N${result.negative})`);
  }

  return {
    isLikelyHallucinated,
    sentimentMismatch,
    positiveOriginal: orig.positive,
    negativeOriginal: orig.negative,
    positiveResult: result.positive,
    negativeResult: result.negative,
    suspiciousNegativeKeywords: suspiciousNegative.slice(0, 10),
    missingPositiveKeywords: missingPositive.slice(0, 10),
    warnings,
  };
}

/**
 * 환각 의심 시 LLM 재시도용 추가 지시문 생성.
 */
export function buildHallucinationRetryInstruction(result: HallucinationCheckResult): string {
  if (!result.isLikelyHallucinated && result.warnings.length === 0) return '';

  const lines: string[] = [
    '',
    '🚨 [환각 의심 — 원본 의미 왜곡 가능성]',
  ];

  if (result.sentimentMismatch > 0.4) {
    const origMain = result.positiveOriginal >= result.negativeOriginal ? '긍정' : '부정';
    lines.push(`- 원본의 감정 방향은 "${origMain}"이다. 결과도 같은 방향으로 작성하라.`);
  }

  if (result.suspiciousNegativeKeywords.length > 0) {
    lines.push(`- 원본에 없는 다음 부정 키워드 사용 절대 금지: ${result.suspiciousNegativeKeywords.slice(0, 5).join(', ')}`);
  }

  if (result.missingPositiveKeywords.length > 0) {
    lines.push(`- 원본의 다음 핵심 긍정 키워드를 반드시 포함: ${result.missingPositiveKeywords.slice(0, 5).join(', ')}`);
  }

  lines.push('- "이중생활", "비밀" 같은 중의적 표현은 *원본 문맥*에 따라 해석하라. 일반적 부정 의미로 환각하지 마라.');

  return lines.join('\n');
}
