/**
 * 완전자동 발행용 제목 선택기
 * 
 * AI 출력에서 [TITLE_1], [TITLE_2], [TITLE_3] 파싱
 * 점수화 로직 실행 → 최적 제목 선택
 * {{SELECTED_TITLE}} 토큰 치환
 */

export interface ParsedTitle {
  id: number;
  text: string;
  score: number;
  reasons: string[];
}

export interface TitleSelectionResult {
  success: boolean;
  titles: ParsedTitle[];
  selectedTitle: ParsedTitle | null;
  processedBody: string;
  error?: string;
}

/**
 * AI 출력에서 제목 파싱
 * 형식: [TITLE_1] 제목내용
 */
export function parseTitles(content: string): ParsedTitle[] {
  const titles: ParsedTitle[] = [];
  
  // [TITLE_1], [TITLE_2], [TITLE_3] 패턴 매칭
  const titlePattern = /\[TITLE_(\d+)\]\s*(.+?)(?=\[TITLE_|\n\n|$)/gs;
  let match;
  
  while ((match = titlePattern.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const text = match[2].trim();
    
    if (text && id >= 1 && id <= 3) {
      titles.push({
        id,
        text,
        score: 0,
        reasons: []
      });
    }
  }
  
  // 대안 패턴: 줄바꿈으로 구분된 형태
  if (titles.length === 0) {
    const lines = content.split('\n');
    for (const line of lines) {
      const altMatch = line.match(/^\[TITLE_(\d+)\]\s*(.+)$/);
      if (altMatch) {
        const id = parseInt(altMatch[1], 10);
        const text = altMatch[2].trim();
        if (text && id >= 1 && id <= 3) {
          titles.push({
            id,
            text,
            score: 0,
            reasons: []
          });
        }
      }
    }
  }
  
  console.log(`[TitleSelector] 파싱된 제목: ${titles.length}개`);
  return titles;
}

/**
 * 제목 점수화 (홈판 노출 최적화 기준)
 */
export function scoreTitles(titles: ParsedTitle[]): ParsedTitle[] {
  return titles.map(title => {
    let score = 50; // 기본 점수
    const reasons: string[] = [];
    
    const text = title.text;
    
    // 1. 글자 수 (22~28자 최적)
    const length = text.length;
    if (length >= 22 && length <= 28) {
      score += 15;
      reasons.push('최적 글자수(22-28자)');
    } else if (length >= 18 && length <= 32) {
      score += 8;
      reasons.push('적정 글자수');
    } else if (length < 15 || length > 40) {
      score -= 10;
      reasons.push('글자수 부적합');
    }
    
    // 2. 따옴표 인용 포함
    if (/"[^"]+"|'[^']+'|"[^"]+"|「[^」]+」/.test(text)) {
      score += 12;
      reasons.push('따옴표 인용');
    }
    
    // 3. 구체성 포함 (숫자, 금액, 비율 등 — 기간만이 아님)
    const hasPeriod = /\d+[년월주일]\s*(차|째|만에|이용|사용|동안|후|전)?/.test(text);
    const hasNumber = /\d+[만억원%명개세살]|\d+,\d+/.test(text);
    if (hasNumber) {
      score += 10;
      reasons.push('구체적 숫자(금액/비율/수치)');
    } else if (hasPeriod) {
      score += 5; // 기간도 구체성이지만 남용 방지를 위해 가점 축소
      reasons.push('기간 표현');
    }
    
    // 4. 감정 단어 포함
    const emotionWords = ['충격', '눈물', '감동', '논란', '폭로', '고백', '반전', '결국', '드디어', '심경', '속마음', '진심', '후회', '분노', '환호', '실망', '기대', '걱정'];
    const hasEmotion = emotionWords.some(word => text.includes(word));
    if (hasEmotion) {
      score += 10;
      reasons.push('감정 단어');
    }
    
    // 5. 관계성 표현
    const relationWords = ['남편', '아내', '부모', '자녀', '동료', '친구', '선후배', '팬', '멤버', '파트너'];
    const hasRelation = relationWords.some(word => text.includes(word));
    if (hasRelation) {
      score += 8;
      reasons.push('관계성 표현');
    }
    
    // 6. 물음표 감점 (홈판에서 비추천)
    if (text.includes('?')) {
      score -= 5;
      reasons.push('물음표 사용(감점)');
    }
    
    // 7. 설명형 제목 감점
    const explanatoryPatterns = ['~란', '~이란', '~하는 방법', '~하는 이유', '정리', '총정리', '알아보'];
    const isExplanatory = explanatoryPatterns.some(p => text.includes(p));
    if (isExplanatory) {
      score -= 8;
      reasons.push('설명형 제목(감점)');
    }
    
    // 8. 클릭 유도 문구 (적절히 사용 시 가점)
    const clickBaitWords = ['결국', '드디어', '알고보니', '사실은', '몰랐던'];
    const hasClickBait = clickBaitWords.some(word => text.includes(word));
    if (hasClickBait) {
      score += 5;
      reasons.push('클릭 유도');
    }
    
    return {
      ...title,
      score: Math.max(0, Math.min(100, score)), // 0~100 범위
      reasons
    };
  });
}

/**
 * 후보 세트 단위 기간 편중 감점
 * 전체 후보 중 기간 표현이 2개 이상이면 초과분에 감점 적용
 */
function penalizePeriodOveruse(titles: ParsedTitle[]): ParsedTitle[] {
  const periodPattern = /\d+[년월주일]\s*(차|째|만에|이용|사용|동안|후|전)?/;
  const periodTitles = titles.filter(t => periodPattern.test(t.text));

  if (periodTitles.length <= 1) return titles; // 1개 이하면 감점 없음

  // 기간 제목을 점수 낮은 순으로 감점 (가장 높은 1개는 유지)
  const sortedPeriod = [...periodTitles].sort((a, b) => b.score - a.score);
  const toPenalize = new Set(sortedPeriod.slice(1).map(t => t.id));

  console.log(`[TitleSelector] ⚠️ 기간 표현 ${periodTitles.length}개 감지 → ${toPenalize.size}개 감점`);

  return titles.map(t => {
    if (toPenalize.has(t.id)) {
      return {
        ...t,
        score: Math.max(0, t.score - 10),
        reasons: [...t.reasons, '기간 편중 감점(-10)']
      };
    }
    return t;
  });
}

/**
 * 최적 제목 선택
 */
export function selectBestTitle(titles: ParsedTitle[]): ParsedTitle | null {
  if (titles.length === 0) return null;

  // 후보 세트 단위 기간 편중 감점 적용
  const adjusted = penalizePeriodOveruse(titles);

  // 점수 기준 정렬
  const sorted = [...adjusted].sort((a, b) => b.score - a.score);
  
  console.log('[TitleSelector] 제목 점수화 결과:');
  sorted.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.score}점] ${t.text}`);
    console.log(`     이유: ${t.reasons.join(', ')}`);
  });
  
  return sorted[0];
}

/**
 * {{SELECTED_TITLE}} 토큰 치환
 */
export function replaceSelectedTitleToken(body: string, selectedTitle: string): string {
  // {{SELECTED_TITLE}} 토큰 치환
  let result = body.replace(/\{\{SELECTED_TITLE\}\}/g, selectedTitle);
  
  // 혹시 다른 형태의 토큰이 있을 경우 대비
  result = result.replace(/\{\{ *SELECTED_TITLE *\}\}/g, selectedTitle);
  
  return result;
}

/**
 * 전체 프로세스 실행
 * 
 * 1. AI 출력에서 제목 파싱
 * 2. 점수화
 * 3. 최적 제목 선택
 * 4. {{SELECTED_TITLE}} 치환
 */
export function processAutoPublishContent(aiOutput: string): TitleSelectionResult {
  try {
    // 1. 제목 파싱
    const titles = parseTitles(aiOutput);
    
    if (titles.length === 0) {
      return {
        success: false,
        titles: [],
        selectedTitle: null,
        processedBody: aiOutput,
        error: '제목을 파싱할 수 없습니다. [TITLE_1], [TITLE_2], [TITLE_3] 형식을 확인하세요.'
      };
    }
    
    // 2. 점수화
    const scoredTitles = scoreTitles(titles);
    
    // 3. 최적 제목 선택
    const selectedTitle = selectBestTitle(scoredTitles);
    
    if (!selectedTitle) {
      return {
        success: false,
        titles: scoredTitles,
        selectedTitle: null,
        processedBody: aiOutput,
        error: '최적 제목을 선택할 수 없습니다.'
      };
    }
    
    // 4. 본문에서 제목 부분 제거 (제목은 별도로 처리)
    let body = aiOutput;
    
    // 제목 블록 제거 (제목 3개가 연속으로 나오는 부분)
    const titleBlockPattern = /\[TITLE_1\][^\[]*\[TITLE_2\][^\[]*\[TITLE_3\][^\n]*/gs;
    body = body.replace(titleBlockPattern, '');
    
    // 개별 제목 라인 제거
    body = body.replace(/\[TITLE_\d+\]\s*[^\n]+\n?/g, '');
    
    // 5. {{SELECTED_TITLE}} 치환
    const processedBody = replaceSelectedTitleToken(body, selectedTitle.text);
    
    console.log(`[TitleSelector] 선택된 제목: "${selectedTitle.text}" (${selectedTitle.score}점)`);
    
    return {
      success: true,
      titles: scoredTitles,
      selectedTitle,
      processedBody: processedBody.trim()
    };
    
  } catch (error) {
    const err = error as Error;
    console.error('[TitleSelector] 처리 오류:', err);
    return {
      success: false,
      titles: [],
      selectedTitle: null,
      processedBody: aiOutput,
      error: err.message
    };
  }
}

/**
 * 특정 제목 ID로 강제 선택 (테스트/수동 선택용)
 */
export function selectTitleById(aiOutput: string, titleId: number): TitleSelectionResult {
  const titles = parseTitles(aiOutput);
  const scoredTitles = scoreTitles(titles);
  
  const selected = scoredTitles.find(t => t.id === titleId);
  
  if (!selected) {
    return {
      success: false,
      titles: scoredTitles,
      selectedTitle: null,
      processedBody: aiOutput,
      error: `제목 ID ${titleId}를 찾을 수 없습니다.`
    };
  }
  
  let body = aiOutput;
  body = body.replace(/\[TITLE_\d+\]\s*[^\n]+\n?/g, '');
  const processedBody = replaceSelectedTitleToken(body, selected.text);
  
  return {
    success: true,
    titles: scoredTitles,
    selectedTitle: selected,
    processedBody: processedBody.trim()
  };
}
