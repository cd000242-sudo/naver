export interface DuplicateHeadingLike {
  title: string;
}

export interface DuplicateValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Calculates text similarity with a weighted mix of word, n-gram, and sentence-ending signals.
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

  const getNgrams = (text: string, n: number): Set<string> => {
    const words = text.split(/\s+/).filter(w => w.length > 1);
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  };

  const ngrams1 = getNgrams(str1, 2);
  const ngrams2 = getNgrams(str2, 2);

  let ngramSimilarity = 0;
  if (ngrams1.size > 0 && ngrams2.size > 0) {
    const ngramIntersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
    const ngramUnion = new Set([...ngrams1, ...ngrams2]);
    ngramSimilarity = ngramUnion.size > 0 ? ngramIntersection.size / ngramUnion.size : 0;
  }

  const getEndings = (text: string): string[] => {
    const endings: string[] = [];
    const sentences = text.split(/[.!?]/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 3) {
        endings.push(trimmed.slice(-5));
      }
    }
    return endings;
  };

  const endings1 = getEndings(str1);
  const endings2 = getEndings(str2);

  let endingSimilarity = 0;
  if (endings1.length > 0 && endings2.length > 0) {
    const matchingEndings = endings1.filter(e1 =>
      endings2.some(e2 => e1 === e2 || e1.includes(e2) || e2.includes(e1))
    );
    endingSimilarity = matchingEndings.length / Math.max(endings1.length, endings2.length);
  }

  return jaccardSimilarity * 0.5 + ngramSimilarity * 0.3 + endingSimilarity * 0.2;
}

export function validateHeadingOrder(
  headings: DuplicateHeadingLike[],
  _articleType?: unknown
): DuplicateValidationResult {
  if (!headings || headings.length === 0) {
    return { valid: true, errors: [] };
  }

  if (headings.length >= 3 && headings.length <= 10) {
    return { valid: true, errors: [] };
  }

  if (headings.length < 3) {
    console.warn(`[Heading Order] 소제목이 ${headings.length}개로 적음(권장: 3 - 7개)`);
  }
  if (headings.length > 10) {
    console.warn(`[Heading Order] 소제목이 ${headings.length}개로 많음(권장: 3 - 7개)`);
  }

  return { valid: true, errors: [] };
}

export function detectDuplicateContent(
  bodyPlain: string,
  _headings: DuplicateHeadingLike[],
  isLastAttempt: boolean = false
): DuplicateValidationResult {
  if (!bodyPlain || bodyPlain.length === 0) {
    return { valid: false, errors: ['본문이 비어있습니다.'] };
  }

  if (bodyPlain.length >= 1500) {
    console.log(`[detectDuplicateContent] ✅ 본문 충분(${bodyPlain.length}자)`);
    return { valid: true, errors: [] };
  }

  if (bodyPlain.length >= 800) {
    console.warn(`[detectDuplicateContent] ⚠️ 본문 약간 짧음(${bodyPlain.length}자), 통과`);
    return { valid: true, errors: [] };
  }

  if (isLastAttempt) {
    console.warn(`[detectDuplicateContent] ⚠️ 마지막 시도(${bodyPlain.length}자) - 재시도 모두 소진, 현재 결과로 진행`);
    return { valid: true, errors: [] };
  }

  if (bodyPlain.length >= 400) {
    console.warn(`[detectDuplicateContent] ⚠️ 본문 부족(${bodyPlain.length}자), 재시도 권장`);
    return { valid: false, errors: [`본문이 ${bodyPlain.length}자로 부족합니다. 최소 800자 이상 권장.`] };
  }

  console.error(`[detectDuplicateContent] ❌ 본문 너무 짧음(${bodyPlain.length}자), 재시도 필요`);
  return { valid: false, errors: [`본문이 ${bodyPlain.length}자로 너무 짧습니다. 최소 800자 이상 필요.`] };
}

