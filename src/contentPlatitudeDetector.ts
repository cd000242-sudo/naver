/**
 * contentPlatitudeDetector.ts — LLM 일반론 도망 감지 모듈
 *
 * Phase: SPEC-PROMPT-2026-REFRESH Phase 1 (v2.10.231).
 * Background: LLM이 RAG 자료를 받고도 "고양이는 생선을 좋아합니다" 같은
 *   자명한 보편 진술로 도망치는 패턴 차단.
 * Method: 한국어 일반론 트리거 어휘 정규식 + 인용 토큰 [자료N] 밀도 측정.
 * Source: Anthropic Cite-then-write, RAGAS Faithfulness, Vectara HHEM-2.1-Open
 *   휴리스틱 패턴.
 *
 * @since 2026-05-16
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 인터페이스
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlatitudeDetectionResult {
  /** 총 일반론 트리거 어휘 매치 수 */
  platitudeHitCount: number;
  /** 매치된 트리거 어휘 목록 (중복 제거) */
  matchedTriggers: string[];
  /** 단락당 평균 인용 토큰([자료N]) 수 */
  citationDensity: number;
  /** 전체 단락 수 */
  paragraphCount: number;
  /** 인용 토큰 총 수 */
  totalCitations: number;
  /** [v2] RAG 자료와 본문 n-gram overlap (0~1) — 자료 없으면 -1 */
  rougeLOverlap: number;
  /** [v2] 사실 진술 단락 중 인용 토큰이 적절히 배치된 비율 (0~1) */
  citationPlacementRatio: number;
  /** [v2] 사실 진술 단락(숫자/날짜/금액 포함) 총 개수 */
  factualParagraphCount: number;
  /** 임계 초과 여부 (일반론 ≥ 3회 또는 인용 밀도 < 0.3 또는 v2 추가 기준) */
  exceedsThreshold: boolean;
  /** 사유 (사용자/로그 표시용) */
  reason: string;
}

export interface DetectableContent {
  introduction?: string;
  conclusion?: string;
  headings?: Array<{
    title?: string;
    body?: string;
    content?: string;
  }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 일반론 트리거 어휘 (한국어) — v1 일반론 15개 + v3 회상체/빈마무리 10개
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM이 자료 없을 때 도망치는 보편 진술 패턴.
 * Source: 사용자 실제 보고("고양이는 생선을 좋아합니다" 같은 일반론)
 *   + Anthropic 일반론 패턴 가이드.
 * Note: 정상 사용 가능한 단어는 단독으로만 잡지 않고 문맥에서 매칭.
 */
const PLATITUDE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /보통(?:\s|은|이|을)/g, label: '보통' },
  { pattern: /일반적으로/g, label: '일반적으로' },
  { pattern: /흔히(?:\s|는)/g, label: '흔히' },
  { pattern: /대체로/g, label: '대체로' },
  { pattern: /많은\s*분들이/g, label: '많은 분들이' },
  { pattern: /여러\s*가지/g, label: '여러 가지' },
  { pattern: /다양한(?:\s|\s+\S+)/g, label: '다양한' },
  { pattern: /\S+한?\s*것\s*같아요/g, label: '~한 것 같아요' },
  { pattern: /^[\s\S]{0,30}필요합니다\./gm, label: '~필요합니다(단독)' },
  { pattern: /^[\s\S]{0,30}중요합니다\./gm, label: '중요합니다(단독)' },
  { pattern: /\S+하는\s*게\s*좋습니다/g, label: '~하는 게 좋습니다' },
  { pattern: /\S+할\s*수\s*있습니다/g, label: '~할 수 있습니다' },
  { pattern: /\S+인\s*경우가\s*많/g, label: '~인 경우가 많아요' },
  { pattern: /보편적으로/g, label: '보편적으로' },
  { pattern: /자명한\s*사실/g, label: '자명한 사실' },
  // [v3 — SPEC-REVIEW-001 확장] 가짜 회상체 남발 (체험을 가장하는 과거 회상 시제).
  //   근거 없는 1인칭 회상으로 경험을 위장하는 신호. 남발(>3 누적) 시 환각 의심.
  { pattern: /했었다/g, label: '~했었다' },
  { pattern: /하곤\s*했(?:었)?다/g, label: '~하곤 했다' },
  { pattern: /들려왔다/g, label: '들려왔다' },
  { pattern: /떠오른다/g, label: '떠오른다' },
  { pattern: /던\s*기억/g, label: '~던 기억' },
  // [v3 — SPEC-REVIEW-001 확장] 빈 마무리 상투구 (내용 없이 감성으로 닫는 클로저).
  { pattern: /진짜\s*매력/g, label: '진짜 매력' },
  { pattern: /새삼\s*깨닫/g, label: '새삼 깨닫게' },
  { pattern: /야말로/g, label: '~야말로' },
  { pattern: /임을\s*(?:새삼\s*)?(?:알게|깨닫게)\s*되/g, label: '~임을 알게 되는' },
  { pattern: /오직\s+\S+에만/g, label: '오직 ~에만' },
];

