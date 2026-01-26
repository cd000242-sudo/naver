/**
 * 완전자동 발행용 제목 선택기 (Advanced)
 * * 1. AI 출력에서 제목 섹션과 본문 섹션을 스마트하게 분리
 * 2. 가중치 설정 기반 정밀 점수화
 * 3. 어뷰징(단어 반복) 필터링
 * 4. 안전한 토큰 치환
 */

// ==================== 타입 & 설정 정의 ====================

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
    processedBody: string; // 제목 섹션이 제거되고 토큰이 치환된 최종 본문
    error?: string;
}

// 점수 산정 기준 설정 (여기서 가중치 조절 가능)
export const SCORE_CONFIG = {
    baseScore: 50,
    weights: {
        optimalLength: 15,   // 22~28자
        goodLength: 8,       // 18~32자
        badLength: -10,      // 너무 짧거나 김
        quote: 12,           // 따옴표 사용
        number: 10,          // 숫자 포함
        emotion: 10,         // 감정 단어
        relation: 8,         // 관계성 단어
        clickBait: 5,        // 클릭 유도
        questionMark: -5,    // 물음표 (감점)
        explanatory: -8,     // 설명형 (감점)
        repetition: -15,     // 단어 반복 (감점)
    },
    keywords: {
        emotion: ['충격', '눈물', '감동', '논란', '폭로', '고백', '반전', '결국', '드디어', '심경', '속마음', '진심', '후회', '분노', '환호', '실망', '기대', '걱정', '소름'],
        relation: ['남편', '아내', '부모', '자녀', '동료', '친구', '선후배', '팬', '멤버', '파트너', '여친', '남친', '가족'],
        clickBait: ['결국', '드디어', '알고보니', '사실은', '몰랐던', '헉', '경악'],
        explanatory: ['~란', '~이란', '~하는 방법', '~하는 이유', '정리', '총정리', '알아보', '특징'],
    }
};

// ==================== 핵심 로직 구현 ====================

/**
 * AI 출력에서 제목 섹션과 본문을 분리하고 제목 파싱
 * (본문 오삭제 방지를 위해 위치 기반 파싱 적용)
 */
function parseAndSplit(content: string): { titles: ParsedTitle[], bodyStartIndex: number } {
    const titles: ParsedTitle[] = [];
    const lines = content.split('\n');
    let lastTitleIndex = -1;

    // 라인별로 확인하며 제목 패턴 찾기 (문서 앞부분에서만 탐색)
    for (let i = 0; i < Math.min(lines.length, 20); i++) { // 처음에 20줄까지만 제목 탐색 (안전장치)
        const line = lines[i].trim();

        // 패턴: [TITLE_1] 제목... 또는 1. [TITLE_1] 제목...
        const match = line.match(/(?:^|\s)\[TITLE_(\d+)\]\s*(.+)$/);

        if (match) {
            const id = parseInt(match[1], 10);
            const text = match[2].trim();

            if (text && id >= 1 && id <= 5) { // 최대 5개까지 허용
                titles.push({
                    id,
                    text,
                    score: 0,
                    reasons: []
                });
                lastTitleIndex = i;
            }
        }
    }

    // 제목이 끝난 다음 라인부터 본문으로 간주
    // (만약 제목을 못 찾았으면 처음부터 본문)
    const bodyStartIndex = lastTitleIndex === -1 ? 0 : lastTitleIndex + 1;

    return { titles, bodyStartIndex };
}

/**
 * 제목 점수화 로직 (설정 기반)
 */
export function scoreTitles(titles: ParsedTitle[]): ParsedTitle[] {
    return titles.map(title => {
        let score = SCORE_CONFIG.baseScore;
        const reasons: string[] = [];
        const text = title.text;
        const len = text.length;

        // 1. 글자 수 평가
        if (len >= 22 && len <= 28) {
            score += SCORE_CONFIG.weights.optimalLength;
            reasons.push('최적 길이(22-28자)');
        } else if (len >= 18 && len <= 32) {
            score += SCORE_CONFIG.weights.goodLength;
            reasons.push('적정 길이');
        } else if (len < 15 || len > 40) {
            score += SCORE_CONFIG.weights.badLength;
            reasons.push('길이 부적합');
        }

        // 2. 특수문자 및 키워드 평가
        if (/"[^"]+"|'[^']+'|"[^"]+"|「[^」]+」/.test(text)) {
            score += SCORE_CONFIG.weights.quote;
            reasons.push('인용구 사용');
        }

        if (/\d+[년월일주시분초]|\d+살|\d+세|\d+억|\d+만|\d+명/.test(text)) {
            score += SCORE_CONFIG.weights.number;
            reasons.push('구체적 숫자');
        }

        if (SCORE_CONFIG.keywords.emotion.some(w => text.includes(w))) {
            score += SCORE_CONFIG.weights.emotion;
            reasons.push('감정 키워드');
        }

        if (SCORE_CONFIG.keywords.relation.some(w => text.includes(w))) {
            score += SCORE_CONFIG.weights.relation;
            reasons.push('관계성 키워드');
        }

        if (text.includes('?')) {
            // 물음표가 있지만 클릭 유도 단어가 같이 있으면 감점 완화
            if (!SCORE_CONFIG.keywords.clickBait.some(w => text.includes(w))) {
                score += SCORE_CONFIG.weights.questionMark;
                reasons.push('물음표(비추천)');
            }
        }

        if (SCORE_CONFIG.keywords.explanatory.some(w => text.includes(w))) {
            score += SCORE_CONFIG.weights.explanatory;
            reasons.push('설명형(비추천)');
        }

        // 3. 어뷰징 방지 (단어 반복 검사)
        const words = text.split(' ');
        const uniqueWords = new Set(words);
        if (words.length - uniqueWords.size >= 2) { // 같은 단어가 2회 이상 중복
            score += SCORE_CONFIG.weights.repetition;
            reasons.push('단어 과다 반복(감점)');
        }

        return {
            ...title,
            score: Math.max(0, Math.min(100, score)), // 0~100점 제한
            reasons
        };
    });
}

