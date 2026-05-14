/**
 * Source Fidelity Engine — Phase 7 (사용자 식별 미흡 #2: URL 입력 시 LLM 압축·정보 누락)
 *
 * 사용자 진단:
 *   "기존 블로그 내용이 좋아서 url 넣어서 발행하면 내용들이 많이 압축되고
 *    중요한 내용도 빠지는 거 같다"
 *
 * 코드 실측 결과:
 *   - rawText는 통째로 LLM에 전달됨 (잘림 없음)
 *   - 프롬프트는 "요약/축약 금지" 명시
 *   - 그러나 LLM이 그 지시를 따르는지 검증하는 코드 0건
 *
 * 본 모듈의 역할:
 *   1. 결과 본문 길이 / 원본 길이 비율 (compression ratio) 계산
 *   2. 핵심 fact (숫자, 고유명사 후보, 인용문) 추출 후 결과물 보존율 계산
 *   3. 임계 미만이면 LLM 재시도용 "누락 fact 명시" 추가 지시 생성
 *
 * 설계 원칙 (메모리 정렬):
 *   - 추정 효과 금지: 검증된 임계만 사용 (compression 0.5, retention 0.7)
 *   - silent 폴백 금지: 결과를 호출자에게 명시 반환, 호출자가 재시도/모달/통과 결정
 *   - 차단 모달과 호환: 임계 미만 + 재시도 한도 초과 시 호출자가 모달 띄울 수 있게
 */

export interface FidelityCheckResult {
  readonly passed: boolean;
  readonly compressionRatio: number;
  readonly retentionScore: number;
  readonly missingFacts: readonly string[];
  readonly totalFacts: number;
  readonly retainedFacts: number;
  readonly reason?: string;
}

export interface FidelityCheckInput {
  readonly rawText: string;
  readonly resultBody: string;
  readonly minCompressionRatio?: number;
  readonly minRetentionScore?: number;
  readonly maxFactsToCheck?: number;
}

const DEFAULT_MIN_COMPRESSION_RATIO = 0.5;
const DEFAULT_MIN_RETENTION_SCORE = 0.7;
const DEFAULT_MAX_FACTS = 30;
const MIN_RAW_TEXT_FOR_CHECK = 500;

/**
 * 원본에서 보존돼야 할 핵심 fact 후보 추출.
 * - 숫자(단위 포함): "300자", "12.5%", "1만원"
 * - 인용문: "..." 또는 「...」
 * - 영문 고유명사 후보: 대문자 시작 + 2자 이상
 * - 한글 고유명사 후보: 흔한 명사 외 2~5자 (간이 휴리스틱)
 */
export function extractCoreFacts(text: string, max: number = DEFAULT_MAX_FACTS): string[] {
  if (!text) return [];
  const facts = new Set<string>();

  // 1. 숫자 + 단위 (가장 강한 신호)
  const numberPattern = /\d+(?:[.,]\d+)?[가-힣A-Za-z%원만천백억배회개분초시일월년]+/g;
  for (const m of text.match(numberPattern) ?? []) {
    if (m.length >= 2 && m.length <= 12) facts.add(m);
    if (facts.size >= max) break;
  }

  // 2. 큰따옴표 인용문
  if (facts.size < max) {
    const quotePattern = /"([^"\n]{4,40})"|「([^」\n]{4,40})」|"([^"\n]{4,40})"/g;
    let qm: RegExpExecArray | null;
    while ((qm = quotePattern.exec(text)) !== null && facts.size < max) {
      const quote = (qm[1] ?? qm[2] ?? qm[3] ?? '').trim();
      if (quote) facts.add(quote);
    }
  }

  // 3. 영문 고유명사 후보 (브랜드, 제품명 등)
  if (facts.size < max) {
    const englishProperPattern = /\b[A-Z][a-zA-Z0-9]{1,15}(?:\s+[A-Z][a-zA-Z0-9]{1,15})?\b/g;
    for (const m of text.match(englishProperPattern) ?? []) {
      if (m.length >= 2) facts.add(m);
      if (facts.size >= max) break;
    }
  }

  // 4. 한글 4자 이상 명사구 (간이) — 자주 등장하는 키워드
  if (facts.size < max) {
    const wordCount = new Map<string, number>();
    const koreanPattern = /[가-힣]{4,12}/g;
    for (const m of text.match(koreanPattern) ?? []) {
      wordCount.set(m, (wordCount.get(m) ?? 0) + 1);
    }
    const sorted = [...wordCount.entries()].sort((a, b) => b[1] - a[1]);
    for (const [word, count] of sorted) {
      if (count >= 2) facts.add(word);
      if (facts.size >= max) break;
    }
  }

  return [...facts].slice(0, max);
}

/**
 * 결과 본문에 fact가 보존됐는지 검사.
 * 정확 매칭(공백 무시) + 부분 매칭(80% 이상 substring) 둘 다 시도.
 */
