/**
 * AuthGR 방어 모듈
 *
 * 네이버의 AuthGR(Authority-aware Generative Retriever) 알고리즘에 대응:
 * 1. 전문성 신호 주입 (Experience/Expertise indicators)
 * 2. 출처 신뢰성 강화 (Authority/Trust signals)
 * 3. AI 지문 분석 (Perplexity/Burstiness 측정)
 * 4. 임계값 기반 자동 재작성 트리거
 */

// ── 전문성 신호 사전 (카테고리별) ──

interface ExpertiseSignal {
  readonly pattern: string;
  readonly weight: number; // 0-1
}

const CATEGORY_EXPERTISE_SIGNALS: Readonly<Record<string, readonly ExpertiseSignal[]>> = {
  tech: [
    { pattern: '직접 테스트해본 결과', weight: 0.9 },
    { pattern: '실제 사용해보니', weight: 0.85 },
    { pattern: '개발 환경에서 확인한 바로는', weight: 0.8 },
    { pattern: '벤치마크 결과를 보면', weight: 0.75 },
    { pattern: '업데이트 이후 체감 성능이', weight: 0.7 },
  ],
  health: [
    { pattern: '꾸준히 실천해본 경험으로는', weight: 0.9 },
    { pattern: '실제로 시도해본 결과', weight: 0.85 },
    { pattern: '전문의 상담 후 알게 된 사실은', weight: 0.8 },
    { pattern: '건강검진 결과를 비교해보니', weight: 0.75 },
    { pattern: '약 복용 후 체감한 변화는', weight: 0.7 },
  ],
  food: [
    { pattern: '직접 만들어본 후기로는', weight: 0.9 },
    { pattern: '여러 번 해먹어보니', weight: 0.85 },
    { pattern: '실제 방문해서 먹어본 솔직한 맛은', weight: 0.8 },
    { pattern: '재료비를 따져보면', weight: 0.75 },
    { pattern: '조리 시간을 재보니', weight: 0.7 },
  ],
  travel: [
    { pattern: '직접 다녀온 후기입니다', weight: 0.9 },
    { pattern: '현지에서 확인한 바로는', weight: 0.85 },
    { pattern: '실제 숙박 후 느낀 점은', weight: 0.8 },
    { pattern: '교통편을 직접 이용해보니', weight: 0.75 },
    { pattern: '현지 물가를 체감해보면', weight: 0.7 },
  ],
  lifestyle: [
    { pattern: '실제로 써본 지 한 달째인데', weight: 0.9 },
    { pattern: '장기간 사용해본 솔직한 후기', weight: 0.85 },
    { pattern: '구매 후 실사용 비교를 해보니', weight: 0.8 },
    { pattern: '일상에서 활용해본 결과', weight: 0.75 },
    { pattern: '비용 대비 만족도를 따지면', weight: 0.7 },
  ],
  general: [
    { pattern: '직접 확인해본 결과', weight: 0.9 },
    { pattern: '실제로 경험해보니', weight: 0.85 },
    { pattern: '꼼꼼하게 조사해본 바로는', weight: 0.8 },
    { pattern: '여러 자료를 비교해보면', weight: 0.75 },
    { pattern: '실생활에 적용해보니', weight: 0.7 },
  ],
};

// ── 출처 인용 패턴 다양화 사전 ──

const SOURCE_CITATION_PATTERNS: readonly string[] = [
  '{source}에 따르면',
  '{source}에서 발표한 자료를 보면',
  '{source}의 조사 결과',
  '{source} 측 설명에 의하면',
  '{source}이(가) 밝힌 바에 따르면',
  '{source} 공식 발표를 참고하면',
  '{source}에서 확인할 수 있는 내용으로는',
  '{source}의 최근 데이터를 살펴보면',
];

// ── 경험 기반 표현 데이터베이스 ──

const EXPERIENCE_EXPRESSIONS: readonly string[] = [
  '제 경우에는',
  '개인적으로 느낀 점은',
  '실제로 해보니까',
  '직접 비교해본 결과',
  '사용한 지 {period}째인데',
  '처음에는 반신반의했지만',
  '주변에서도 비슷한 경험을 하더라고요',
  '솔직히 말하면',
  '기대 이상이었던 부분은',
  '아쉬웠던 점을 꼽자면',
  '다시 구매할 의향이 있냐고 물으면',
  '추천하냐는 질문에는',
];

