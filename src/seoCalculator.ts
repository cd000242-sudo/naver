/**
 * SEO 점수 실제 계산 모듈
 */

export interface SEOScoreDetail {
  totalScore: number;
  keywordDensity: number;
  titleOptimization: number;
  headingOptimization: number;
  contentLength: number;
  readability: number;
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

  const totalScore = Math.min(
    100,
    keywordDensityScore + titleScore + headingScore + lengthScore + readabilityScore
  );

  const strategy = generateStrategy({
    totalScore,
    keywordDensityScore,
    titleScore,
    headingScore,
    lengthScore,
    readabilityScore,
  });

  return {
    totalScore: Math.round(totalScore),
    keywordDensity: Math.round(keywordDensityScore),
    titleOptimization: Math.round(titleScore),
    headingOptimization: Math.round(headingScore),
    contentLength: Math.round(lengthScore),
    readability: Math.round(readabilityScore),
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

  if (density >= 2 && density <= 3) {
    return 30;
  } else if (density >= 1.5 && density <= 4) {
    return 25;
  } else if (density >= 1 && density <= 5) {
    return 20;
  } else if (density > 5) {
    return 10;
  } else {
    return 15;
  }
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
}): string {
  const suggestions: string[] = [];

  if (scores.keywordDensityScore < 20) {
    suggestions.push('키워드를 더 자주 사용하세요');
  } else if (scores.keywordDensityScore === 10) {
    suggestions.push('키워드가 과도합니다');
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







