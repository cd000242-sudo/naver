/**
 * [Phase 3-17/v2.10.163] contentGenerator god file decomposition — title safety checks.
 *
 * 제목 안전성 검증:
 *   - validateTitleContainsKeyword: 제목 키워드 포함 여부 (환각 방지)
 *   - detectPromptLeakageInTitle: 프롬프트 지침 누출 감지
 *   - validateTitleNotTooSimilarToKeyword: 키워드 유사도 (중복 문서 위험)
 *   - assessHallucinationRisk: 콘텐츠 환각 위험도 (크롤링 데이터 부족)
 */


/**
 * ✅ 제목에 키워드가 포함되어 있는지 검증
 * - 생성된 제목이 입력 키워드를 정확히 반영하는지 확인
 * - 환각(Hallucination) 방지
 */
export function validateTitleContainsKeyword(title: string, keyword: string): {
  isValid: boolean;
  score: number;
  missingKeywords: string[];
  suggestion?: string;
} {
  const cleanTitle = (title || '').trim().toLowerCase();
  const cleanKeyword = (keyword || '').trim();

  if (!cleanKeyword) {
    return { isValid: true, score: 1, missingKeywords: [] };
  }

  // 복합 키워드 분리 (·, /, :, - 등)
  const complexSeparators = /[·\/:,\-–—|;]+/g;
  const segments = cleanKeyword.split(complexSeparators).map(s => s.trim()).filter(s => s.length >= 2);

  // 각 세그먼트에서 핵심 단어 추출
  const coreWords: string[] = [];
  for (const seg of segments) {
    const words = seg.split(/\s+/).filter(w => w.length >= 2);
    coreWords.push(...words);
  }

  // 불용어 제거
  const stopWords = new Set(['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터']);
  const importantWords = coreWords.filter(w => !stopWords.has(w) && w.length >= 2);

  if (importantWords.length === 0) {
    return { isValid: true, score: 1, missingKeywords: [] };
  }

  // 제목에 포함된 키워드 확인
  const missingKeywords: string[] = [];
  let matchCount = 0;

  for (const word of importantWords) {
    if (cleanTitle.includes(word.toLowerCase())) {
      matchCount++;
    } else {
      missingKeywords.push(word);
    }
  }

  const score = matchCount / importantWords.length;
  const isValid = score >= 0.5; // 50% 이상 일치해야 유효

  // 개선 제안
  let suggestion: string | undefined;
  if (!isValid && missingKeywords.length > 0) {
    suggestion = `제목에 누락된 키워드: ${missingKeywords.join(', ')}. 키워드를 제목에 포함시키세요.`;
  }

  return { isValid, score, missingKeywords, suggestion };
}

/**
 * ✅ 제목에서 프롬프트 지침 누출 감지
 * - AI가 프롬프트 내부의 가이드라인 문구를 제목으로 생성한 경우 감지
 * - 본문과 관련없는 제목 생성 방지
 */
export function detectPromptLeakageInTitle(title: string, keyword: string): {
  isLeaked: boolean;
  leakagePatterns: string[];
  suggestion?: string;
} {
  const cleanTitle = (title || '').trim();
  const leakagePatterns: string[] = [];

  // ⚠️ 프롬프트 지침에서 자주 사용되는 문구들 (절대 제목에 포함되면 안 됨)
  const promptLeakagePatterns = [
    // 노출/SEO 관련 지침 문구
    '노출 0', '노출 극대화', '노출이 없', '검색 노출', 'SEO 최적화', '상위노출',
    // 체류시간/클릭률 관련
    '체류시간', '클릭률', '완독률', '이탈률', '참여도',
    // AI/봇 관련
    'AI 티', 'AI가', '봇 티', '챗봇',
    // 글쓰기 가이드라인 문구
    '~에 대해 알아보겠습니다', '소개해드리겠습니다', '알아보세요', '알아보자',
    '오늘은 ~에 대해', '이번 글에서는',
    // 해시태그/태그 관련
    '해시태그', '#', '태그',
    // 이모지 관련 가이드
    '이모지 때문', '이모지를 사용', '이모지 남용',
    // 도입부/마무리 가이드
    '도입부', '마무리부', '첫 3줄', '후킹',
    // 키워드 관련 가이드
    '키워드 밀도', '키워드 배치', '롱테일 키워드'
  ];

  // 패턴 검사
  for (const pattern of promptLeakagePatterns) {
    if (cleanTitle.toLowerCase().includes(pattern.toLowerCase())) {
      leakagePatterns.push(pattern);
    }
  }

  // 키워드와의 관련성 검사 (핵심 단어 기반)
  const keywordWords = (keyword || '').split(/[\s\-–—\/|·:,]+/).filter(w => w.length >= 2);
  const titleWords = cleanTitle.split(/[\s\-–—\/|·:,]+/).filter(w => w.length >= 2);

  // 키워드의 단어가 제목에 하나도 없으면 의심
  const hasKeywordMatch = keywordWords.some(kw =>
    titleWords.some(tw => tw.includes(kw) || kw.includes(tw))
  );

  // 프롬프트 누출이 있거나, 키워드와 전혀 관련없는 제목
  const isLeaked = leakagePatterns.length > 0 || (keywordWords.length > 0 && !hasKeywordMatch);

  let suggestion: string | undefined;
  if (leakagePatterns.length > 0) {
    suggestion = `⚠️ 프롬프트 지침 누출 감지: "${leakagePatterns.join('", "')}" 문구가 제목에 포함됨. 제목을 재생성해야 합니다.`;
    console.error(`[경고] 프롬프트 누출 감지: 제목="${cleanTitle}", 누출패턴=${JSON.stringify(leakagePatterns)}`);
  } else if (keywordWords.length > 0 && !hasKeywordMatch) {
    suggestion = `⚠️ 제목이 키워드 "${keyword}"와 관련이 없습니다. 키워드 포함 제목으로 재생성해야 합니다.`;
    console.error(`[경고] 키워드 불일치: 키워드="${keyword}", 제목="${cleanTitle}"`);
  }

  return { isLeaked, leakagePatterns, suggestion };
}

