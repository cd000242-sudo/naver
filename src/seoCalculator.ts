/**
 * SEO 점수 실제 계산 모듈
 *
 * [SPEC-KEYWORD-ENDGAME Phase 4] 밀도→충실도 재조정 (2026-07-04):
 * 기존 배점은 키워드 밀도가 총점의 30%였고 2~3%에 만점을 줘 스터핑을 장려했다(옛 SEO 기준).
 * 네이버 현행 로직(C-rank/DIA+)은 밀도보다 문서 충실도(구체 수치·근거·직답)가 노출을 가른다.
 * → 밀도 15점(과밀 >4%만 강벌점, 저밀도는 거의 무해) + 충실도 15점(수치·단위/근거 표현/질문형
 * 소제목 — DIA 구체성 프록시) 신설. 총점 100 유지.
 */

export interface SEOScoreDetail {
  totalScore: number;
  keywordDensity: number;
  titleOptimization: number;
  headingOptimization: number;
  contentLength: number;
  readability: number;
  /** [Phase 4] 충실도(구체 수치·근거·직답 신호) 0~15. */
  fulfillment: number;
  strategy: string;
}

export interface SEOCalculationInput {
  content: string;
  title: string;
  headings: Array<{ title: string }>;
  keywords: string[];
  targetKeyword: string;
  wordCount: number;
}

export function calculateSEOScore(input: SEOCalculationInput): SEOScoreDetail {
  const {
    content,
    title,
    headings,
    keywords,
    wordCount,
  } = input;

  const keywordDensityScore = calculateKeywordDensity(content, keywords);
  const titleScore = calculateTitleOptimization(title, keywords);
  const headingScore = calculateHeadingOptimization(headings, keywords);
  const lengthScore = calculateLengthScore(wordCount);
  const readabilityScore = calculateReadability(content);
  const fulfillmentScore = calculateFulfillment(content, headings);

  const totalScore = Math.min(
    100,
    keywordDensityScore + titleScore + headingScore + lengthScore + readabilityScore + fulfillmentScore
  );

  const strategy = generateStrategy({
    totalScore,
    keywordDensityScore,
    titleScore,
    headingScore,
    lengthScore,
    readabilityScore,
    fulfillmentScore,
  });

  return {
    totalScore: Math.round(totalScore),
    keywordDensity: Math.round(keywordDensityScore),
    titleOptimization: Math.round(titleScore),
    headingOptimization: Math.round(headingScore),
    contentLength: Math.round(lengthScore),
    readability: Math.round(readabilityScore),
    fulfillment: Math.round(fulfillmentScore),
    strategy,
  };
}

function calculateKeywordDensity(content: string, keywords: string[]): number {
  if (!content || keywords.length === 0) return 0;

  const totalWords = content.replace(/\s+/g, '').length;
  let totalKeywordCount = 0;

  keywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    const matches = content.match(regex);
    totalKeywordCount += matches ? matches.length : 0;
  });

  const density = (totalKeywordCount / totalWords) * 100;

  // [Phase 4] 밀도 재조정 (최대 15점, 기존 30점) — 넓은 건강 구간 + 과밀만 강벌점.
  //   0.5~2.5% 만점 / 저밀도는 거의 무해(충실도 시대) / >4% 스터핑 = 스팸 신호 위험.
  if (density >= 0.5 && density <= 2.5) {
    return 15;
  } else if (density > 2.5 && density <= 4) {
    return 10;
  } else if (density > 4) {
    return 3; // 과밀 — 스팸 신호 위험
  } else if (density > 0) {
    return 12; // 저밀도 — 충실도가 받쳐주면 문제 없음
  }
  return 5; // 키워드 미등장
}

// [Phase 4] 충실도(0~15) — 네이버 DIA+ 구체성 프록시. LLM 없이 결정적으로 잴 수 있는 신호만:
//   ① 구체 수치+단위(가격/비율/용량/기간 등) ② 근거·경험 연결어 ③ 질문형 소제목(직답 구조).
const NUMERIC_UNIT_RE = /\d[\d.,]*\s*(?:원|만원|억|%|퍼센트|kg|g|mg|ml|L|리터|시간|분|초|개|회|번|명|년|월|일|주|cm|mm|m|km|평|W|kWh|mAh|GB|MB|TB|인치|도)\b|\d[\d.,]*\s*(?:원|만원|억|%|kg|g|ml|시간|분|개|회|명|년|월|일|평)/g;
const EVIDENCE_RE = /(?:기준으로|때문에|실제로|예를 들어|비교하면|비교해\s*보면|결과적으로|직접\s*(?:해|써|사용해|확인해)|측정|검증|근거|출처|공식\s*(?:발표|자료)|조사에\s*따르면)/g;

