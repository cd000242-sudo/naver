/**
 * Intent Matcher - MasterAgent 의도 분류 모듈
 * 정규식/패턴 매칭을 중앙 집중화하여 관리
 */

// ===== Intent 타입 정의 =====
export type Intent =
    | 'SECURITY_RISK'    // 보안 위협 (해킹, 크래킹 등)
    | 'PROMPT_LEAK'      // 프롬프트/지침 노출 시도
    | 'GREETING'         // 인사
    | 'CONTACT'          // 문의/결제 관련
    | 'PAYMENT'          // 결제 관련
    | 'TREND'            // 실시간 트렌드/이슈
    | 'DIAGNOSTIC'       // 시스템 진단
    | 'KEYWORD'          // 키워드 검색
    | 'RANDOM_TIP'       // 랜덤 팁 요청
    | 'DIRECT_ACTION'    // 바로가기 (영상, 풀오토, 설정 등)
    | 'GENERAL';         // 일반 질문 → Gemini 처리

// ===== Intent별 패턴 정의 =====
export const IntentPatterns: Record<Exclude<Intent, 'GENERAL' | 'DIRECT_ACTION'>, string[]> = {
    SECURITY_RISK: [
        '해킹', '크랙', '크래킹', '취약점', '침투', '우회', '바이패스', '익스플로잇',
        'exploit', 'bypass', 'phishing', '피싱', 'malware', '멀웨어', '랜섬', 'ransom',
        'keylogger', '키로거', 'ddos', 'sql injection', 'xss', 'csrf'
    ],

    PROMPT_LEAK: [
        '프롬프트', 'prompt', '지침', '시스템', 'system', '명령어', 'instruction',
        '규칙', 'rule', '내부', '비밀', '숨겨진', 'hidden', 'secret',
        '어떻게 작동', '어떻게 동작', '코드', 'code', '소스', 'source',
        '알고리즘', 'algorithm', '로직', 'logic', '원리', '구조'
    ],

    GREETING: ['안녕', '하이', 'hi', 'hello', '반가워', '처음'],

    CONTACT: ['문의', '연락', '상담', '카톡', '카카오톡', '오픈채팅', '채팅방', '톡방'],

    PAYMENT: ['결제', '구매', '환불', '라이선스', '유료', '프리미엄', '가격', '할인', '쿠폰'],

    TREND: [
        '실시간', '급상승', '핫이슈', '핫 이슈', '지금 뜨는', '요즘 뜨는',
        '트렌드 키워드', '이슈 키워드', '연예 이슈', '연예 뉴스',
        '블루오션', '검색량', '문서량', '트래픽', '뭐가 뜨', '뭐 뜨',
        '실검', '급등', '인기 검색', '핫한', '지금 핫', '요즘 핫'
    ],

    DIAGNOSTIC: [
        '문제점', '점검', '진단', '오류', '에러', '안됨', '안돼', '안 돼', '안 됨',
        '고장', '작동 안', '동작 안', '체크', 'check', '검사', '확인해',
        '왜 안', '왜안', '문제 있', '이상', '버그', 'bug', '수정', 'fix',
        '해결', '고쳐', '뭐가 잘못', '뭐가 문제', '상태 확인', '시스템 점검',
        '전체 점검', '자동 수정', '자동수정', '셀프 진단', '자가 진단'
    ],

    KEYWORD: [
        '키워드', '검색어', '인기', '주제 추천', '글감', '소재', '뭐가 좋', '어떤 키워드'
    ],

    RANDOM_TIP: ['꿀팁', '팁 알려', '팁 줘', '좋은 팁', '팁 하나']
};

// Prompt Leak 검증용 요청 패턴 (요청 의도 확인)
const PromptLeakRequestPatterns = [
    '보여', '알려', '말해', '공개', '노출', 'show', 'tell', 'reveal', 'expose',
    '뭐야', '뭐니', '뭔가', '어떻게', '무엇', 'what', 'how'
];

// ===== Direct Action 패턴 (바로가기) =====
export interface DirectAction {
    action: string;
    response: string;
    label: string;
}