// ── Perplexity / Burstiness 측정 ──

interface AiFingerprint {
  readonly perplexity: number;      // 0-100 (낮을수록 예측 가능 = AI 의심)
  readonly burstiness: number;      // 0-100 (낮을수록 균일 = AI 의심)
  readonly overallRisk: number;     // 0-100 (높을수록 AI로 탐지될 확률)
  readonly needsRewrite: boolean;   // overallRisk >= 65이면 true
  readonly details: readonly string[];
}

/**
 * 텍스트의 AI 지문(Perplexity/Burstiness)을 분석한다.
 *
 * - Perplexity 근사: 어휘 다양성 + n-gram 반복도
 * - Burstiness 근사: 문장 길이 변동 계수
 */
export function measureAiFingerprint(text: string): AiFingerprint {
  const details: string[] = [];

  // --- Perplexity 근사 (어휘 다양성 기반) ---
  const words = text.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const uniqueWords = new Set(words);
  const typeTokenRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  // TTR이 낮으면 같은 단어 반복 = 예측 가능 = AI 의심
  // 일반적 한국어 블로그: TTR 0.35~0.55
  let perplexity: number;
  if (typeTokenRatio >= 0.5) {
    perplexity = 80 + (typeTokenRatio - 0.5) * 40; // 높은 다양성
  } else if (typeTokenRatio >= 0.35) {
    perplexity = 50 + (typeTokenRatio - 0.35) * 200; // 보통
  } else {
    perplexity = typeTokenRatio * 142; // 낮은 다양성 = AI 의심
    details.push(`어휘 다양성 낮음 (TTR: ${typeTokenRatio.toFixed(3)})`);
  }

  // 2-gram 반복도 체크
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  const uniqueBigrams = new Set(bigrams);
  const bigramRepeatRatio = bigrams.length > 0 ? 1 - (uniqueBigrams.size / bigrams.length) : 0;

  if (bigramRepeatRatio > 0.3) {
    perplexity -= bigramRepeatRatio * 30;
    details.push(`2-gram 반복률 높음 (${(bigramRepeatRatio * 100).toFixed(1)}%)`);
  }

  // --- Burstiness 근사 (문장 길이 변동 계수) ---
  const sentences = text.split(/[.!?。]\s*/).filter(s => s.trim().length > 5);
  let burstiness: number;

  if (sentences.length < 3) {
    burstiness = 50; // 문장이 너무 적으면 판단 불가
  } else {
    const lengths = sentences.map(s => s.length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

    // CV(변동계수): 사람 글 0.4~0.8, AI 글 0.15~0.3
    if (cv >= 0.4) {
      burstiness = 70 + Math.min(30, (cv - 0.4) * 75); // 사람다운 변동
    } else if (cv >= 0.25) {
      burstiness = 40 + (cv - 0.25) * 200; // 보통
    } else {
      burstiness = cv * 160; // 너무 균일 = AI 의심
      details.push(`문장 길이 너무 균일 (CV: ${cv.toFixed(3)})`);
    }
  }

  // --- 종합 위험도 ---
  perplexity = Math.max(0, Math.min(100, perplexity));
  burstiness = Math.max(0, Math.min(100, burstiness));

  // perplexity와 burstiness가 낮을수록 AI 의심 → overallRisk 높음
  const overallRisk = Math.max(0, Math.min(100,
    100 - (perplexity * 0.5 + burstiness * 0.5)
  ));

  if (overallRisk >= 65) {
    details.push('⚠️ AI 탐지 위험 높음 — 재작성 권장');
  }

  return {
    perplexity: Math.round(perplexity),
    burstiness: Math.round(burstiness),
    overallRisk: Math.round(overallRisk),
    needsRewrite: overallRisk >= 65,
    details,
  };
}

// ── 전문성 신호 주입 ──

interface ExpertiseInjectionResult {
  readonly content: string;
  readonly injectedCount: number;
  readonly signals: readonly string[];
}

/**
 * 콘텐츠에 전문성 신호를 자연스럽게 주입한다.
 *
 * @param content 원본 콘텐츠
 * @param category 카테고리 (tech, health, food, travel, lifestyle, general)
 * @param maxInjections 최대 주입 횟수 (기본 3)
 */
export function injectExpertiseSignals(
  content: string,
  category: string = 'general',
  maxInjections: number = 3,
): ExpertiseInjectionResult {
  const signals = CATEGORY_EXPERTISE_SIGNALS[category] ?? CATEGORY_EXPERTISE_SIGNALS.general;
  const paragraphs = content.split('\n\n');

  if (paragraphs.length < 2) {
    return { content, injectedCount: 0, signals: [] };
  }

  let injectedCount = 0;
  const injectedSignals: string[] = [];

  // 이미 전문성 신호가 있는지 체크
  const existingSignalCount = signals.filter(s =>
    content.includes(s.pattern)
  ).length;

  if (existingSignalCount >= maxInjections) {
    return { content, injectedCount: 0, signals: [] };
  }

  const targetCount = Math.min(maxInjections - existingSignalCount, Math.floor(paragraphs.length * 0.3));

  // 균등 분포로 주입 위치 선택 (도입부 제외, 결론부 제외)
  const candidateIndices = paragraphs
    .map((_, i) => i)
    .filter(i => i > 0 && i < paragraphs.length - 1)
    .filter(i => paragraphs[i].length > 30); // 충분히 긴 문단만

  // 가용 신호 셔플
  const availableSignals = signals
    .filter(s => !content.includes(s.pattern))
    .sort(() => Math.random() - 0.5);

  for (let j = 0; j < targetCount && j < candidateIndices.length && j < availableSignals.length; j++) {
    const paraIdx = candidateIndices[j];
    const signal = availableSignals[j];
    const paragraph = paragraphs[paraIdx];

    // 문단의 첫 번째 문장 앞에 전문성 신호 추가
    const firstSentenceEnd = paragraph.search(/[.!?]\s/) + 1;
    if (firstSentenceEnd > 0) {
      const updatedParagraph = `${signal.pattern}, ${paragraph.slice(0, 1).toLowerCase()}${paragraph.slice(1)}`;
      paragraphs[paraIdx] = updatedParagraph;
    } else {
      paragraphs[paraIdx] = `${signal.pattern} ${paragraph}`;
    }

    injectedCount++;
    injectedSignals.push(signal.pattern);
  }

  return {
    content: paragraphs.join('\n\n'),
    injectedCount,
    signals: injectedSignals,
  };
}

// ── 출처 인용 다양화 ──

interface CitationDiversifyResult {
  readonly content: string;
  readonly diversifiedCount: number;
}

/**
 * 반복되는 출처 인용 패턴을 다양화한다.
 * "~에 따르면"이 3회 이상 반복되면 네이버가 패널티를 부과.
 */
export function diversifyCitations(content: string): CitationDiversifyResult {
  // "~에 따르면" 패턴 감지
  const citationPattern = /([가-힣A-Za-z0-9\s]+)에\s*따르면/g;
  const matches = [...content.matchAll(citationPattern)];

  if (matches.length < 3) {
    return { content, diversifiedCount: 0 };
  }

  let result = content;
  let diversifiedCount = 0;

  // 3번째부터 다양화 (처음 2개는 유지)
  for (let i = 2; i < matches.length; i++) {
    const match = matches[i];
    const source = match[1].trim();
    const originalText = match[0];

    // 사용되지 않은 패턴 선택
    const patternIndex = (i - 2) % SOURCE_CITATION_PATTERNS.length;
    const newPattern = SOURCE_CITATION_PATTERNS[patternIndex].replace('{source}', source);

    result = result.replace(originalText, newPattern);
    diversifiedCount++;
  }

  return { content: result, diversifiedCount };
}

// ── 경험 기반 표현 삽입 ──

interface ExperienceResult {
  readonly content: string;
  readonly insertedCount: number;
}

/**
 * 경험 기반 표현을 콘텐츠에 자연스럽게 삽입한다.
 * AuthGR의 Experience(경험) 평가 신호를 강화.
 */
export function insertExperienceExpressions(
  content: string,
  maxInsertions: number = 2,
): ExperienceResult {
  const paragraphs = content.split('\n\n');
  let insertedCount = 0;

  // 이미 경험 표현이 있는지 체크
  const existingCount = EXPERIENCE_EXPRESSIONS.filter(exp => {
    const cleaned = exp.replace('{period}', '');
    return content.includes(cleaned.slice(0, 5));
  }).length;

  if (existingCount >= maxInsertions) {
    return { content, insertedCount: 0 };
  }

  const available = EXPERIENCE_EXPRESSIONS
    .filter(exp => {
      const cleaned = exp.replace('{period}', '');
      return !content.includes(cleaned.slice(0, 5));
    })
    .sort(() => Math.random() - 0.5);

  const targetCount = Math.min(maxInsertions - existingCount, available.length);

  // 본문 중간 부분에 삽입 (도입부/결론부 제외)
  for (let i = 0; i < targetCount; i++) {
    const paraIdx = Math.floor(paragraphs.length * (0.3 + i * 0.3));
    if (paraIdx >= 0 && paraIdx < paragraphs.length && paragraphs[paraIdx].length > 20) {
      let expression = available[i];

      // {period} 플레이스홀더 치환
      const periods = ['2주', '한 달', '3개월', '6개월', '1년'];
      expression = expression.replace('{period}', periods[Math.floor(Math.random() * periods.length)]);

      // 문단 시작에 자연스럽게 추가
      paragraphs[paraIdx] = `${expression} ${paragraphs[paraIdx]}`;
      insertedCount++;
    }
  }

  return {
    content: paragraphs.join('\n\n'),
    insertedCount,
  };
}

// ── 통합 AuthGR 방어 함수 ──

export interface AuthGRDefenseResult {
  readonly content: string;
  readonly fingerprint: AiFingerprint;
  readonly expertiseInjected: number;
  readonly citationsDiversified: number;
  readonly experienceInserted: number;
  readonly totalModifications: number;
}

/**
 * AuthGR 방어를 통합적으로 적용한다.
 *
 * 1. AI 지문 측정
 * 2. 전문성 신호 주입
 * 3. 출처 인용 다양화
 * 4. 경험 표현 삽입
 * 5. 최종 AI 지문 재측정
 *
 * @param content 원본 콘텐츠
 * @param category 카테고리
 * @returns 방어 적용된 콘텐츠 + 분석 결과
 */
export function applyAuthGRDefense(
  content: string,
  category: string = 'general',
): AuthGRDefenseResult {
  // 1. 사전 측정
  const preFingerprint = measureAiFingerprint(content);

  // 2. 전문성 신호 주입
  const expertiseResult = injectExpertiseSignals(content, category, 3);

  // 3. 출처 인용 다양화
  const citationResult = diversifyCitations(expertiseResult.content);

  // 4. 경험 표현 삽입
  const experienceResult = insertExperienceExpressions(citationResult.content, 2);

  // 5. 최종 측정
  const postFingerprint = measureAiFingerprint(experienceResult.content);

  const totalModifications =
    expertiseResult.injectedCount +
    citationResult.diversifiedCount +
    experienceResult.insertedCount;

  console.log(
    `[AuthGR] 방어 적용 완료: ` +
    `risk ${preFingerprint.overallRisk}→${postFingerprint.overallRisk}, ` +
    `전문성 +${expertiseResult.injectedCount}, ` +
    `출처 다양화 +${citationResult.diversifiedCount}, ` +
    `경험 +${experienceResult.insertedCount}`,
  );

  return {
    content: experienceResult.content,
    fingerprint: postFingerprint,
    expertiseInjected: expertiseResult.injectedCount,
    citationsDiversified: citationResult.diversifiedCount,
    experienceInserted: experienceResult.insertedCount,
    totalModifications,
  };
}

// ═══════════════════════════════════════════════════════
// Phase 3-3: AuthGR 고도화 — 페르소나 프로필 + 경험 DB 확장
// ═══════════════════════════════════════════════════════

// ── 페르소나 프로필 ──

export interface PersonaProfile {
  readonly category: string;
  readonly expertiseYears: string;       // "3년", "5년째" 등
  readonly credentialHint: string;       // "관련 자격증 보유", "현직 종사자" 등
  readonly writingStyle: string;         // "경험 공유 위주", "데이터 분석 위주" 등
  readonly signatureExpressions: readonly string[];  // 페르소나 특유 표현
}

const PERSONA_PROFILES: Readonly<Record<string, PersonaProfile>> = {
  tech: {
    category: 'tech',
    expertiseYears: '5년째',
    credentialHint: 'IT 업계 종사자',
    writingStyle: '직접 사용 후기 + 스펙 비교',
    signatureExpressions: [
      '업데이트 로그를 보면',
      '실사용 기준으로 말하자면',
      '스펙시트만 보고 판단하면 안 되는 게',
      '커뮤니티에서도 비슷한 의견이 많은데',
    ],
  },
  health: {
    category: 'health',
    expertiseYears: '3년 넘게',
    credentialHint: '건강 관리에 관심 많은',
    writingStyle: '실천 경험 + 전문가 상담 병행',
    signatureExpressions: [
      '병원에서 상담받았을 때 들은 건',
      '꾸준히 해보니까 확실히',
      '처음에는 효과를 못 느꼈는데',
      '검진 수치로 비교해보면',
    ],
  },
  food: {
    category: 'food',
    expertiseYears: '몇 년째',
    credentialHint: '요리를 좋아하는',
    writingStyle: '직접 요리 + 맛집 탐방',
    signatureExpressions: [
      '여러 번 해먹어본 레시피인데',
      '현지인 추천 맛집이라',
      '재료 손질이 관건이에요',
      '계절마다 맛이 달라지더라고요',
    ],
  },
  travel: {
    category: 'travel',
    expertiseYears: '매년',
    credentialHint: '여행을 즐기는',
    writingStyle: '실제 방문 + 가성비 분석',
    signatureExpressions: [
      '직접 가본 곳이라 자신 있게 말하는데',
      '현지 교통편은 이렇게 이용했어요',
      '가격 대비 만족도를 따지면',
      '성수기와 비수기 차이가 크더라고요',
    ],
  },
  lifestyle: {
    category: 'lifestyle',
    expertiseYears: '꽤 오래',
    credentialHint: '실생활에서 꼼꼼하게 비교하는',
    writingStyle: '장기 사용 후기 + 가성비',
    signatureExpressions: [
      '한 달 넘게 써본 솔직 후기',
      'AS 경험까지 포함해서 말하면',
      '비슷한 제품 3개를 비교해봤는데',
      '일상에서 체감 차이가 큰 부분은',
    ],
  },
  general: {
    category: 'general',
    expertiseYears: '오래전부터',
    credentialHint: '관심을 갖고 지켜보던',
    writingStyle: '균형 잡힌 정보 정리',
    signatureExpressions: [
      '이 분야를 관심 있게 본 지 꽤 됐는데',
      '다양한 자료를 비교해본 결과',
      '주변 경험담까지 종합해보면',
      '냉정하게 따져보면',
    ],
  },
};

/**
 * 카테고리에 맞는 페르소나 프로필을 반환한다.
 */
export function getPersonaProfile(category: string): PersonaProfile {
  return PERSONA_PROFILES[category] ?? PERSONA_PROFILES.general;
}

// ── 확장 경험 패턴 데이터베이스 ──

const EXTENDED_EXPERIENCE_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  duration: [
    '사용한 지 {period}째인데',
    '{period} 넘게 써본 입장에서',
    '{period} 전에 구매해서 지금까지',
    '처음 접한 게 {period} 전이라',
  ],
  comparison: [
    '이전에 쓰던 {alt}와 비교하면',
    '{alt}에서 갈아탄 이유가',
    '둘 다 써봐야 차이를 알 수 있는데',
    '가격차를 감안하더라도',
  ],
  turning_point: [
    '결정적으로 마음이 바뀐 건',
    '처음에는 반신반의했지만',
    '직접 경험하고 나서야 알게 된 건',
    '주변 추천을 받고 써봤는데',
  ],
  honest: [
    '솔직히 아쉬운 점도 있어요',
    '장점만 있는 건 아닌데',
    '하나 꼽자면 이 부분이 아쉽더라고요',
    '완벽하진 않지만 그래도',
  ],
};