/**
 * {{SELECTED_TITLE}} 토큰 치환
 */
function replaceToken(body: string, title: string): string {
    // 다양한 변형 패턴 모두 처리
    return body
        .replace(/\{\{SELECTED_TITLE\}\}/g, title)
        .replace(/\{\{ *TITLE *\}\}/g, title)
        .replace(/\[SELECTED_TITLE\]/g, title);
}

// ==================== 메인 함수 ====================

/**
 * 전체 프로세스 실행
 * * 1. AI 출력에서 제목 파싱 (위치 기반 안전 분리)
 * 2. 점수화 및 최적 제목 선정
 * 3. 본문 추출 (제목 영역 제거)
 * 4. 토큰 치환
 */
export function processAutoPublishContent(aiOutput: string): TitleSelectionResult {
    try {
        // 1. 파싱 및 분리
        const { titles, bodyStartIndex } = parseAndSplit(aiOutput);
        const lines = aiOutput.split('\n');

        // 제목이 없으면 원본 그대로 반환 (에러 처리)
        if (titles.length === 0) {
            return {
                success: false,
                titles: [],
                selectedTitle: null,
                processedBody: aiOutput,
                error: 'AI 출력에서 [TITLE_n] 형식을 찾을 수 없습니다.'
            };
        }

        // 2. 점수화
        const scoredTitles = scoreTitles(titles);

        // 3. 최적 제목 선택 (점수 내림차순)
        const sortedTitles = [...scoredTitles].sort((a, b) => b.score - a.score);
        const selectedTitle = sortedTitles[0];

        // 로그 출력
        console.log('[TitleSelector] 제목 평가 결과:');
        sortedTitles.slice(0, 3).forEach((t, i) => {
            console.log(`  ${i + 1}. [${t.score}점] ${t.text} (${t.reasons.join(', ')})`);
        });

        // 4. 본문 재조립 (제목 라인 이후부터 합침)
        // slice를 사용하여 제목 영역을 물리적으로 제거하므로 본문 오삭제 위험 0%
        let cleanBody = lines.slice(bodyStartIndex).join('\n').trim();

        // 5. 토큰 치환
        if (selectedTitle) {
            cleanBody = replaceToken(cleanBody, selectedTitle.text);
        }

        return {
            success: true,
            titles: scoredTitles,
            selectedTitle,
            processedBody: cleanBody
        };

    } catch (error) {
        const err = error as Error;
        console.error('[TitleSelector] 치명적 오류:', err.message);
        return {
            success: false,
            titles: [],
            selectedTitle: null,
            processedBody: aiOutput, // 에러 시 원본 보존
            error: err.message
        };
    }
}

/**
 * (테스트용) 특정 ID 제목 강제 선택
 */
export function selectTitleById(aiOutput: string, titleId: number): TitleSelectionResult {
    const { titles, bodyStartIndex } = parseAndSplit(aiOutput);
    const scoredTitles = scoreTitles(titles);
    const selected = scoredTitles.find(t => t.id === titleId);
    const lines = aiOutput.split('\n');

    if (!selected) {
        return {
            success: false,
            titles: scoredTitles,
            selectedTitle: null,
            processedBody: aiOutput,
            error: `ID ${titleId}번 제목을 찾을 수 없습니다.`
        };
    }

    let cleanBody = lines.slice(bodyStartIndex).join('\n').trim();
    cleanBody = replaceToken(cleanBody, selected.text);

    return {
        success: true,
        titles: scoredTitles,
        selectedTitle: selected,
        processedBody: cleanBody
    };
}