/**
 * ✅ [2026-01-30] 제목-키워드 유사도 검증
 * - 생성된 제목이 키워드와 너무 유사하면 중복 문서 위험
 * - 유사도 80% 이상이면 경고
 */
export function validateTitleNotTooSimilarToKeyword(title: string, keyword: string): {
  isTooSimilar: boolean;
  similarity: number;
  warning?: string;
} {
  const cleanTitle = (title || '').trim();
  const cleanKeyword = (keyword || '').trim();

  if (!cleanTitle || !cleanKeyword) {
    return { isTooSimilar: false, similarity: 0 };
  }

  // 정규화 (소문자, 공백 제거, 특수문자 제거)
  const normalizeForCompare = (s: string): string =>
    String(s || '')
      .toLowerCase()
      .replace(/[\s\-–—:|·•.,!?()[\]{}\"']/g, '')
      .trim();

  const normalizedTitle = normalizeForCompare(cleanTitle);
  const normalizedKeyword = normalizeForCompare(cleanKeyword);

  // 완전 동일
  if (normalizedTitle === normalizedKeyword) {
    console.warn(`[TitleValidation] ⚠️ 제목과 키워드 완전 동일: "${cleanTitle}"`);
    return {
      isTooSimilar: true,
      similarity: 1,
      warning: `⚠️ 제목이 키워드와 동일합니다. 중복 문서로 판정될 수 있습니다.`
    };
  }

  // 제목이 키워드로 시작하고, 뒤에 조금만 추가된 경우
  if (normalizedTitle.startsWith(normalizedKeyword)) {
    const extraLength = normalizedTitle.length - normalizedKeyword.length;
    const extraRatio = extraLength / normalizedTitle.length;

    // 추가된 부분이 20% 미만이면 너무 유사
    if (extraRatio < 0.2) {
      console.warn(`[TitleValidation] ⚠️ 제목이 키워드에 조금만 추가됨: "${cleanTitle}"`);
      return {
        isTooSimilar: true,
        similarity: 1 - extraRatio,
        warning: `⚠️ 제목이 키워드와 거의 동일합니다 (${Math.round((1 - extraRatio) * 100)}% 유사). 더 창의적으로 변형하세요.`
      };
    }
  }

  // 단어 기반 유사도 계산
  const titleWords = cleanTitle.split(/[\s\-–—:|·•.,!?]+/).filter(w => w.length >= 2);
  const keywordWords = cleanKeyword.split(/[\s\-–—:|·•.,!?]+/).filter(w => w.length >= 2);

  if (keywordWords.length === 0) {
    return { isTooSimilar: false, similarity: 0 };
  }

  // 키워드 단어 중 제목에 포함된 비율
  let matchCount = 0;
  for (const kw of keywordWords) {
    for (const tw of titleWords) {
      if (tw.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(tw.toLowerCase())) {
        matchCount++;
        break;
      }
    }
  }

  const similarity = matchCount / keywordWords.length;

  // 80% 이상 단어가 동일하면 경고
  if (similarity >= 0.8 && titleWords.length <= keywordWords.length + 2) {
    console.warn(`[TitleValidation] ⚠️ 제목과 키워드 유사도 높음 (${Math.round(similarity * 100)}%): "${cleanTitle}"`);
    return {
      isTooSimilar: true,
      similarity,
      warning: `⚠️ 제목과 키워드 유사도 ${Math.round(similarity * 100)}%. 숫자, 질문형, 손실회피 트리거를 추가하세요.`
    };
  }

  return { isTooSimilar: false, similarity };
}

/**
 * ✅ 콘텐츠 환각(Hallucination) 위험도 평가
 * - 크롤링 결과가 부족할 때 AI가 정보를 지어낼 위험도 계산
 */
export function assessHallucinationRisk(source: {
  bodyText?: string;
  crawledContent?: string;
  urlCount?: number;
}): {
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let riskScore = 0;

  const bodyLength = (source.bodyText || '').length;
  const crawledLength = (source.crawledContent || '').length;
  const urlCount = source.urlCount || 0;

  // 크롤링된 콘텐츠 없음 → 고위험
  if (crawledLength < 500 && urlCount === 0) {
    riskScore += 40;
    warnings.push('실시간 정보 수집 실패: 크롤링된 콘텐츠 없음');
  }

  // 본문 내용 부족 → 중위험
  if (bodyLength < 1000) {
    riskScore += 30;
    warnings.push(`본문 내용 부족 (${bodyLength}자): AI가 정보를 추측할 수 있음`);
  }

  // URL 크롤링 실패
  if (urlCount > 0 && crawledLength < 500) {
    riskScore += 20;
    warnings.push('URL 크롤링 결과가 매우 적음');
  }

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (riskScore >= 50) riskLevel = 'high';
  else if (riskScore >= 25) riskLevel = 'medium';

  return { riskLevel, score: riskScore, warnings };
}