/**
 * 확장 경험 패턴을 콘텐츠에 주입한다.
 * Phase 1의 insertExperienceExpressions보다 더 정교한 패턴 매칭.
 */
export function injectExtendedExperience(
  content: string,
  category: string = 'general',
  maxInjections: number = 3,
): { readonly content: string; readonly injectedCount: number } {
  const persona = getPersonaProfile(category);
  const paragraphs = content.split('\n\n');

  if (paragraphs.length < 3) {
    return { content, injectedCount: 0 };
  }

  let injectedCount = 0;
  const periods = ['2주', '한 달', '3개월', '6개월', '1년'];
  const alts = ['이전 제품', '다른 브랜드', '기존 모델'];

  // 페르소나 시그니처 표현 1개 삽입 (도입부 근처)
  if (paragraphs.length > 2 && injectedCount < maxInjections) {
    const sigIdx = Math.floor(Math.random() * persona.signatureExpressions.length);
    const sig = persona.signatureExpressions[sigIdx];
    if (!content.includes(sig.slice(0, 8))) {
      paragraphs[1] = `${sig}, ${paragraphs[1].charAt(0).toLowerCase()}${paragraphs[1].slice(1)}`;
      injectedCount++;
    }
  }

  // turning_point 패턴 1개 (중반)
  const midIdx = Math.floor(paragraphs.length * 0.5);
  if (midIdx > 1 && midIdx < paragraphs.length - 1 && injectedCount < maxInjections) {
    const patterns = EXTENDED_EXPERIENCE_PATTERNS.turning_point;
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    if (!content.includes(pat.slice(0, 6))) {
      paragraphs[midIdx] = `${pat} ${paragraphs[midIdx]}`;
      injectedCount++;
    }
  }

  // honest 패턴 1개 (후반부, 결론 직전)
  const lateIdx = Math.max(2, paragraphs.length - 2);
  if (lateIdx > 1 && injectedCount < maxInjections) {
    const patterns = EXTENDED_EXPERIENCE_PATTERNS.honest;
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    if (!content.includes(pat.slice(0, 6))) {
      paragraphs[lateIdx] = `${pat} ${paragraphs[lateIdx]}`;
      injectedCount++;
    }
  }

  return {
    content: paragraphs.join('\n\n'),
    injectedCount,
  };
}