function calculateFulfillment(content: string, headings: Array<{ title: string }>): number {
  if (!content) return 0;
  let score = 0;

  // ① 구체 수치+단위 (0~8): 정보 충실 문서는 구체 숫자가 흩어져 있다.
  const numericHits = (content.match(NUMERIC_UNIT_RE) || []).length;
  if (numericHits >= 12) score += 8;
  else if (numericHits >= 8) score += 6;
  else if (numericHits >= 4) score += 4;
  else if (numericHits >= 1) score += 2;

  // ② 근거·경험 연결어 (0~4): 판단 근거를 제시하는 문서 신호.
  const evidenceHits = (content.match(EVIDENCE_RE) || []).length;
  if (evidenceHits >= 6) score += 4;
  else if (evidenceHits >= 3) score += 3;
  else if (evidenceHits >= 1) score += 2;

  // ③ 질문형 소제목 (0~3): 질문→직답 구조는 AI 브리핑/스마트블록 인용 확률을 높인다.
  const questionHeadings = (headings || []).filter((h) => /\?|까요|일까|나요|할까/.test(String(h?.title || ''))).length;
  if (questionHeadings >= 2) score += 3;
  else if (questionHeadings >= 1) score += 2;

  return Math.min(15, score);
}

function calculateTitleOptimization(title: string, keywords: string[]): number {
  let score = 0;

  const hasKeyword = keywords.some(keyword => title.includes(keyword));
  if (hasKeyword) {
    score += 15;
  }

  const titleLength = title.length;
  if (titleLength >= 20 && titleLength <= 35) {
    score += 10;
  } else if (titleLength >= 15 && titleLength <= 45) {
    score += 7;
  } else {
    score += 3;
  }

  return score;
}

function calculateHeadingOptimization(
  headings: Array<{ title: string }>,
  keywords: string[]
): number {
  if (headings.length === 0) return 0;

  let score = 0;

  const headingCount = headings.length;
  if (headingCount >= 5 && headingCount <= 8) {
    score += 10;
  } else if (headingCount >= 3 && headingCount <= 10) {
    score += 7;
  } else {
    score += 3;
  }

  let headingsWithKeyword = 0;
  headings.forEach(heading => {
    if (keywords.some(keyword => heading.title.includes(keyword))) {
      headingsWithKeyword++;
    }
  });

  const keywordRatio = headingsWithKeyword / headingCount;
  if (keywordRatio >= 0.5) {
    score += 10;
  } else if (keywordRatio >= 0.3) {
    score += 7;
  } else {
    score += 3;
  }

  return score;
}

function calculateLengthScore(wordCount: number): number {
  if (wordCount >= 2000) {
    return 15;
  } else if (wordCount >= 1500) {
    return 12;
  } else if (wordCount >= 1000) {
    return 9;
  } else if (wordCount >= 500) {
    return 6;
  } else {
    return 3;
  }
}

function calculateReadability(content: string): number {
  if (!content) return 0;

  const paragraphs = content.split(/\n{2,}/);
  const sentences = content.split(/[.!?。]/);

  let score = 0;

  const paragraphCount = paragraphs.length;
  if (paragraphCount >= 10 && paragraphCount <= 30) {
    score += 5;
  } else if (paragraphCount >= 5 && paragraphCount <= 40) {
    score += 3;
  } else {
    score += 1;
  }

  const avgSentenceLength = content.length / Math.max(sentences.length, 1);
  if (avgSentenceLength >= 15 && avgSentenceLength <= 30) {
    score += 5;
  } else if (avgSentenceLength >= 10 && avgSentenceLength <= 40) {
    score += 3;
  } else {
    score += 1;
  }

  return score;
}

function generateStrategy(scores: {
  totalScore: number;
  keywordDensityScore: number;
  titleScore: number;
  headingScore: number;
  lengthScore: number;
  readabilityScore: number;
  fulfillmentScore: number;
}): string {
  const suggestions: string[] = [];

  // [Phase 4] "키워드를 더 자주 사용하세요"(스터핑 장려) 제거 — 과밀만 경고, 부족분은 충실도로 안내.
  if (scores.keywordDensityScore <= 3) {
    suggestions.push('키워드 과밀 — 스팸 신호 위험, 자연스럽게 줄이세요');
  }
  if (scores.fulfillmentScore < 8) {
    suggestions.push('구체 수치·단위와 근거 표현을 늘리세요 (충실도가 노출을 가릅니다)');
  }

  if (scores.titleScore < 20) {
    suggestions.push('제목에 주요 키워드를 포함하세요');
  }

  if (scores.headingScore < 15) {
    suggestions.push('소제목을 5-8개로 늘리세요');
  }

  if (scores.lengthScore < 12) {
    suggestions.push('본문을 2000자 이상으로 확장하세요');
  }

  if (scores.readabilityScore < 7) {
    suggestions.push('문장을 짧게 나누세요');
  }

  if (suggestions.length === 0) {
    return 'SEO 최적화가 잘 되어 있습니다';
  }

  return suggestions.join(', ');
}