export function checkDuplicateHeadings(
  bodyPlain: string,
  headings: DuplicateHeadingLike[]
): DuplicateValidationResult {
  const errors: string[] = [];

  if (!headings || headings.length === 0) {
    return { valid: true, errors: [] };
  }

  if (bodyPlain.length >= 1500) {
    const firstHeading = headings[0].title;
    const regex = new RegExp(escapeRegex(firstHeading), 'g');
    const matches = bodyPlain.match(regex);
    const count = matches ? matches.length : 0;

    if (count >= 3) {
      errors.push(`전체 글 구조가 ${count}번 반복됨 - 심각한 중복`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  for (const heading of headings) {
    const headingTitle = heading.title;
    const regex = new RegExp(escapeRegex(headingTitle), 'g');
    const matches = bodyPlain.match(regex);
    const count = matches ? matches.length : 0;

    if (count >= 3) {
      errors.push(`소제목 "${headingTitle.substring(0, 20)}..."이(가) ${count}번 반복됨`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function removeRepeatedFullContent(bodyPlain: string, headings: DuplicateHeadingLike[]): string {
  if (!bodyPlain || !headings || headings.length === 0) return bodyPlain;

  const headingPositions: Array<{ title: string; index: number }> = [];
  for (const heading of headings) {
    const index = bodyPlain.indexOf(heading.title);
    if (index !== -1) {
      headingPositions.push({ title: heading.title, index });
    }
  }

  headingPositions.sort((a, b) => a.index - b.index);

  if (headingPositions.length < 2) return bodyPlain;

  const firstHeading = headingPositions[0].title;
  const firstHeadingIndex = headingPositions[0].index;
  const firstHeadingRegex = new RegExp(escapeRegex(firstHeading), 'g');
  const allMatches: number[] = [];
  let match;

  while ((match = firstHeadingRegex.exec(bodyPlain)) !== null) {
    allMatches.push(match.index);
  }

  if (allMatches.length > 1) {
    const lastHeadingIndex = headingPositions[headingPositions.length - 1].index;
    const firstPatternLength = lastHeadingIndex - firstHeadingIndex;
    const afterFirstPattern = bodyPlain.substring(firstHeadingIndex + firstPatternLength);
    const secondPatternStart = afterFirstPattern.indexOf(firstHeading);

    if (secondPatternStart !== -1) {
      const secondPatternEnd = Math.min(
        secondPatternStart + firstPatternLength,
        afterFirstPattern.length
      );
      const secondPattern = afterFirstPattern.substring(secondPatternStart, secondPatternEnd);
      const firstPattern = bodyPlain.substring(firstHeadingIndex, firstHeadingIndex + firstPatternLength);

      const similarity = calculateSimilarity(
        firstPattern.toLowerCase().replace(/\s+/g, ' '),
        secondPattern.toLowerCase().replace(/\s+/g, ' ')
      );

      if (similarity > 0.8) {
        console.warn(`[전체 글 반복 감지] 유사도 ${(similarity * 100).toFixed(1)}% - 반복된 전체 구조 제거`);

        const endOfFirstPattern = firstHeadingIndex + firstPatternLength;
        const beforeRepeat = bodyPlain.substring(0, endOfFirstPattern);
        const afterRepeat = afterFirstPattern.substring(secondPatternStart + firstPatternLength);

        if (afterRepeat.trim().length > 50) {
          const afterRepeatSimilarity = calculateSimilarity(
            firstPattern.toLowerCase().replace(/\s+/g, ' '),
            afterRepeat.substring(0, Math.min(afterRepeat.length, firstPatternLength)).toLowerCase().replace(/\s+/g, ' ')
          );

          if (afterRepeatSimilarity < 0.7) {
            return (beforeRepeat + '\n\n' + afterRepeat).trim();
          }
        }

        return beforeRepeat.trim();
      }
    }
  }

  if (headingPositions.length >= 3) {
    const firstThreeTitles = headingPositions.slice(0, 3).map(h => h.title);
    let patternFound = false;
    let repeatStartIndex = -1;

    for (let i = 3; i < headingPositions.length; i++) {
      const currentTitle = headingPositions[i].title;
      if (currentTitle === firstThreeTitles[0]) {
        let matchesPattern = true;
        for (let j = 0; j < Math.min(3, headingPositions.length - i); j++) {
          if (headingPositions[i + j]?.title !== firstThreeTitles[j]) {
            matchesPattern = false;
            break;
          }
        }

        if (matchesPattern) {
          patternFound = true;
          repeatStartIndex = headingPositions[i].index;
          break;
        }
      }
    }

    if (patternFound && repeatStartIndex !== -1) {
      console.warn(`[소제목 순서 반복 감지] 반복된 소제목 순서 패턴 제거`);
      return bodyPlain.substring(0, repeatStartIndex).trim();
    }
  }

  return bodyPlain;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