/**
 * 인용 토큰 정규식 — [자료], [자료1], [자료2] 등.
 * F2 룰: 사실 진술 단락 끝에 인용 1개 이상 권장.
 */
const CITATION_TOKEN_REGEX = /\[자료\d*\]/g;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 임계 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 일반론 트리거 어휘 허용 최대치. 초과 시 LLM 안전모드 도망 의심. */
const MAX_PLATITUDE_HITS = 3;

/** 인용 토큰 단락당 최소 밀도. 미달 시 RAG 자료 미활용 의심. */
const MIN_CITATION_DENSITY = 0.3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핵심 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** [v2] 사실 진술 패턴 — 숫자/날짜/금액/% 포함 단락이면 인용 필요 */
const FACTUAL_INDICATOR_REGEX = /\d+\s*(원|만원|억|%|개월|일|월|년|시간|회|배|kg|cm|m|평|가지|건)|\d{1,4}년|\d{1,2}월\s*\d{1,2}일|\d+\.\d+/;

/** [v2] 휴리스틱 임계 — RAG 자료와 본문의 단어 overlap 최소치 */
const MIN_ROUGE_L_OVERLAP = 0.15;

/** [v2] 사실 진술 단락 중 인용 토큰이 배치된 비율 최소치 */
const MIN_CITATION_PLACEMENT_RATIO = 0.5;

/**
 * 콘텐츠에서 일반론 도망 + 인용 부족 패턴을 감지한다.
 *
 * @param content - 검사 대상 (introduction/headings/conclusion)
 * @param options.ragSource - RAG로 주입된 자료 원문 (있으면 ROUGE-L overlap 검증 활성)
 * @returns PlatitudeDetectionResult — 임계 초과 시 재생성 트리거 가능
 */