function isFactPreserved(fact: string, resultBody: string): boolean {
  if (!fact) return true;
  const haystack = resultBody.replace(/\s+/g, '');
  const needle = fact.replace(/\s+/g, '');
  if (haystack.includes(needle)) return true;
  // 부분 매칭: 80% 이상 substring 보존 (Levenshtein 대신 단순 휴리스틱)
  if (needle.length >= 5) {
    const partial = needle.slice(0, Math.floor(needle.length * 0.8));
    if (haystack.includes(partial)) return true;
  }
  return false;
}

export function checkSourceFidelity(input: FidelityCheckInput): FidelityCheckResult {
  const rawText = (input.rawText ?? '').trim();
  const resultBody = (input.resultBody ?? '').trim();
  const minCompression = input.minCompressionRatio ?? DEFAULT_MIN_COMPRESSION_RATIO;
  const minRetention = input.minRetentionScore ?? DEFAULT_MIN_RETENTION_SCORE;

  // 원본이 너무 짧으면 검증 스킵 (키워드 모드 등) — 항상 통과
  if (rawText.length < MIN_RAW_TEXT_FOR_CHECK) {
    return {
      passed: true,
      compressionRatio: 1,
      retentionScore: 1,
      missingFacts: [],
      totalFacts: 0,
      retainedFacts: 0,
      reason: 'rawText < 500자 — 검증 스킵',
    };
  }

  const compressionRatio = resultBody.length / rawText.length;

  const facts = extractCoreFacts(rawText, input.maxFactsToCheck ?? DEFAULT_MAX_FACTS);
  const totalFacts = facts.length;
  let retainedFacts = 0;
  const missingFacts: string[] = [];
  for (const fact of facts) {
    if (isFactPreserved(fact, resultBody)) {
      retainedFacts++;
    } else {
      missingFacts.push(fact);
    }
  }

  const retentionScore = totalFacts > 0 ? retainedFacts / totalFacts : 1;

  const compressionPassed = compressionRatio >= minCompression;
  const retentionPassed = retentionScore >= minRetention;

  let reason: string | undefined;
  if (!compressionPassed) {
    reason = `압축률 ${(compressionRatio * 100).toFixed(0)}% (임계 ${(minCompression * 100).toFixed(0)}%)`;
  } else if (!retentionPassed) {
    reason = `핵심 정보 보존율 ${(retentionScore * 100).toFixed(0)}% (임계 ${(minRetention * 100).toFixed(0)}%) — 누락 ${missingFacts.length}건`;
  }

  return {
    passed: compressionPassed && retentionPassed,
    compressionRatio,
    retentionScore,
    missingFacts: missingFacts.slice(0, 15),
    totalFacts,
    retainedFacts,
    reason,
  };
}

/**
 * 검증 실패 시 LLM 재시도용 추가 지시문 생성.
 * 호출자가 generateStructuredContent의 extraInstruction에 합쳐 사용.
 */
export function buildFidelityRetryInstruction(result: FidelityCheckResult, options?: { minCompressionRatio?: number; minRetentionScore?: number }): string {
  if (result.passed) return '';

  // ✅ [v2.10.173] 호출자가 strict 임계 전달 시 그 값을 메시지에 반영 (URL 모드 0.85/0.92)
  const minCompression = options?.minCompressionRatio ?? DEFAULT_MIN_COMPRESSION_RATIO;
  const minRetention = options?.minRetentionScore ?? DEFAULT_MIN_RETENTION_SCORE;

  const lines: string[] = [
    '',
    '⚠️ [원본 정보 보존 검증 실패 — 다시 작성하라]',
  ];

  if (result.compressionRatio < minCompression) {
    lines.push(`- 결과 본문이 원본의 ${(result.compressionRatio * 100).toFixed(0)}%로 너무 압축됐다. 최소 ${(minCompression * 100).toFixed(0)}% 이상으로 작성하라.`);
    lines.push('- 요약/축약 절대 금지. 원본의 모든 사실·예시·디테일을 보존하라.');
  }

  if (result.retentionScore < minRetention) {
    lines.push(`- 핵심 정보 보존율 ${(result.retentionScore * 100).toFixed(0)}% — 임계 ${(minRetention * 100).toFixed(0)}% 미달. 누락된 fact를 모두 포함해 다시 작성하라.`);
  }

  if (result.missingFacts.length > 0) {
    lines.push(`- 다음 핵심 정보가 누락됐다 (반드시 결과물에 포함):`);
    for (const fact of result.missingFacts) {
      lines.push(`  • "${fact}"`);
    }
  }

  return lines.join('\n');
}

/**
 * 결과 콘텐츠에서 검증할 본문 텍스트 추출.
 * StructuredContent 형태(headings 배열) → 한 문자열로 합침.
 */
export function extractResultBody(content: { headings?: { content?: string }[]; introduction?: string; conclusion?: string }): string {
  const parts: string[] = [];
  if (content.introduction) parts.push(content.introduction);
  for (const h of content.headings ?? []) {
    if (h.content) parts.push(h.content);
  }
  if (content.conclusion) parts.push(content.conclusion);
  return parts.join('\n\n');
}
