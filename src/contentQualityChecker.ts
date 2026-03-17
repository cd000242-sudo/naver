/**
 * contentQualityChecker.ts — 콘텐츠 품질 검사 공통 모듈
 * 
 * 생성된 콘텐츠가 프롬프트의 핵심 규칙을 준수했는지 검사합니다.
 * validateHomefeedContent에서 분리된 critical 위반 감지 로직을 담당합니다.
 * 
 * ⚡ Critical 위반 = 절대 규칙 TOP 10 위반:
 *   1. 도입부-소제목1 동일 감정/톤/문형 반복
 *   2. AI 정리형 마무리 ("결론적으로", "살펴보았습니다" 등)
 *   3. 이모지 존재 (홈판 0개 규칙)
 * 
 * @since 2026-03-16
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 인터페이스
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 콘텐츠 품질 검사 결과
 */
export interface QualityCheckResult {
  /** critical 위반이 있는지 */
  hasCritical: boolean;
  /** 감지된 critical 위반 목록 */
  violations: string[];
}

/**
 * 검사에 필요한 콘텐츠 구조 (StructuredContent의 일부)
 * contentGenerator.ts의 StructuredContent 타입과 호환
 */
export interface CheckableContent {
  introduction?: string;
  conclusion?: string;
  headings?: Array<{
    title?: string;
    body?: string;
    content?: string;
  }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 도입부-소제목1 겹침 감지용 감정/공감 패턴 */
const INTRO_OVERLAP_PATTERNS = [
  '아니', '헐', '진짜', '들으셨', '아시나요', '그런 거 아니',
  '저만 그런', '고민 많이', '놀랐', '대박', '실화',
  '믿기 힘들', '어이없', '당황', '소름'
];

/** AI 정리형 마무리 금지 표현 */
const AI_CONCLUSION_PHRASES = [
  '결론적으로', '정리하면', '요약하면', '종합하면',
  '마무리하자면', '살펴보았습니다', '알아보았습니다',
  '에 대해 알아보았', '를 소개해드렸', '를 살펴보았'
];

/** 이모지 감지 정규식 (유니코드 이모지 범위) */
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핵심 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 홈피드 콘텐츠의 critical 위반을 검사합니다.
 * 
 * 검사 항목:
 *   1. 도입부-소제목1 동일 패턴 반복 (TOP 10 규칙 1번)
 *   2. AI 정리형 마무리 (TOP 10 규칙 9번)
 *   3. 이모지 존재 (TOP 10 규칙 4번)
 * 
 * @param content - 검사할 콘텐츠 구조
 * @returns QualityCheckResult
 */
export function checkHomefeedCriticalViolations(content: CheckableContent): QualityCheckResult {
  const violations: string[] = [];

  // ━━━ Critical 1: 도입부-소제목1 동일 감정 패턴 반복 ━━━
  const introText = (content.introduction || '').substring(0, 200);
  const firstHeadingBody = content.headings && content.headings.length > 0
    ? String(content.headings[0].body || content.headings[0].content || '').substring(0, 200)
    : '';

  if (introText && firstHeadingBody) {
    const introHits = INTRO_OVERLAP_PATTERNS.filter(p => introText.includes(p));
    const h1Hits = INTRO_OVERLAP_PATTERNS.filter(p => firstHeadingBody.includes(p));
    const overlap = introHits.filter(p => h1Hits.includes(p));

    if (overlap.length > 0) {
      violations.push(`도입부-소제목1 반복: ${overlap.join(', ')}`);
    }
  }

  // ━━━ Critical 2: AI 정리형 마무리 ━━━
  const lastHeadingText = content.headings && content.headings.length > 0
    ? String(content.headings[content.headings.length - 1].body || content.headings[content.headings.length - 1].content || '').slice(-200)
    : '';
  const conclusionFull = (content.conclusion || '') + ' ' + lastHeadingText;

  for (const phrase of AI_CONCLUSION_PHRASES) {
    if (conclusionFull.includes(phrase)) {
      violations.push(`AI 마무리: "${phrase}"`);
      break;
    }
  }

  // ━━━ Critical 3: 이모지 존재 (홈판 0개 규칙) ━━━
  const fullText = [
    content.introduction || '',
    ...(content.headings || []).map(h => `${h.title || ''} ${h.body || h.content || ''}`),
    content.conclusion || '',
  ].join(' ');

  const emojiMatches = fullText.match(EMOJI_REGEX);
  if (emojiMatches && emojiMatches.length > 0) {
    violations.push(`이모지 ${emojiMatches.length}개 발견`);
  }

  // ━━━ 결과 로깅 ━━━
  if (violations.length > 0) {
    console.warn(`[QualityChecker] ⛔ Critical 위반 ${violations.length}개: ${violations.join(' | ')}`);
  } else {
    console.log('[QualityChecker] ✅ Critical 위반 없음');
  }

  return {
    hasCritical: violations.length > 0,
    violations,
  };
}