const DirectActionPatterns: Array<{
    patterns: string[];
    contextPatterns: string[];
    action: DirectAction;
}> = [
        {
            patterns: ['영상', '동영상', '비디오', '튜토리얼'],
            contextPatterns: ['보여', '봐', '틀어', '재생', '보기', '어디'],
            action: { action: 'playTutorialVideo', response: '🎬 사용법 영상을 열어드릴게요!', label: '🎬 영상 보기' }
        },
        {
            patterns: ['풀오토', '다중계정', '다계정', '여러 계정'],
            contextPatterns: ['열어', '보여', '실행', '하고', '시작', '어디', '어떻게'],
            action: { action: 'openMultiAccountModal', response: '⚡ 풀오토 다중계정 창을 열어드릴게요!', label: '⚡ 풀오토 열기' }
        },
        {
            patterns: ['환경설정', '설정', 'api', '키 설정'],
            contextPatterns: ['열어', '보여', '가', '어디', '변경'],
            action: { action: 'openSettings', response: '⚙️ 환경설정을 열어드릴게요!', label: '⚙️ 환경설정' }
        },
        {
            patterns: ['가이드', '도구', '분석'],
            contextPatterns: ['열어', '보여', '어디'],
            action: { action: 'openToolsHub', response: '📚 가이드 & 분석도구를 열어드릴게요!', label: '📚 가이드 열기' }
        },
        {
            patterns: ['leword', '리워드'],
            contextPatterns: [],  // 키워드만으로 충분
            action: { action: 'openLeword', response: '🔍 LEWORD를 열어드릴게요!', label: '🔍 LEWORD' }
        },
        {
            patterns: ['글', '포스팅', '발행'],
            contextPatterns: ['생성', '쓰', '만들', '작성', '시작'],
            action: { action: 'startGeneration', response: '📝 글 생성 화면으로 이동할게요!', label: '📝 글 생성하기' }
        },
        {
            patterns: ['이미지', '사진'],
            contextPatterns: ['관리', '탭'],
            action: { action: 'openImagesTab', response: '🖼️ 이미지 관리 탭을 열어드릴게요!', label: '🖼️ 이미지 관리' }
        },
        {
            patterns: ['썸네일'],
            contextPatterns: ['생성', '만들', '열어', '어디'],
            action: { action: 'generateImage', response: '🎨 썸네일 생성기를 열어드릴게요!', label: '🎨 썸네일 생성기' }
        },
        {
            patterns: ['예약'],
            contextPatterns: ['발행', '열어', '어디', '어떻게'],
            action: { action: 'openScheduleTab', response: '📅 예약 발행 탭을 열어드릴게요!', label: '📅 예약 발행' }
        },
        {
            patterns: ['분석도구', '분석 도구'],
            contextPatterns: [],
            action: { action: 'openAnalyticsTools', response: '📊 분석도구 모음을 열어드릴게요!', label: '📊 분석도구' }
        },
        {
            patterns: ['외부유입', '커뮤니티'],
            contextPatterns: [],
            action: { action: 'openExternalTools', response: '🔗 외부유입 도구를 열어드릴게요!', label: '🔗 외부유입' }
        }
    ];

// ===== 메인 매칭 함수 =====

/**
 * 메시지의 의도 분류
 */
export function matchIntent(message: string): Intent {
    const lower = message.toLowerCase().trim();
    if (!lower) return 'GENERAL';

    // 1. 보안 위험 (최우선)
    if (IntentPatterns.SECURITY_RISK.some(p => lower.includes(p))) {
        return 'SECURITY_RISK';
    }

    // 2. 프롬프트 노출 시도 (패턴 + 요청 의도 모두 필요)
    const hasLeakPattern = IntentPatterns.PROMPT_LEAK.some(p => lower.includes(p));
    const hasRequestPattern = PromptLeakRequestPatterns.some(p => lower.includes(p));
    if (hasLeakPattern && hasRequestPattern) {
        return 'PROMPT_LEAK';
    }

    // 3. 인사 (짧은 메시지만)
    if (message.length < 20 && IntentPatterns.GREETING.some(p => lower.includes(p))) {
        return 'GREETING';
    }

    // 4. 문의/결제
    if (IntentPatterns.CONTACT.some(p => lower.includes(p))) {
        return 'CONTACT';
    }
    if (IntentPatterns.PAYMENT.some(p => lower.includes(p))) {
        return 'PAYMENT';
    }

    // 5. 트렌드
    if (IntentPatterns.TREND.some(p => lower.includes(p))) {
        return 'TREND';
    }

    // 6. 진단
    if (IntentPatterns.DIAGNOSTIC.some(p => lower.includes(p))) {
        return 'DIAGNOSTIC';
    }

    // 7. 키워드 (+ 요청 의도 필요)
    const hasKeywordPattern = IntentPatterns.KEYWORD.some(p => lower.includes(p));
    const hasKeywordRequest = ['찾', '추천', '알려', '뭐', '어떤', '좋은'].some(p => lower.includes(p));
    if (hasKeywordPattern && hasKeywordRequest) {
        return 'KEYWORD';
    }

    // 8. 랜덤 팁
    if (IntentPatterns.RANDOM_TIP.some(p => lower.includes(p))) {
        return 'RANDOM_TIP';
    }

    // 9. Direct Action 체크
    if (matchDirectAction(message)) {
        return 'DIRECT_ACTION';
    }

    // 10. 일반 → Gemini 처리
    return 'GENERAL';
}

/**
 * Direct Action 매칭 (바로가기)
 */
export function matchDirectAction(message: string): DirectAction | null {
    const lower = message.toLowerCase();

    for (const pattern of DirectActionPatterns) {
        const hasMainPattern = pattern.patterns.some(p => lower.includes(p));
        if (!hasMainPattern) continue;

        // contextPatterns가 비어있으면 메인 패턴만으로 충분
        if (pattern.contextPatterns.length === 0) {
            return pattern.action;
        }

        // contextPatterns가 있으면 하나 이상 매칭 필요
        const hasContext = pattern.contextPatterns.some(p => lower.includes(p));
        if (hasContext) {
            return pattern.action;
        }
    }

    return null;
}

/**
 * 앱 스코프 메시지인지 확인
 */
export function isAppScopeMessage(message: string): boolean {
    const lower = String(message || '').toLowerCase();
    const appKeywords = [
        '네이버', '블로그', '발행', '예약', '연속', '풀오토', '다중계정', '계정',
        '이미지', '썸네일', '키워드', '크롤링', '환경설정', 'api 키', 'gemini',
        '제미나이', '리더남', 'leadernam', 'leword'
    ];
    return appKeywords.some(k => lower.includes(k));
}