export function detectPlatitudes(
  content: DetectableContent,
  options?: { ragSource?: string },
): PlatitudeDetectionResult {
  const fullText = collectFullText(content);
  const paragraphCount = countParagraphs(content);

  // 1. 일반론 트리거 매칭
  const matchedTriggers: string[] = [];
  let platitudeHitCount = 0;
  for (const { pattern, label } of PLATITUDE_PATTERNS) {
    const matches = fullText.match(pattern);
    if (matches && matches.length > 0) {
      platitudeHitCount += matches.length;
      if (!matchedTriggers.includes(label)) {
        matchedTriggers.push(label);
      }
    }
  }

  // 2. 인용 토큰 밀도 측정
  const citationMatches = fullText.match(CITATION_TOKEN_REGEX);
  const totalCitations = citationMatches ? citationMatches.length : 0;
  const citationDensity = paragraphCount > 0 ? totalCitations / paragraphCount : 0;

  // 3. [v2] ROUGE-L overlap — RAG 자료가 있을 때만 계산. 자료 없으면 -1.
  const ragSource = options?.ragSource && options.ragSource.trim().length >= 50
    ? options.ragSource
    : '';
  const rougeLOverlap = ragSource ? computeRougeLOverlap(fullText, ragSource) : -1;

  // 4. [v2] 사실 진술 단락 중 인용 토큰 배치 비율 측정
  const placementStats = computeCitationPlacement(content);

  // 5. 임계 판정 (v1 + v2 통합)
  const platitudeExceeds = platitudeHitCount > MAX_PLATITUDE_HITS;
  const citationLow = citationDensity < MIN_CITATION_DENSITY;
  const overlapLow = ragSource !== '' && rougeLOverlap < MIN_ROUGE_L_OVERLAP;
  const placementLow = placementStats.factualParagraphCount >= 3
    && placementStats.placementRatio < MIN_CITATION_PLACEMENT_RATIO;
  const exceedsThreshold = platitudeExceeds || citationLow || overlapLow || placementLow;

  const reasons: string[] = [];
  if (platitudeExceeds) {
    reasons.push(
      `일반론 ${platitudeHitCount}회 (한도 ${MAX_PLATITUDE_HITS}, 매치: ${matchedTriggers.slice(0, 5).join(', ')})`,
    );
  }
  if (citationLow) {
    reasons.push(
      `인용 밀도 ${citationDensity.toFixed(2)} < ${MIN_CITATION_DENSITY} (총 ${totalCitations}/${paragraphCount}단락)`,
    );
  }
  if (overlapLow) {
    reasons.push(
      `RAG overlap ${rougeLOverlap.toFixed(2)} < ${MIN_ROUGE_L_OVERLAP} (자료 활용도 부족, 환각 의심)`,
    );
  }
  if (placementLow) {
    reasons.push(
      `사실 단락 인용 배치 ${(placementStats.placementRatio * 100).toFixed(0)}% < ${MIN_CITATION_PLACEMENT_RATIO * 100}% (${placementStats.factualParagraphCount}개 사실 단락 중 인용 부재)`,
    );
  }
  const reason = reasons.length > 0 ? reasons.join(' | ') : '정상';

  return {
    platitudeHitCount,
    matchedTriggers,
    citationDensity,
    paragraphCount,
    totalCitations,
    rougeLOverlap,
    citationPlacementRatio: placementStats.placementRatio,
    factualParagraphCount: placementStats.factualParagraphCount,
    exceedsThreshold,
    reason,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [v2] ROUGE-L overlap (n-gram 휴리스틱)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 본문이 RAG 자료를 얼마나 활용했는지 측정 (0~1).
 * 정밀한 ROUGE-L 아님 — 한국어 토큰 unigram + bigram overlap 휴리스틱.
 * 낮을수록 본문이 자료를 무시하고 자체 지식으로 작성한 신호.
 */
function computeRougeLOverlap(content: string, ragSource: string): number {
  const tokenize = (s: string): string[] =>
    s.replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);

  const contentTokens = tokenize(content);
  const ragTokens = tokenize(ragSource);
  if (contentTokens.length === 0 || ragTokens.length === 0) return 0;

  const ragSet = new Set(ragTokens);
  const matched = contentTokens.filter((t) => ragSet.has(t)).length;
  return matched / contentTokens.length;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [v2] 인용 토큰 위치 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 사실 진술 단락(숫자/날짜/금액/% 포함)에 인용 토큰이 적절히 배치됐는지 측정.
 * 사실 단락 5개 중 인용 0개 = LLM이 자료 무시하고 자기 지식으로 사실 진술한 의심.
 */
function computeCitationPlacement(content: DetectableContent): {
  factualParagraphCount: number;
  citedFactualCount: number;
  placementRatio: number;
} {
  const fullText = collectFullText(content);
  const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length >= 20);

  let factualParagraphCount = 0;
  let citedFactualCount = 0;
  for (const p of paragraphs) {
    if (FACTUAL_INDICATOR_REGEX.test(p)) {
      factualParagraphCount++;
      if (CITATION_TOKEN_REGEX.test(p)) {
        citedFactualCount++;
      }
      CITATION_TOKEN_REGEX.lastIndex = 0; // 정규식 재사용 안전
    }
  }

  const placementRatio = factualParagraphCount > 0
    ? citedFactualCount / factualParagraphCount
    : 1; // 사실 단락 자체가 없으면 OK
  return { factualParagraphCount, citedFactualCount, placementRatio };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 보조 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function collectFullText(content: DetectableContent): string {
  const parts: string[] = [];
  if (content.introduction) parts.push(content.introduction);
  if (Array.isArray(content.headings)) {
    for (const h of content.headings) {
      if (h.body) parts.push(h.body);
      else if (h.content) parts.push(h.content);
    }
  }
  if (content.conclusion) parts.push(content.conclusion);
  return parts.join('\n');
}

function countParagraphs(content: DetectableContent): number {
  const fullText = collectFullText(content);
  return fullText.split(/\n\s*\n/).filter((p) => p.trim().length >= 20).length;
}
