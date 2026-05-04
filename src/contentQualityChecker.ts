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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v2.10.1 6대 의무 패치 충실도 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * v2.10.1 패치 충실도 결과
 *   - 사용자 비평: '실제 결과가 저렇게 나오는지가 중요'
 *   - 측정: 생성된 글이 P-A~P-F 의무를 충족하는지 정적 검사
 *   - 추정 없음: 충족/미충족만 보고
 */
export interface PromptComplianceResult {
  total: number;        // 검사 항목 수
  passed: number;       // 충족 항목 수
  passRate: number;     // 충족률 (0~1)
  byHeading: Array<{
    heading: string;
    pA: boolean;        // 의심+반박 패턴
    pB: boolean;        // '절대 모를 한 가지' 디테일
    pC: boolean;        // 단락 갈고리(Hook)
  }>;
  pD_failOrLimit: boolean;     // 글 전체 실패담/한계 1회 이상
  pF_introHasNumber: boolean;  // 도입부 첫 문장 숫자/날짜/금액
  bodyLength: number;          // 본문 길이
  bodyLengthOk: boolean;       // 1500~1800자 범위
  endingDup3plus: number;      // 어미 3연속 위반 건수 (0이어야 합격)
}

const PA_PATTERNS = [
  /근데\s*(이거|이게|정말|진짜)\s*[^.]*[?\?]/,
  /의심[이가]\s*드[는]/,
  /이게\s*맞[을는]\s*[가까]/,
  /과연[^.]*[?\?]/,
];
const PB_PATTERNS = [
  /공식\s*(안내|사이트)\s*에는?\s*(안\s*나오|없|빠진)/,
  /검색\s*해[도서][^.]*안\s*나오/,
  /실무에서[는만]?\s*(자주|걸리|놓치)/,
  /잘\s*안\s*알려진|모르는\s*사람\s*많/,
  /의외로[^.]*디테일|디테일이\s*하나/,
];
const PC_PATTERNS = [
  /다음[에서]*\s*[^.]*인데/,
  /진짜\s*중요한\s*건/,
  /절반은\s*끝/,
  /더\s*까다로운/,
  /지금부터가\s*핵심|이제부터/,
  /다음\s*항목/,
];
const PD_PATTERNS = [
  /다만\s*[^.]*[은는]?\s*아[니녀]/,
  /아쉬운\s*[건점]/,
  /한계[가는]/,
  /단점[은이]/,
  /모든\s*케이스에\s*맞/,
  /완벽하지는?\s*않/,
  /이\s*부분[은이]\s*좀\s*[^.]/,
];

const NUMBER_OR_DATE = /\d+\s*(원|만원|억|%|개월|일|월|년|시간|회|배|kg|cm|m|평|가지)|\d{1,4}년|\d{1,2}월\s*\d{1,2}일|\d+\.\d+/;

const ENDINGS = ['거든요', '더라고요', '잖아요', '인가\s*봐요', '듯해요', '이래요', '한다는데요', '해요', '네요', '예요', '입니다', '습니다', '인데요', '죠'];
const ENDING_REGEX = new RegExp(`(${ENDINGS.join('|')})\.`, 'g');

export function checkPromptCompliance(content: CheckableContent): PromptComplianceResult {
  const headings = content.headings || [];
  const byHeading = headings.map((h) => {
    const title = String(h.title || '').slice(0, 40);
    const body = String(h.body || h.content || '');
    return {
      heading: title,
      pA: PA_PATTERNS.some(re => re.test(body)),
      pB: PB_PATTERNS.some(re => re.test(body)),
      pC: PC_PATTERNS.some(re => re.test(body.slice(-200))), // 마지막 200자
    };
  });

  const fullBody = [
    content.introduction || '',
    ...headings.map(h => h.body || h.content || ''),
    content.conclusion || '',
  ].join('\n');

  const pD = PD_PATTERNS.some(re => re.test(fullBody));

  const introFirstSentence = String(content.introduction || '').split(/[.\n]/)[0] || '';
  const pF = NUMBER_OR_DATE.test(introFirstSentence);

  const bodyLength = fullBody.replace(/\s+/g, '').length;
  const bodyLengthOk = bodyLength >= 1400 && bodyLength <= 1900;

  // 어미 3연속 검출
  let endingDup3 = 0;
  for (const h of headings) {
    const text = String(h.body || h.content || '');
    const matches = [...text.matchAll(ENDING_REGEX)].map(m => m[1]);
    for (let i = 0; i + 2 < matches.length; i++) {
      if (matches[i] === matches[i + 1] && matches[i + 1] === matches[i + 2]) endingDup3++;
    }
  }

  const checks = [
    ...byHeading.flatMap(h => [h.pA, h.pB, h.pC]),
    pD,
    pF,
    bodyLengthOk,
    endingDup3 === 0,
  ];
  const passed = checks.filter(Boolean).length;
  const total = checks.length;

  return {
    total,
    passed,
    passRate: total > 0 ? passed / total : 0,
    byHeading,
    pD_failOrLimit: pD,
    pF_introHasNumber: pF,
    bodyLength,
    bodyLengthOk,
    endingDup3plus: endingDup3,
  };
}

/**
 * 사람이 읽기 쉬운 형식으로 결과 포맷팅
 */
export function formatComplianceReport(result: PromptComplianceResult): string {
  const lines: string[] = [];
  lines.push(`[Compliance v2.10.1] ${result.passed}/${result.total} 통과 (${Math.round(result.passRate * 100)}%)`);
  lines.push(`  본문 길이: ${result.bodyLength}자 ${result.bodyLengthOk ? '✅' : '❌ (1500~1800자 권장)'}`);
  lines.push(`  P-D 실패담/한계: ${result.pD_failOrLimit ? '✅' : '❌'}`);
  lines.push(`  P-F 도입부 숫자: ${result.pF_introHasNumber ? '✅' : '❌'}`);
  lines.push(`  어미 3연속 위반: ${result.endingDup3plus}건 ${result.endingDup3plus === 0 ? '✅' : '❌'}`);
  result.byHeading.forEach((h, i) => {
    lines.push(`  H${i + 1} "${h.heading}": A=${h.pA ? '✅' : '❌'} B=${h.pB ? '✅' : '❌'} C=${h.pC ? '✅' : '❌'}`);
  });
  return lines.join('\n');
}
