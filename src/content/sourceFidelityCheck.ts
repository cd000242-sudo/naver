import { extractKoreanFactTokens } from './koreanFactTokens.js';
import { UNIT_PATTERN } from './numericGroundingCheck.js';
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
/** 숫자 fact 뒤에 딸려온 조사를 뗀다. "25만원으로" → "25만원". */
const NUMBER_TAIL_PARTICLES = [
  '으로부터', '까지는', '에서는', '으로', '까지', '부터', '에서', '이며', '이고',
  '보다', '만큼', '이상', '이하', '동안', '라고', '로', '은', '는', '이', '가', '을', '를', '도', '와', '과', '에',
];

function trimTrailingParticleFromNumber(value: string): string {
  for (const particle of NUMBER_TAIL_PARTICLES) {
    if (value.length > particle.length + 1 && value.endsWith(particle)) {
      return value.slice(0, -particle.length);
    }
  }
  return value;
}

export function extractCoreFacts(text: string, max: number = DEFAULT_MAX_FACTS): string[] {
  if (!text) return [];
  const facts = new Set<string>();

  // 1. 숫자 + 단위 (가장 강한 신호)
  /*
   * [2026-09-02] 열린 문자 클래스가 쓰레기를 사실로 승격시켰다.
   *
   * 실측: 냉장고 글 본문에 이 문장이 실렸다 —
   *   "4e4fee07-…라는 식별 문자열과 함께 99번째, 100번째, 3대, 3일, 1개월,
   *    75%만, 4단계 … 라는 표기가 섞여 있습니다"
   * UUID 를 이 정규식이 4e · 4fee · 98d · 2f 로 잘라 사실 목록에 올렸고,
   * sourceFactChecklist 가 "이 목록을 다 다뤄야 끝난 글" 계약을 씌운다.
   * "4e" 를 문장에 녹일 방법이 없으니 모델이 택한 유일한 준수 방법이
   * 그것을 독자에게 설명하는 것이었다. 침구 글의 "5G와 6G처럼 …" 도 같은 자리다.
   *
   * 더 나쁜 것은 자리 독식이다 — 상한 30칸 중 22칸이 쓰레기로 차면
   * 진짜 고유명사·인용문은 8칸만 받는다.
   *
   * [가-힣A-Za-z…]+ 는 숫자 뒤 아무 글자나 받는다. 닫힌 단위 목록으로 바꾼다.
   * 목록은 numericGroundingCheck 가 이미 갖고 있다 — 두 벌로 만들지 않는다.
   */
  /*
   * 한글 단위는 열어 두고 라틴 문자만 닫는다.
   *
   * 처음에는 단위를 전부 나열했다가 되돌렸다. 사장님 지적 —
   * "내가 준 글을 분석한 기반은 되어야 되지만 그게 하드코딩이 되면 안 된다".
   * 맞다. 나열한 목록에는 내가 떠올린 단위만 들어간다.
   * 요리 글의 "2큰술", 생선 가게의 "3짜", 한약의 "5첩" 은 빠진다 —
   * 실측 글 네 편에 없었다는 이유로 없는 단위가 되어 버린다.
   *
   * 쓰레기와 진짜를 가른 것은 단위의 종류가 아니라 문자 종류였다:
   *   4e · 98d   숫자 + 라틴 한 글자   ← UUID 조각
   *   5G · 6G    숫자 + 라틴 한 글자   ← 통신 규격 표기
   *   3대 · 2큰술 숫자 + 한글          ← 진짜 단위
   * 그래서 한글 접미는 길이로만 제한하고(1~3자), 라틴은 알려진 단위만 받는다.
   * 새 한글 단위가 나와도 코드를 고칠 필요가 없다.
   *
   * 라틴 대문자는 두 글자 이상만 받는다("10CM" 은 살리고 "5G" 는 버린다).
   * 정규식 전체에 i 를 걸면 'g'(그램) 때문에 "5G" 가 사실이 된다 —
   * 침구 글의 "5G와 6G처럼 …" 문장을 만든 것이 정확히 그 경로다.
   */
  const LATIN_UPPER_UNITS = 'CM|KM|MM|KG|ML|KCAL';
  const numberPattern = new RegExp(
    // 교체 순서가 결과를 정한다. 알려진 단위가 먼저여야 "25만원짜리" 에서
    // '만원' 이 잡힌다 — 일반 한글 규칙이 앞서면 '만원짜' 를 먹는다.
    '\\d+(?:[.,]\\d+)?(?:' + UNIT_PATTERN + '|' + LATIN_UPPER_UNITS + '|[가-힣]{1,3})',
    'g',
  );
  for (const m of text.match(numberPattern) ?? []) {
    // [2026-08-26] 숫자 뒤에 조사가 딸려 온다("2.8%로", "25만원으로", "3.3%까지").
    //   목록에 조사째로 올리면 모델이 어색하게 따라 쓰고, 결과물 대조도 어긋난다.
    const trimmed = trimTrailingParticleFromNumber(m);
    if (trimmed.length >= 2 && trimmed.length <= 12) facts.add(trimmed);
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

  // 4. 한글 고유명사 — [2026-08-26] 어절 통짜 매칭을 버리고 조사를 떼고 센다.
  //   예전 규칙([가-힣]{4,12} 2회 이상)은 한국 인명 대부분(세 글자)을 통째로 놓치고,
  //   네 글자 이상은 조사가 붙은 형태로 잡았다.
  //   실측: "옥상달빛 김윤주 / 십센치 권정열 / 박세진" 원문에서 잡힌 것은 "김윤주는" 하나뿐.
  //   지금은 김윤주·옥상달빛·십센치·권정열·박세진 을 모두 잡는다.
  //   과거 3자 확장 시도(v2.10.176)가 "가능합/이라고" 같은 조각을 물고 되돌려졌는데,
  //   그건 조사를 떼지 않고 길이만 내렸기 때문이다. 여기서는 조사를 떼고 일반어를 막는다.
  if (facts.size < max) {
    for (const token of extractKoreanFactTokens(text, max - facts.size)) {
      facts.add(token);
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