// ── AI 탐지 스코어 통합 측정 + 재생성 판단 ──

export interface ContentQualityAssessment {
  readonly fingerprint: AiFingerprint;
  readonly expertiseScore: number;     // 0-100 (전문성 신호 밀도)
  readonly experienceScore: number;    // 0-100 (경험 표현 밀도)
  readonly overallQuality: number;     // 0-100 (종합)
  readonly verdict: 'pass' | 'borderline' | 'regenerate';
  readonly suggestions: readonly string[];
}

/**
 * 콘텐츠의 AuthGR 품질을 종합 평가한다.
 *
 * - pass: 발행 가능
 * - borderline: 약간의 수정 후 발행 가능
 * - regenerate: 재생성 권장
 */
export function assessContentQuality(
  content: string,
  category: string = 'general',
): ContentQualityAssessment {
  const suggestions: string[] = [];

  // 1. AI 지문
  const fingerprint = measureAiFingerprint(content);

  // 2. 전문성 신호 밀도
  const allSignals = Object.values(CATEGORY_EXPERTISE_SIGNALS).flat();
  const matchedSignals = allSignals.filter(s => content.includes(s.pattern));
  const expertiseScore = Math.min(100, matchedSignals.length * 25);

  if (expertiseScore < 25) {
    suggestions.push('전문성 신호 부족 — 직접 경험/테스트 결과 표현 추가 권장');
  }

  // 3. 경험 표현 밀도
  const experienceKeywords = [
    '직접', '실제로', '경험', '사용해', '써본', '해본', '느낀',
    '체감', '솔직히', '개인적으로', '추천', '아쉬', '만족',
  ];
  const matchedExp = experienceKeywords.filter(kw => content.includes(kw));
  const experienceScore = Math.min(100, matchedExp.length * 10);

  if (experienceScore < 30) {
    suggestions.push('경험 기반 표현 부족 — 1인칭 체험담 추가 권장');
  }

  // 4. 종합 점수 (가중 평균)
  const overallQuality = Math.round(
    (100 - fingerprint.overallRisk) * 0.4 +  // AI 탐지 회피
    expertiseScore * 0.3 +                     // 전문성
    experienceScore * 0.3,                     // 경험
  );

  // 5. 판정
  let verdict: 'pass' | 'borderline' | 'regenerate';
  if (overallQuality >= 60) {
    verdict = 'pass';
  } else if (overallQuality >= 40) {
    verdict = 'borderline';
    suggestions.push('AuthGR 방어 적용(applyAuthGRDefense) 후 재평가 권장');
  } else {
    verdict = 'regenerate';
    suggestions.push('콘텐츠 재생성 강력 권장 — AI 탐지 위험 높음');
  }

  if (fingerprint.overallRisk >= 70) {
    suggestions.push(`AI 탐지 위험 ${fingerprint.overallRisk}점 — 문장 변동성 증가 필요`);
  }

  return {
    fingerprint,
    expertiseScore,
    experienceScore,
    overallQuality,
    verdict,
    suggestions,
  };
}
