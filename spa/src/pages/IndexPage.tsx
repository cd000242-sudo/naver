import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';

type HeroProof = {
    src: string;
    alt?: string;
    title?: string;
    desc?: string;
    metric?: string;
};

type LiveGoldenPreview = {
    id?: string;
    rank?: number;
    keyword?: string;
    grade?: string;
    publicSearchVolumeLabel?: string;
    publicDocumentCountLabel?: string;
    publicReason?: string;
    updatedAt?: string;
};

type SourceSignal = {
    id?: string;
    keyword?: string;
    title?: string;
    description?: string;
    priority?: number;
    source?: string;
    categoryId?: string;
    createdAt?: string;
};

type SourceLaneId = 'naver' | 'daum' | 'nate' | 'zum' | 'policy' | 'issue';

type SourceLaneConfig = {
    id: SourceLaneId;
    label: string;
    accent: string;
    description: string;
};

type SourceLane = SourceLaneConfig & {
    items: SourceSignal[];
};

type KeywordStrategyIdea = {
    label: string;
    tag: string;
    reason: string;
    title: string;
    score: number;
};

type KeywordStrategyGroup = {
    label: string;
    desc: string;
    items: KeywordStrategyIdea[];
};

type TopicProfile = {
    keyword: string;
    core: string;
    laneId: SourceLaneId;
    laneLabel: string;
    category: 'policy' | 'issue' | 'money' | 'entertainment' | 'sports' | 'incident' | 'commerce' | 'public' | 'general';
    audience: string;
    searchIntent: string;
    tension: string;
    proofNeed: string;
    answerFrame: string;
    hookAngle: string;
    bridgeAngle: string;
    entities: string[];
    numbers: string[];
};

type HomeLiveStatus = 'loading' | 'ready' | 'error';

type HomeLiveState = {
    status: HomeLiveStatus;
    golden: LiveGoldenPreview[];
    lanes: SourceLane[];
    updatedAt?: string;
    boardCount: number;
    boardTarget: number;
    lockedCount: number;
    running: boolean;
    fallbackUsed: boolean;
};

const LEWORD_API_BASE = 'https://141.164.59.17.sslip.io';
const HOME_LIVE_TIMEOUT_MS = 8000;
const HOME_LIVE_CACHE_KEY = 'leaderspro.home.sourceSignals.v1';

const SOURCE_LANE_CONFIGS: SourceLaneConfig[] = [
    { id: 'naver', label: '네이버', accent: '#2ed36f', description: '실시간 검색과 블로그 수요' },
    { id: 'daum', label: '다음', accent: '#4d93ff', description: '생활/뉴스 검색 신호' },
    { id: 'nate', label: '네이트', accent: '#ff6b6b', description: '이슈와 방송 검색 흐름' },
    { id: 'zum', label: '줌', accent: '#f4c95d', description: '포털 이슈 보조 신호' },
    { id: 'policy', label: '정책', accent: '#44d7b6', description: '지원금과 공공 알림' },
    { id: 'issue', label: '이슈', accent: '#c084fc', description: '방송/연예/스포츠 흐름' },
];

const HOME_LIVE_FALLBACK_GOLDEN: LiveGoldenPreview[] = [
    { id: 'fallback-golden-1', rank: 1, keyword: '소상공인 지원금 신청', grade: 'SS', publicSearchVolumeLabel: '수요 검증 중', publicDocumentCountLabel: '경쟁도 잠금', publicReason: '정책 수요와 검색 전환 가능성이 함께 있는 키워드입니다.' },
    { id: 'fallback-golden-2', rank: 2, keyword: '장마 대비 준비물', grade: 'S', publicSearchVolumeLabel: '시즌 상승', publicDocumentCountLabel: '문서수 확인 중', publicReason: '계절 이슈와 구매 의도가 동시에 붙는 롱테일 키워드입니다.' },
    { id: 'fallback-golden-3', rank: 3, keyword: '오늘 방송 출연진', grade: 'S', publicSearchVolumeLabel: '실시간 반응', publicDocumentCountLabel: '경쟁도 확인 중', publicReason: '방송 직후 빠르게 검색량이 붙는 이슈형 키워드입니다.' },
];

const HOME_SOURCE_FALLBACK_KEYWORDS: Record<SourceLaneId, string[]> = {
    naver: ['소상공인 지원금 신청', '장마 대비 준비물', '여름 전기요금 절약', '청년 월세 지원 조건', '오늘 방송 출연진', '냉방병 증상', '근로장려금 지급일', '서울 무료 전시', '주말 갈만한곳', '아이폰 배터리 교체'],
    daum: ['경제 뉴스 정리', '폭염주의보 지역', '대출 금리 비교', '교통 통제 구간', '야구 경기 일정', '공모주 청약 일정', '환율 전망', '아파트 실거래가', '태풍 경로', '건강검진 대상자'],
    nate: ['드라마 출연진', '예능 방송 시간', '배우 근황', '공식입장 정리', '스포츠 인터뷰', '연예 뉴스 반응', '축구 대표팀 명단', '영화 결말 해석', '콘서트 예매 일정', '프로필 나이'],
    zum: ['근처 맛집 추천', '제주 숙소 가격', '항공권 특가', '가전 할인', '병원 예약 방법', '여행 준비물', '주차장 위치', '공연 티켓 예매', '보험료 비교', '이사 비용'],
    policy: ['근로장려금 지급일', '청년 월세 지원 조건', '소상공인 정책자금 신청', '에너지바우처 신청 대상', '문화누리카드 사용처', '기초연금 수급자격', '주거급여 신청 조건', '국민내일배움카드 신청', '출산지원금 지역별 조회', '보조금24 숨은 지원금'],
    issue: ['드라마 결말 해석', '출연진 공식입장', '대표팀 경기 결과', '방송 장면 논란', '연예인 근황 반응', '사건 타임라인 정리', '콘서트 예매 일정', '영화 쿠키영상 여부', '스포츠 하이라이트', '후속 방송 일정'],
};

function cleanLiveText(value: unknown, fallback: string): string {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const questionMarks = (text.match(/\?/g) || []).length;
    const looksBroken = /[�]|占|揶|醫|怨|筌|嚥|媛|덈떎|섏|ㅼ/.test(text) || questionMarks >= Math.max(3, Math.ceil(text.length / 5));
    return looksBroken ? fallback : text;
}

function buildFallbackSourceItems(lane: SourceLaneConfig): SourceSignal[] {
    return HOME_SOURCE_FALLBACK_KEYWORDS[lane.id].map((keyword, index) => ({
        id: `fallback-${lane.id}-${index + 1}`,
        keyword,
        title: keyword,
        description: lane.id === 'policy'
            ? '정책 수집 연결 대기 중에도 검색 의도가 분명한 신청·대상형 후보입니다.'
            : lane.id === 'issue'
                ? '이슈 수집 연결 대기 중에도 글 구조가 분명한 타임라인·반응형 후보입니다.'
                : `${lane.label} 연결 대기 중 표시되는 저경쟁 후보입니다.`,
        priority: 100 - index,
        source: lane.id,
    }));
}

function fillMissingSourceLaneItems(lanes: SourceLane[]): SourceLane[] {
    return lanes.map((lane) => (
        lane.items.length > 0
            ? lane
            : { ...lane, items: buildFallbackSourceItems(lane) }
    ));
}

function readCachedSourceLanes(): { lanes: SourceLane[]; updatedAt?: string } | null {
    try {
        const raw = window.localStorage.getItem(HOME_LIVE_CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw) as { lanes?: Array<Partial<SourceLane> & { id?: string }>; updatedAt?: string };
        const lanes = normalizeSourceLanes(cached);
        if (!lanes.some((lane) => lane.items.length > 0)) return null;
        return { lanes: fillMissingSourceLaneItems(lanes), updatedAt: cached.updatedAt };
    } catch {
        return null;
    }
}

function writeCachedSourceLanes(payload: { lanes?: Array<Partial<SourceLane> & { id?: string }>; updatedAt?: string }): void {
    try {
        window.localStorage.setItem(HOME_LIVE_CACHE_KEY, JSON.stringify({
            updatedAt: payload.updatedAt,
            lanes: normalizeSourceLanes(payload),
        }));
    } catch {
        // 캐시는 실패해도 홈 로딩을 막지 않습니다.
    }
}

function buildFallbackHomeLiveState(status: HomeLiveStatus = 'loading'): HomeLiveState {
    const cached = readCachedSourceLanes();
    const lanes = cached?.lanes || SOURCE_LANE_CONFIGS.map((lane) => ({
        ...lane,
        items: buildFallbackSourceItems(lane),
    }));
    return {
        status,
        golden: HOME_LIVE_FALLBACK_GOLDEN,
        lanes,
        updatedAt: cached?.updatedAt,
        boardCount: lanes.reduce((total, lane) => total + lane.items.length, 0),
        boardTarget: 120,
        lockedCount: 0,
        running: false,
        fallbackUsed: true,
    };
}

async function fetchHomeJson<T>(apiPath: string): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HOME_LIVE_TIMEOUT_MS);
    try {
        const response = await fetch(LEWORD_API_BASE + apiPath, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('LEWORD API ' + response.status);
        return await response.json() as T;
    } finally {
        window.clearTimeout(timer);
    }
}

function normalizeSourceLanes(payload: { lanes?: Array<Partial<SourceLane> & { id?: string }>; fallbackUsed?: boolean } | null): SourceLane[] {
    const lanes = Array.isArray(payload?.lanes) ? payload.lanes : [];
    return SOURCE_LANE_CONFIGS.map((config) => {
        const incoming = lanes.find((lane) => lane.id === config.id);
        const items = Array.isArray(incoming?.items) ? incoming.items : [];
        return {
            ...config,
            items: items.slice(0, 10),
        };
    });
}

async function loadHomeLiveState(): Promise<HomeLiveState> {
    const fallback = buildFallbackHomeLiveState('error');
    const sourcePayload = await fetchHomeJson<{ updatedAt?: string; fallbackUsed?: boolean; lanes?: Array<Partial<SourceLane> & { id?: string }> }>('/v1/public/source-signals?limit=60');
    const lanes = fillMissingSourceLaneItems(normalizeSourceLanes(sourcePayload));
    const hasLiveData = lanes.some((lane) => lane.items.length > 0);
    if (!hasLiveData) return fallback;
    writeCachedSourceLanes(sourcePayload);

    return {
        status: 'ready',
        golden: fallback.golden,
        lanes,
        updatedAt: sourcePayload?.updatedAt,
        boardCount: lanes.reduce((total, lane) => total + lane.items.length, 0),
        boardTarget: 120,
        lockedCount: 0,
        running: false,
        fallbackUsed: Boolean(sourcePayload?.fallbackUsed || !sourcePayload),
    };
}



const SOURCE_SEARCH_PATHS: Record<SourceLaneId, (keyword: string) => string> = {
    naver: (keyword) => `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`,
    daum: (keyword) => `https://search.daum.net/search?w=tot&q=${encodeURIComponent(keyword)}`,
    nate: (keyword) => `https://search.nate.com/search/all.html?q=${encodeURIComponent(keyword)}`,
    zum: (keyword) => `https://search.zum.com/search.zum?query=${encodeURIComponent(keyword)}`,
    policy: (keyword) => `https://www.korea.kr/search?srchKeyword=${encodeURIComponent(keyword)}`,
    issue: (keyword) => `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}`,
};

function buildSourceSearchUrl(laneId: SourceLaneId, keyword: string): string {
    const trimmed = keyword.trim();
    return SOURCE_SEARCH_PATHS[laneId](trimmed || 'LEWORD');
}

function uniqueList(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function keywordTokens(keyword: string): string[] {
    return uniqueList(keyword
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 2)
        .slice(0, 5));
}

function includesAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
}

function extractNumbers(text: string): string[] {
    return uniqueList((text.match(/[0-9]+(?:\.[0-9]+)?\s?(?:회|명|위|년|월|일|%|G|차|억|만)?/gi) || []).slice(0, 3));
}

function contextTokens(keyword: string, description: string): string[] {
    const stopwords = new Set(['네이버', '다음', '네이트', '실시간', '검색어', '포착', '상승', '중인', '바로', '정밀', '분석', '확인', '하세요', '키워드', '후보', '후보입니다', '뉴스', '이슈', '저경쟁', '표시되는', '연결', '대기', 'Pro', 'pro', '빅키워드는', '하위', '의도로', '쪼개서', '엔진에서', '검증합니다', '검색량과', '문서수를', '넘겨']);
    const extract = (value: string) => value
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 2 && !stopwords.has(token));
    return uniqueList([...extract(keyword), ...extract(description)])
        .slice(0, 8);
}

function inferTopicCategory(laneId: SourceLaneId, text: string): TopicProfile['category'] {
    if (laneId === 'policy') return 'policy';
    if (laneId === 'issue') return 'issue';
    if (includesAny(text, [/지원금|장려금|월세|급여|연금|정책|신청|대상|서류|지급|환급|세금|고용/])) return 'policy';
    if (includesAny(text, [/금리|환율|투자|주가|반도체|경제|공모주|아파트|부동산|대출|수익|실적|물가|가격/])) return 'money';
    if (includesAny(text, [/드라마|예능|방송|출연|OST|배우|결혼|열애|콘서트|프로필|영화|SNL|전참시|스타|연예/])) return 'entertainment';
    if (includesAny(text, [/홈런|경기|월드컵|축구|야구|대표팀|감독|선수|순위|결승|리그|로또/])) return 'sports';
    if (includesAny(text, [/화재|태풍|폭염|살인|사건|사고|통제|지진|피해|실종|부상|특보|위험/])) return 'incident';
    if (includesAny(text, [/맛집|숙소|항공권|할인|예약|병원|보험|비용|주차|공연|티켓|여행/])) return 'commerce';
    if (includesAny(text, [/장관|정부|회의|지역|공식|발표|공공|한중|정상/])) return 'public';
    return 'general';
}

function profileCopy(category: TopicProfile['category']): Pick<TopicProfile, 'audience' | 'searchIntent' | 'tension' | 'proofNeed' | 'answerFrame' | 'hookAngle' | 'bridgeAngle'> {
    const copies: Record<TopicProfile['category'], Pick<TopicProfile, 'audience' | 'searchIntent' | 'tension' | 'proofNeed' | 'answerFrame' | 'hookAngle' | 'bridgeAngle'>> = {
        policy: {
            audience: '내가 받을 수 있는지 불안한 신청자',
            searchIntent: '대상, 기한, 준비물, 놓치면 손해 보는 조건을 빠르게 확인',
            tension: '신청 대상과 제외 조건이 헷갈리는 지점',
            proofNeed: '공식 출처와 실제 신청 전 체크할 조건',
            answerFrame: '대상 여부를 먼저 판별하고 다음 행동을 제시',
            hookAngle: '놓치면 손해 보는 조건을 먼저 꺼내기',
            bridgeAngle: '대상자 판별표와 신청 순서',
        },
        issue: {
            audience: '왜 갑자기 떴는지 맥락이 궁금한 검색자',
            searchIntent: '무슨 일이 있었는지, 공식입장과 반응, 다음 일정까지 한 번에 확인',
            tension: '속보와 짧은 반응은 많지만 흐름이 한눈에 정리되지 않는 지점',
            proofNeed: '최초 포착 시점, 확인된 사실, 공식입장, 반응 변화',
            answerFrame: '왜 떴는지와 현재 확인된 사실을 먼저 분리',
            hookAngle: '논란보다 확인된 흐름과 반전 포인트를 먼저 보여주기',
            bridgeAngle: '타임라인, 공식입장, 반응, 후속 일정',
        },
        money: {
            audience: '내 돈과 지역 영향이 궁금한 검색자',
            searchIntent: '뉴스 제목보다 실제 영향, 수혜·피해 변수, 다음 확인 포인트를 파악',
            tension: '큰 뉴스와 내 생활 사이의 연결고리가 보이지 않는 지점',
            proofNeed: '수치, 지역, 기업, 정책 변수를 나눠 보는 근거',
            answerFrame: '왜 중요한지보다 나에게 어떤 영향인지 먼저 설명',
            hookAngle: '숫자 뒤에 숨은 실제 영향으로 시작하기',
            bridgeAngle: '지역 영향, 산업 영향, 개인 선택 기준',
        },
        entertainment: {
            audience: '방송을 놓쳤거나 맥락이 궁금한 시청자',
            searchIntent: '누가 왜 화제인지, 어떤 장면과 연결되는지, 다시 볼 이유를 확인',
            tension: '짧은 화제어만 보고는 맥락을 알기 어려운 지점',
            proofNeed: '방송 장면, 인물 관계, 공개된 발언을 분리한 정리',
            answerFrame: '인물보다 장면과 반응을 먼저 연결',
            hookAngle: '화제 장면의 숨은 맥락으로 클릭 유도',
            bridgeAngle: '인물, 장면, 반응, 다음 회차',
        },
        sports: {
            audience: '결과보다 의미와 다음 경우의 수가 궁금한 팬',
            searchIntent: '점수나 기록이 순위, 일정, 다음 변수에 어떤 영향을 주는지 확인',
            tension: '기록은 보이지만 다음 판도가 헷갈리는 지점',
            proofNeed: '기록, 순위, 일정, 경우의 수를 한 화면에서 비교',
            answerFrame: '결과보다 다음 변수와 영향부터 정리',
            hookAngle: '기록 뒤에 바뀐 판도를 앞세우기',
            bridgeAngle: '결과, 순위, 다음 일정, 경우의 수',
        },
        incident: {
            audience: '현재 상황과 내 주변 영향이 먼저 궁금한 검색자',
            searchIntent: '위치, 피해, 교통·안전 영향, 지금 해야 할 행동을 확인',
            tension: '속보는 많지만 현재 기준 정보가 흩어진 지점',
            proofNeed: '시간대별 상황, 위치, 공식 발표, 행동 요령',
            answerFrame: '현재 상황과 안전 확인 포인트를 먼저 제시',
            hookAngle: '지금 확인해야 할 위험 신호로 시작하기',
            bridgeAngle: '현재 상황, 위치, 피해, 대응',
        },
        commerce: {
            audience: '돈과 시간을 낭비하기 싫은 비교 검색자',
            searchIntent: '가격보다 실패하지 않는 선택 기준과 확인 순서를 찾음',
            tension: '광고성 정보가 많아 실제 판단 기준이 흐려지는 지점',
            proofNeed: '가격, 위치, 조건, 후기 신뢰도를 나눠 보는 기준',
            answerFrame: '추천보다 선택 기준과 피해야 할 조건을 먼저 제시',
            hookAngle: '실패 방지 기준으로 후킹',
            bridgeAngle: '가격, 위치, 조건, 대안 비교',
        },
        public: {
            audience: '정책·공공 이슈의 실제 의미가 궁금한 검색자',
            searchIntent: '발표 내용이 누구에게 어떤 영향을 주는지 확인',
            tension: '공식 발표와 실제 체감 사이의 간극',
            proofNeed: '발표 주체, 대상, 일정, 후속 변수를 분리한 근거',
            answerFrame: '발표 요약보다 영향 받는 사람을 먼저 설명',
            hookAngle: '공식 발표 뒤 달라지는 점으로 시작하기',
            bridgeAngle: '대상, 영향, 일정, 후속 조치',
        },
        general: {
            audience: '짧은 화제어의 맥락을 빠르게 알고 싶은 검색자',
            searchIntent: '왜 뜨는지, 지금 무엇을 보면 되는지 확인',
            tension: '검색량은 붙었지만 정리된 답이 부족한 지점',
            proofNeed: '원인, 핵심 사실, 다음 확인 포인트',
            answerFrame: '핵심 사실과 검색자가 취할 다음 행동을 먼저 제시',
            hookAngle: '사람들이 놓치는 첫 질문으로 시작하기',
            bridgeAngle: '원인, 핵심, 다음 검색어',
        },
    };
    return copies[category];
}

function inferTopicProfile(lane: SourceLane, item: SourceSignal): TopicProfile {
    const keyword = cleanLiveText(item.keyword || item.title, lane.label);
    const description = cleanLiveText(item.description || item.title, lane.description);
    const text = `${keyword} ${description}`;
    const entities = contextTokens(keyword, description);
    const numbers = extractNumbers(keyword);
    const category = inferTopicCategory(lane.id, text);
    const copy = profileCopy(category);
    const core = entities.slice(0, Math.min(3, Math.max(1, entities.length))).join(' ') || keyword;
    return {
        keyword,
        core,
        laneId: lane.id,
        laneLabel: lane.label,
        category,
        entities,
        numbers,
        ...copy,
    };
}

function scoreStrategyIdea(label: string, profile: TopicProfile, rankBias = 0): number {
    const tokens = keywordTokens(label);
    const hasCore = label.includes(profile.core.split(' ')[0] || profile.core);
    const hasHook = /(놓치|진짜|갑자기|헷갈|먼저|숨은|피해야|바뀐|왜|전|후|실제|갈리는)/.test(label);
    const hasAnswer = label.includes('확인') || label.includes('정리') || label.includes('판별') || label.includes('기준') || label.includes('답');
    const lengthScore = label.length >= 24 && label.length <= 58 ? 24 : label.length >= 16 ? 16 : 8;
    const specificityScore = Math.min(26, tokens.length * 5 + (profile.numbers.length ? 4 : 0));
    const hookScore = hasHook ? 18 : 8;
    const answerScore = hasAnswer ? 16 : 8;
    const coreScore = hasCore ? 9 : 4;
    const naturalPenalty = label.length > 72 ? 8 : 0;
    return Math.min(99, Math.max(62, 39 + lengthScore + specificityScore + hookScore + answerScore + coreScore + rankBias - naturalPenalty));
}

function makeStrategyIdea(label: string, tag: string, reason: string, title: string, profile: TopicProfile, rankBias = 0): KeywordStrategyIdea {
    return {
        label,
        tag,
        reason,
        title,
        score: scoreStrategyIdea(label, profile, rankBias),
    };
}

function compactAudience(profile: TopicProfile): string {
    const audiences: Record<TopicProfile['category'], string> = {
        policy: '신청 대상자',
        issue: '맥락이 궁금한 검색자',
        money: '투자·지역 영향이 궁금한 사람',
        entertainment: '방송 맥락이 궁금한 사람',
        sports: '다음 판도가 궁금한 팬',
        incident: '현재 상황이 급한 사람',
        commerce: '실패 없이 고르고 싶은 사람',
        public: '실제 영향이 궁금한 사람',
        general: '지금 검색한 사람',
    };
    return audiences[profile.category];
}

function audienceSubject(profile: TopicProfile): string {
    const subjects: Record<TopicProfile['category'], string> = {
        policy: '신청 대상자는',
        issue: '맥락이 궁금한 검색자는',
        money: '투자·지역 영향이 궁금한 사람은',
        entertainment: '방송 맥락이 궁금한 사람은',
        sports: '다음 판도가 궁금한 팬은',
        incident: '현재 상황이 급한 사람은',
        commerce: '실패 없이 고르고 싶은 사람은',
        public: '실제 영향이 궁금한 사람은',
        general: '지금 검색한 사람은',
    };
    return subjects[profile.category];
}

function articleLeadPhrase(profile: TopicProfile): string {
    if (profile.category === 'issue') return '속보보다';
    return profile.category === 'general' ? '검색 결과보다' : '뉴스 제목보다';
}

function hookPromise(profile: TopicProfile): string {
    const promises: Record<TopicProfile['category'], string> = {
        policy: '대상 여부와 놓치면 손해 보는 조건',
        issue: '왜 떴는지와 공식입장 전후 맥락',
        money: '내 돈과 지역에 미칠 실제 영향',
        entertainment: '화제 장면과 인물 관계',
        sports: '기록이 바꾼 다음 판도',
        incident: '현재 위치·피해·대응 정보',
        commerce: '실패하지 않는 선택 기준',
        public: '누가 영향을 받는지와 후속 일정',
        general: '갑자기 뜬 이유와 지금 확인할 사실',
    };
    return promises[profile.category];
}

function subjectParticle(text: string): string {
    const char = String(text || '').trim().slice(-1);
    const code = char.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '는';
    return (code - 0xac00) % 28 === 0 ? '는' : '은';
}

function buildTitleIdeas(profile: TopicProfile): KeywordStrategyIdea[] {
    if (profile.category === 'issue') {
        const issueCandidates = [
            {
                label: `${profile.keyword} 왜 떴나: 처음 나온 말부터 현재 반응까지`,
                tag: '이슈 타임라인',
                reason: '검색자가 가장 먼저 궁금해하는 발생 이유와 현재 흐름을 한 번에 잡습니다.',
                title: '첫 문단에서 무슨 일인지 바로 답하고 시간순으로 정리',
                bias: 9,
            },
            {
                label: `${profile.core} 공식입장 전후로 달라진 핵심 쟁점`,
                tag: '공식입장형',
                reason: '카더라보다 확인된 입장과 바뀐 반응을 분리해 신뢰도를 높입니다.',
                title: '공식 확인, 반응 변화, 남은 의문을 따로 배치',
                bias: 8,
            },
            {
                label: `${profile.core} 검색한 사람이 놓치기 쉬운 반응의 갈림길`,
                tag: '반응 분석',
                reason: '단순 사건 요약이 아니라 사람들이 왜 갈리는지 설명해 체류 시간을 만듭니다.',
                title: '찬반, 팬 반응, 일반 여론을 한 화면에서 비교',
                bias: 7,
            },
            {
                label: `${profile.keyword}, 논란보다 먼저 확인해야 할 사실 3가지`,
                tag: '팩트 우선',
                reason: '후킹은 강하지만 과장 대신 확인된 사실을 앞세워 SEO/GEO 신뢰도를 지킵니다.',
                title: '확인된 사실, 미확인 주장, 다음 발표 가능성으로 분리',
                bias: 8,
            },
            {
                label: `${profile.core} 이후 다음 검색은 무엇으로 이어질까`,
                tag: '후속 검색',
                reason: '이슈 글에서 끝내지 않고 후속 일정과 관련 키워드로 내부 링크를 만듭니다.',
                title: '다음 일정, 관련 인물, 후속 기사 흐름으로 확장',
                bias: 5,
            },
            {
                label: `${profile.core} 한 줄 요약으로는 절대 안 보이는 맥락`,
                tag: '신선한 관점',
                reason: '남들이 베끼는 요약형 제목을 피하고 맥락형 글로 차별화합니다.',
                title: '짧은 실검어 뒤의 배경을 독자 관점에서 해석',
                bias: 7,
            },
        ];
        return issueCandidates.map((candidate) => makeStrategyIdea(candidate.label, candidate.tag, candidate.reason, candidate.title, profile, candidate.bias));
    }

    const numberHook = profile.numbers[0] ? `${profile.numbers[0]}보다 먼저 봐야 할` : '검색량 붙기 전에 잡아야 할';
    const promise = hookPromise(profile);
    const audience = compactAudience(profile);
    const candidates = [
        {
            label: `${profile.keyword}, 지금 봐야 할 건 ${articleLeadPhrase(profile)} ${promise}`,
            tag: '즉답형 가지',
            reason: '검색자의 실제 질문을 제목에 박아 첫 문단 답변으로 이어지게 합니다.',
            title: `${profile.searchIntent} 흐름에 맞춰 답부터 제시`,
            bias: 6,
        },
        {
            label: `${profile.core} 검색 전 확인할 ${profile.proofNeed}`,
            tag: '근거 확장',
            reason: '출처와 판단 기준을 함께 제시해 검색자가 신뢰할 수 있는 구조입니다.',
            title: `${profile.proofNeed}을 기준표처럼 정리`,
            bias: 4,
        },
        {
            label: `${numberHook} ${profile.core}의 숨은 변수`,
            tag: '숨은 변수',
            reason: '남들이 큰 키워드만 쓸 때 검색자가 멈칫하는 변수를 앞세웁니다.',
            title: `${profile.hookAngle}로 클릭 이유를 만듦`,
            bias: 8,
        },
        {
            label: `${profile.keyword} 검색한 사람이 놓치면 안 되는 판단 기준`,
            tag: '체류형 가지',
            reason: '단순 요약 대신 독자가 끝까지 읽을 판단 프레임을 줍니다.',
            title: `${profile.tension}을 해결하는 구조`,
            bias: 5,
        },
        {
            label: `${profile.core} 핵심만 보면 안 되는 이유: ${profile.bridgeAngle}`,
            tag: '클러스터형',
            reason: '한 글에서 끝내지 않고 후속 글과 내부 링크로 확장되는 제목입니다.',
            title: `${profile.bridgeAngle}을 묶어 주제 권위를 만듦`,
            bias: 3,
        },
        {
            label: `${audience}가 ${profile.core}에서 가장 많이 놓치는 것`,
            tag: '신선한 관점',
            reason: '누구를 위한 글인지 선명해서 CTR과 체류 시간을 동시에 노립니다.',
            title: `${audience}에게 바로 꽂히는 제목`,
            bias: 7,
        },
    ];
    return candidates.map((candidate) => makeStrategyIdea(candidate.label, candidate.tag, candidate.reason, candidate.title, profile, candidate.bias));
}

function buildAnswerIdeas(profile: TopicProfile): KeywordStrategyIdea[] {
    if (profile.category === 'issue') {
        const questionStem = profile.core || profile.keyword;
        const subject = subjectParticle(questionStem);
        const issueQuestions = [
            {
                label: `${questionStem}${subject} 왜 지금 검색량이 붙었나`,
                tag: '발생 이유',
                reason: '첫 문단에서 이슈가 뜬 이유를 바로 답하고 독자의 이탈을 막습니다.',
                title: '왜 떴는지 3문장 요약',
                bias: 8,
            },
            {
                label: `${questionStem}에서 공식적으로 확인된 내용은 어디까지인가`,
                tag: '팩트체크',
                reason: '확인된 사실과 추측을 분리해 신뢰도와 GEO 인용 가능성을 올립니다.',
                title: '확인 사실, 미확인 주장, 남은 쟁점 분리',
                bias: 9,
            },
            {
                label: `${questionStem} 반응은 왜 갈리고 있나`,
                tag: '반응 의도',
                reason: '댓글식 요약이 아니라 반응이 갈리는 이유를 설명해 체류 시간을 늘립니다.',
                title: '팬 반응, 대중 반응, 기사 반응 비교',
                bias: 6,
            },
            {
                label: `${profile.keyword} 이후 다음 일정이나 후속 발표는 무엇인가`,
                tag: '후속 일정',
                reason: '후속 검색어를 선점해 다음 글과 내부 링크로 연결합니다.',
                title: '다음 발표, 방송 일정, 추가 확인 포인트',
                bias: 5,
            },
        ];
        return issueQuestions.map((candidate) => makeStrategyIdea(candidate.label, candidate.tag, candidate.reason, candidate.title, profile, candidate.bias));
    }

    const questionStem = profile.core || profile.keyword;
    const candidates = [
        {
            label: `${questionStem}에서 지금 확인해야 할 핵심 변수는 무엇인가`,
            tag: 'AEO 질문',
            reason: `첫 문단에서 ${profile.answerFrame} 형태로 바로 답변합니다.`,
            title: '질문형 제목 + 즉답형 첫 문단',
            bias: 5,
        },
        {
            label: `${audienceSubject(profile)} ${questionStem}에서 무엇을 먼저 봐야 하나`,
            tag: '독자 지정',
            reason: '검색자를 특정해 글의 관점이 뚜렷해지고 이탈을 줄입니다.',
            title: '누구에게 필요한 정보인지 먼저 고정',
            bias: 4,
        },
        {
            label: `${profile.keyword} 관련 글에서 빼면 안 되는 근거는 무엇인가`,
            tag: '근거 질문',
            reason: `${profile.proofNeed}을 소제목으로 분리해 신뢰도를 높입니다.`,
            title: '출처형 소제목으로 신뢰도 강화',
            bias: 6,
        },
        {
            label: `${questionStem} 이후 검색자는 무엇을 또 찾아볼까`,
            tag: '후속 의도',
            reason: '다음 검색 의도를 미리 받아 내부 링크와 체류 시간을 만듭니다.',
            title: `${profile.bridgeAngle}로 다음 글 연결`,
            bias: 3,
        },
    ];
    return candidates.map((candidate) => makeStrategyIdea(candidate.label, candidate.tag, candidate.reason, candidate.title, profile, candidate.bias));
}

function peerConnectionLabel(profile: TopicProfile, peer: TopicProfile): string {
    if (profile.category === peer.category) return `${peer.core} 주제로 ${profile.bridgeAngle} 확장`;
    if (profile.laneId === 'policy' || peer.category === 'policy') return `${peer.core} 주제를 대상·조건 글로 연결`;
    if (profile.category === 'issue' || peer.category === 'issue') return `${peer.core} 주제를 타임라인·반응 글로 연결`;
    if (profile.category === 'money' || peer.category === 'money') return `${peer.core} 주제를 영향·수혜 변수로 연결`;
    if (profile.category === 'entertainment' || peer.category === 'entertainment') return `${peer.core} 주제를 인물·장면 반응으로 연결`;
    return `${peer.core} 주제를 후속 검색 의도로 연결`;
}

function hasSharedTopic(profile: TopicProfile, peer: TopicProfile): boolean {
    const shared = profile.entities.some((token) => peer.entities.includes(token));
    if (shared) return true;
    if (profile.category === 'general' || peer.category === 'general') return false;
    return profile.category === peer.category;
}

function buildClusterIdeas(profile: TopicProfile, lane: SourceLane, item: SourceSignal, peerItems: SourceSignal[]): KeywordStrategyIdea[] {
    const peerProfiles = peerItems
        .filter((peer) => peer.id !== item.id)
        .map((peer) => inferTopicProfile(lane, peer))
        .filter((peer) => peer.keyword !== profile.keyword)
        .filter((peer) => hasSharedTopic(profile, peer))
        .slice(0, 5);
    const peerIdeas = peerProfiles.map((peer, index) => makeStrategyIdea(
        `${profile.core} → ${peerConnectionLabel(profile, peer)}`,
        index === 0 ? '허브 연결' : '내부링크',
        `같은 ${lane.label} 흐름에서 넘어갈 다음 글감입니다. 단순 나열보다 검색자의 다음 질문을 받습니다.`,
        `${profile.keyword} 글 하단에서 ${peer.keyword}로 자연스럽게 연결`,
        profile,
        4 - index,
    ));
    const fallbackIdeas = profile.category === 'issue' ? [
        makeStrategyIdea(
            `${profile.core} 타임라인 → 공식입장 → 반응 변화`,
            '이슈 허브',
            '이슈형 글은 시간순 정리, 공식 확인, 반응 변화가 분리돼야 오래 읽힙니다.',
            '타임라인 글에서 공식입장 글과 반응 분석 글로 연결',
            profile,
            5,
        ),
        makeStrategyIdea(
            `${profile.core} 팩트체크 → 쟁점 비교 → 후속 일정`,
            '후속 검색',
            '추측성 글을 피하고 다음에 검색할 질문을 미리 받아 내부 순환을 만듭니다.',
            '확인된 사실과 다음 발표 가능성을 묶는 구조',
            profile,
            4,
        ),
        makeStrategyIdea(
            `${profile.keyword} 관련 인물·장면·반응 키워드 묶음`,
            '확장 묶음',
            '하나의 이슈를 인물, 장면, 반응으로 쪼개면 저경쟁 롱테일을 더 많이 확보할 수 있습니다.',
            '관련 인물, 원인 장면, 댓글 반응을 각각 후속 글로 분리',
            profile,
            3,
        ),
    ] : [
        makeStrategyIdea(
            `${profile.core} 기본 이해 → ${profile.proofNeed} → 다음 행동`,
            '허브 구조',
            '한 글에 답을 몰아넣지 않고 입문, 근거, 행동 글로 쪼개 주제 권위를 쌓습니다.',
            `${profile.bridgeAngle} 3단 내부 링크 구조`,
            profile,
            3,
        ),
        makeStrategyIdea(
            `${profile.keyword} 이후 사람들이 다시 검색할 질문 묶음`,
            '후속 검색',
            '검색자가 다음에 칠 질문을 미리 받아 체류와 재방문을 만듭니다.',
            `${profile.searchIntent} 다음 단계 설계`,
            profile,
            2,
        ),
    ];
    return [...peerIdeas, ...fallbackIdeas].slice(0, 5);
}

function semanticBase(profile: TopicProfile): string {
    return (profile.core || profile.keyword).replace(/\s+/g, ' ').trim();
}

function semanticCorpus(profile: TopicProfile, item: SourceSignal, peerItems: SourceSignal[]): string {
    const peerText = peerItems
        .slice(0, 8)
        .map((peer) => `${peer.keyword || peer.title || ''} ${peer.description || ''}`)
        .join(' ');
    return `${profile.keyword} ${profile.core} ${profile.entities.join(' ')} ${item.description || ''} ${peerText}`;
}

function appendSemanticSuffix(base: string, suffix: string): string {
    const cleanBase = base.replace(/\s+/g, ' ').trim();
    const cleanSuffix = suffix.replace(/\s+/g, ' ').trim();
    if (!cleanBase || !cleanSuffix) return cleanBase || cleanSuffix;
    if (cleanBase.endsWith(cleanSuffix)) return '';
    const suffixTokens = keywordTokens(cleanSuffix);
    if (suffixTokens.length === 1 && cleanBase.includes(cleanSuffix)) return '';
    return `${cleanBase} ${cleanSuffix}`;
}

function uniqueSemanticIdeas(profile: TopicProfile, candidates: Array<{ label: string; tag: string; reason: string; title: string; bias?: number }>, limit: number): KeywordStrategyIdea[] {
    const seen = new Set<string>();
    return candidates
        .map((candidate) => ({
            ...candidate,
            label: candidate.label.replace(/[→:]+/g, ' ').replace(/\s+/g, ' ').trim(),
        }))
        .filter((candidate) => candidate.label.length >= 4)
        .filter((candidate) => {
            const key = candidate.label.replace(/\s+/g, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((candidate) => makeStrategyIdea(candidate.label, candidate.tag, candidate.reason, candidate.title, profile, candidate.bias || 0))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

function extractCoachRoot(profile: TopicProfile, corpus: string): string {
    const coach = corpus.match(/([가-힣]{2,5})\s*감독/);
    if (coach) return `${coach[1]} 감독`;
    return semanticBase(profile);
}

function buildSemanticMindmapIdeas(profile: TopicProfile, item: SourceSignal, peerItems: SourceSignal[]): KeywordStrategyIdea[] {
    const base = semanticBase(profile);
    const corpus = semanticCorpus(profile, item, peerItems);
    const isFootballIssue = /축구|월드컵|대표팀|감독|선임|사퇴|대한축구협회|KFA|홍명보/.test(corpus);
    const hasCoachIssue = /감독|선임|사퇴|경질|후임|후보/.test(corpus);
    const candidates: Array<{ label: string; tag: string; reason: string; title: string; bias?: number }> = [];
    const pushSuffix = (suffix: string, tag: string, reason: string, title: string, bias = 4) => {
        const label = appendSemanticSuffix(base, suffix);
        if (label) candidates.push({ label, tag, reason, title, bias });
    };

    if (isFootballIssue && hasCoachIssue) {
        const coachRoot = extractCoachRoot(profile, corpus);
        candidates.push(
            {
                label: appendSemanticSuffix(coachRoot, '다음 감독 후보') || `${coachRoot} 후임 후보`,
                tag: '후임 의문',
                reason: '사퇴·선임 이슈 뒤에 바로 이어지는 검색 의도입니다.',
                title: '후임 후보와 선임 기준을 별도 글감으로 확장',
                bias: 10,
            },
            {
                label: appendSemanticSuffix(coachRoot, '선임 과정') || `${coachRoot} 선임 배경`,
                tag: '선임 과정',
                reason: '왜 선임됐는지, 절차에 문제가 있었는지를 찾는 후속 검색입니다.',
                title: '선임 배경, 의사결정 주체, 논란 지점을 분리',
                bias: 9,
            },
            {
                label: appendSemanticSuffix(coachRoot, '사퇴 이유') || `${coachRoot} 거취 이유`,
                tag: '사퇴 이유',
                reason: '뉴스 제목보다 원인과 책임 소재를 확인하려는 의도입니다.',
                title: '사퇴 요구가 나온 배경과 남은 변수 정리',
                bias: 8,
            },
            {
                label: '대한축구협회 감독 선임 과정',
                tag: '기관 쟁점',
                reason: '개인 이슈에서 축구협회 의사결정 구조로 확장되는 가지입니다.',
                title: '협회 절차와 책임론을 독립 글감으로 분리',
                bias: 7,
            },
            {
                label: '대표팀 선수 기용 논란',
                tag: '선수 기용',
                reason: '감독 이슈는 전술·선발·교체 판단으로 후속 검색이 이어집니다.',
                title: '선발, 교체, 전술 선택을 검색자가 궁금해하는 순서로 정리',
                bias: 6,
            },
            {
                label: '월드컵 예선 대표팀 전술 변화',
                tag: '경기 변수',
                reason: '사퇴나 경질 이슈 이후 다음 경기 영향까지 확인하려는 검색입니다.',
                title: '다음 경기와 예선 경우의 수로 연결',
                bias: 5,
            },
        );
    } else if (profile.category === 'policy') {
        [
            ['대상', '대상 확인', '신청자가 가장 먼저 확인하는 조건입니다.', '대상 조건과 제외 조건 분리'],
            ['신청방법', '신청 절차', '실제 행동으로 이어지는 정보형 검색입니다.', '신청 위치, 준비 순서, 주의사항 정리'],
            ['필요서류', '준비물', '신청 전 체크리스트 수요가 붙는 가지입니다.', '서류와 증빙 기준을 표로 정리'],
            ['조회', '조회 의도', '내 상태를 확인하려는 직접 검색입니다.', '조회 경로와 결과 해석을 분리'],
            ['제외대상', '실패 방지', '탈락 조건을 먼저 확인하려는 불안 검색입니다.', '대상자와 제외자를 한 화면에서 비교'],
        ].forEach(([suffix, tag, reason, title], index) => pushSuffix(suffix, tag, reason, title, 8 - index));
    } else if (profile.category === 'commerce') {
        [
            ['후기', '구매 검증', '구매 전 실제 후기를 확인하려는 의도입니다.', '장점보다 실패 조건을 먼저 정리'],
            ['가격', '가격 비교', '구매 전환 직전의 핵심 검색입니다.', '가격대, 구성, 대체 상품 비교'],
            ['비교', '대안 비교', '비슷한 제품 사이에서 선택하려는 검색입니다.', '누구에게 맞는지 기준으로 분리'],
            ['단점', '리스크 확인', '광고보다 실제 단점을 찾는 의도입니다.', '단점과 피해야 할 조건 정리'],
            ['대체품', '대체 수요', '품절·비싸짐 이후 대체 상품을 찾는 흐름입니다.', '대체 제품군과 구매 포인트 정리'],
        ].forEach(([suffix, tag, reason, title], index) => pushSuffix(suffix, tag, reason, title, 7 - index));
    } else if (profile.category === 'entertainment') {
        [
            ['출연진', '인물 확장', '방송·드라마 검색에서 가장 빠른 후속 의도입니다.', '등장인물과 실제 배우 정보를 분리'],
            ['몇부작', '편성 의문', '시청 전 전체 분량과 일정을 확인하려는 검색입니다.', '방송 일정과 회차 정보를 정리'],
            ['결말', '해석 수요', '시청 후 바로 붙는 스포일러·해석 검색입니다.', '결말과 복선 해석을 나눠 정리'],
            ['재방송', '다시보기', '놓친 시청자가 바로 행동하는 검색입니다.', '재방송 시간과 OTT 경로를 정리'],
            ['시청률', '반응 확인', '화제성의 크기를 확인하려는 검색입니다.', '시청률 변화와 반응 포인트 연결'],
        ].forEach(([suffix, tag, reason, title], index) => pushSuffix(suffix, tag, reason, title, 7 - index));
    } else if (profile.category === 'sports') {
        [
            ['일정', '다음 경기', '결과 확인 뒤 바로 이어지는 경기 일정 검색입니다.', '일정, 중계, 상대 전력을 분리'],
            ['중계', '시청 행동', '실시간 시청으로 이어지는 전환형 검색입니다.', '중계 채널과 시작 시간을 정리'],
            ['순위', '순위 변수', '결과가 순위와 경우의 수에 미치는 영향을 찾습니다.', '순위표와 남은 경기 변수를 연결'],
            ['하이라이트', '영상 수요', '경기 직후 가장 빠르게 붙는 재확인 검색입니다.', '득점 장면과 논란 장면을 분리'],
            ['엔트리', '선수 명단', '누가 뛰는지 확인하는 실시간 의도입니다.', '선발, 교체, 부상 변수를 정리'],
        ].forEach(([suffix, tag, reason, title], index) => pushSuffix(suffix, tag, reason, title, 7 - index));
    } else if (profile.category === 'incident') {
        [
            ['현재상황', '현재 상황', '속보 뒤 지금 기준 정보를 확인하려는 검색입니다.', '시간대별 상황과 공식 발표 분리'],
            ['원인', '원인 추적', '사건의 배경과 책임 소재를 확인하려는 의도입니다.', '원인, 피해, 후속 조치를 분리'],
            ['위치', '위치 확인', '내 주변 영향 여부를 확인하려는 검색입니다.', '위치, 통제, 우회 정보를 정리'],
            ['피해', '피해 규모', '피해 범위와 현재 대응을 확인하는 흐름입니다.', '피해 규모와 복구 상황 정리'],
            ['대응방법', '행동 요령', '지금 무엇을 해야 하는지 찾는 의도입니다.', '행동 순서와 주의사항을 정리'],
        ].forEach(([suffix, tag, reason, title], index) => pushSuffix(suffix, tag, reason, title, 7 - index));
    } else {
        [
            ['전말', '사건 전말', '짧은 화제어 뒤 전체 맥락을 알고 싶은 검색입니다.', '배경, 현재 반응, 남은 쟁점 분리'],
            ['이유', '발생 이유', '왜 떴는지를 먼저 확인하려는 검색입니다.', '원인과 반응을 시간순으로 정리'],
            ['공식입장', '공식 확인', '추측보다 확인된 내용을 찾는 의도입니다.', '공식 발표와 미확인 주장을 분리'],
            ['타임라인', '흐름 정리', '무슨 일이 어떤 순서로 벌어졌는지 찾습니다.', '처음 발생부터 현재까지 정리'],
            ['후속 발표', '다음 변수', '지금 이후 무엇이 바뀌는지 확인하려는 검색입니다.', '다음 일정과 영향 범위를 연결'],
        ].forEach(([suffix, tag, reason, title], index) => pushSuffix(suffix, tag, reason, title, 7 - index));
    }

    return uniqueSemanticIdeas(profile, candidates, 6);
}

function buildContextMindmapIdeas(profile: TopicProfile, lane: SourceLane, item: SourceSignal, peerItems: SourceSignal[]): KeywordStrategyIdea[] {
    const profileCorpus = semanticCorpus(profile, item, peerItems);
    const related = peerItems
        .filter((peer) => peer.id !== item.id)
        .map((peer) => inferTopicProfile(lane, peer))
        .filter((peer) => peer.keyword !== profile.keyword)
        .filter((peer) => hasSharedTopic(profile, peer))
        .slice(0, 4)
        .map((peer, index) => ({
            label: peer.keyword,
            tag: index === 0 ? '같은 흐름' : '연결 검색',
            reason: `${lane.label}에서 함께 뜨는 검색 흐름입니다.`,
            title: `${profile.keyword} 글에서 ${peer.keyword}로 자연스럽게 내부 연결`,
            bias: 5 - index,
        }));

    const namedEntities = uniqueList((profileCorpus.match(/[가-힣]{2,5}/g) || [])
        .filter((token) => !['검색어', '검색량', '문서수', '실시간', '후보', '뉴스', '정리', '확인', '대한민국'].includes(token))
        .slice(0, 6));
    const entityIdeas = namedEntities
        .filter((entity) => !profile.keyword.includes(entity) || entity.length >= 3)
        .slice(0, 3)
        .map((entity, index) => ({
            label: `${entity} 관련 쟁점`,
            tag: '인물·기관',
            reason: '본문에서 별도 소제목으로 분리할 수 있는 연결 대상입니다.',
            title: `${entity}가 이 흐름에서 왜 검색되는지 분리`,
            bias: 3 - index,
        }));

    const fallback = buildClusterIdeas(profile, lane, item, peerItems)
        .map((idea) => ({
            label: idea.label.replace(/.*?→\s*/, ''),
            tag: idea.tag,
            reason: idea.reason,
            title: idea.title,
            bias: 1,
        }));

    return uniqueSemanticIdeas(profile, [...related, ...entityIdeas, ...fallback], 5);
}

function buildSourceStrategy(lane: SourceLane, item: SourceSignal, peerItems: SourceSignal[]): KeywordStrategyGroup[] {
    const profile = inferTopicProfile(lane, item);
    const semanticIdeas = buildSemanticMindmapIdeas(profile, item, peerItems);
    const contextIdeas = buildContextMindmapIdeas(profile, lane, item, peerItems);
    const clusterIdeas = buildClusterIdeas(profile, lane, item, peerItems).sort((a, b) => b.score - a.score);

    return [
        { label: '다음 검색 의문', desc: '선택한 실시간 키워드에서 검색자가 바로 이어서 칠 만한 확장 키워드입니다.', items: semanticIdeas },
        { label: '문맥 확장 가지', desc: '같은 흐름의 인물·기관·후속 쟁점을 묶어 자동화 글감으로 바로 넘길 수 있게 정리합니다.', items: contextIdeas },
        { label: '연결 이슈 클러스터', desc: '주변 실시간 흐름을 후속 글감으로 연결해 큰 키워드까지 권위를 쌓습니다.', items: clusterIdeas },
    ];
}

function SourceSignalInsightPanel({ lane, item, items }: { lane: SourceLane; item: SourceSignal | null; items: SourceSignal[] }) {
    if (!item) {
        return (
            <aside className="source-insight-panel source-insight-panel-empty">
                <strong>키워드 전략 대기</strong>
                <p>{lane.label} 원본이 들어오면 다음 검색 의문과 연결 이슈 마인드맵을 표시합니다.</p>
            </aside>
        );
    }

    const keyword = cleanLiveText(item.keyword || item.title, lane.label);
    const description = cleanLiveText(item.description || item.title, lane.description);
    const searchUrl = buildSourceSearchUrl(lane.id, keyword);
    const strategyGroups = buildSourceStrategy(lane, item, items);
    const primaryIdeas = (strategyGroups[0]?.items || []).slice(0, 4);
    const questionIdeas = (strategyGroups[1]?.items || []).slice(0, 3);
    const clusterIdeas = (strategyGroups[2]?.items || []).slice(0, 3);

    return (
        <aside className="source-insight-panel source-insight-panel-rich" style={{ borderColor: lane.accent + '66' }}>
            <div className="source-insight-head">
                <div>
                    <span style={{ color: lane.accent }}>선택 키워드 마인드맵</span>
                    <strong>{keyword}</strong>
                </div>
                <a href={searchUrl} target="_blank" rel="noreferrer">검색결과</a>
            </div>
            <p className="source-insight-desc">{description}</p>
            <div className="source-strategy-grid" aria-label={`${keyword} 키워드 전략`}>
                <section className="source-strategy-card source-strategy-card-main">
                    <div className="source-strategy-card-head">
                        <strong>{strategyGroups[0].label}</strong>
                        <small>{strategyGroups[0].desc}</small>
                    </div>
                    <div className="source-idea-list">
                        {primaryIdeas.map((idea) => (
                            <a key={idea.label} className="source-idea-card" href={buildSourceSearchUrl(lane.id, idea.label)} target="_blank" rel="noreferrer">
                                <span>{idea.tag}</span>
                                <strong>{idea.label}</strong>
                                <small>확장 적합도 {idea.score}</small>
                                <p>{idea.title}</p>
                            </a>
                        ))}
                    </div>
                </section>
                <section className="source-strategy-card">
                    <div className="source-strategy-card-head">
                        <strong>{strategyGroups[1].label}</strong>
                        <small>{strategyGroups[1].desc}</small>
                    </div>
                    <div className="source-question-list">
                        {questionIdeas.map((idea) => (
                            <a key={idea.label} href={buildSourceSearchUrl(lane.id, idea.label)} target="_blank" rel="noreferrer">
                                <span>{idea.tag}</span>
                                <strong>{idea.label}</strong>
                                <small>{idea.reason}</small>
                            </a>
                        ))}
                    </div>
                </section>
                <section className="source-strategy-card">
                    <div className="source-strategy-card-head">
                        <strong>{strategyGroups[2].label}</strong>
                        <small>{strategyGroups[2].desc}</small>
                    </div>
                    <div className="source-cluster-core" style={{ borderColor: lane.accent, color: lane.accent }}>{keyword}</div>
                    <div className="source-cluster-list">
                        {clusterIdeas.length === 0 ? (
                            <p>주변 실시간 키워드가 쌓이면 내부 링크용 클러스터를 자동으로 묶습니다.</p>
                        ) : clusterIdeas.map((idea) => (
                            <a key={idea.label} href={buildSourceSearchUrl(lane.id, idea.label)} target="_blank" rel="noreferrer">
                                <span>{idea.tag}</span>
                                <strong>{idea.label}</strong>
                            </a>
                        ))}
                    </div>
                </section>
            </div>
        </aside>
    );
}

function formatLiveUpdatedAt(value?: string): string {
    if (!value) return '실시간 대기';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '실시간 갱신';
    return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

const DEFAULT_HERO_PROOFS: HeroProof[] = [
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg',
        alt: '네이버 블로그 방문횟수 9,177 성과 화면',
        title: '방문횟수 9,177 돌파',
        desc: '2월 15일 기준 방문 지표가 크게 상승한 실제 성과 화면입니다.',
        metric: '방문 9,177',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260310_002438127-fast.jpg',
        alt: '조회수 19,896 공감 213 성과 화면',
        title: '조회수 19,896 인증',
        desc: '조회수와 공감수가 함께 쌓인 고성과 요약 화면입니다.',
        metric: '조회 19,896',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260309_163736774-fast.jpg',
        alt: '카카오톡 사용자 조회수 10,003 인증 대화',
        title: '하루 만명 조회 인증',
        desc: '실사용자가 공유한 조회수 10,003 성과 인증 대화입니다.',
        metric: '조회 10,003',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_06-fast.jpg',
        alt: '블로그 예상수익 12,978원 성과 화면',
        title: '예상수익 상승',
        desc: '네이버 리워드 예상수익 그래프와 일별 수익 내역입니다.',
        metric: '₩12,978',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_04-fast.jpg',
        alt: '오늘 조회수 1,514 성과 화면',
        title: '오늘 조회수 1,514',
        desc: '실시간 조회수와 공감, 댓글이 함께 잡힌 운영 성과입니다.',
        metric: '조회 1,514',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_02-fast.jpg',
        alt: '오늘 조회수 1,187 성과 화면',
        title: '오늘 조회수 1,187',
        desc: '하루 조회 흐름이 빠르게 올라간 블로그 통계 화면입니다.',
        metric: '조회 1,187',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_05-fast.jpg',
        alt: '조회수 1,122와 방문 분석 성과 화면',
        title: '조회수 1,122 기록',
        desc: '방문 분석 그래프에서 우상향 흐름을 확인할 수 있는 화면입니다.',
        metric: '조회 1,122',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_03-fast.jpg',
        alt: '오늘 조회수 836 성과 화면',
        title: '오늘 조회수 836',
        desc: '조회수와 오늘 지표가 함께 표시된 네이버 통계 인증입니다.',
        metric: '조회 836',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252_01-fast.jpg',
        alt: '조회수 그래프 5,928 성과 화면',
        title: '조회 그래프 급상승',
        desc: '1,062에서 5,928까지 상승한 추세가 보이는 그래프입니다.',
        metric: '5,928',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260309_164704537-fast.jpg',
        alt: '카카오톡 사용자 프로그램 사용 후기와 공감수 인증',
        title: '사용자 반응 인증',
        desc: '프로그램 사용 후 생긴 성과를 사용자가 직접 공유한 대화입니다.',
        metric: '공감 213',
    },
    {
        src: '/images/proof-user/fast/KakaoTalk_20260305_004700252-fast.jpg',
        alt: '네이버 블로그 일간현황 조회수 상승 성과 화면',
        title: '방문자 상승 흐름',
        desc: '콘텐츠 발행 후 일간 지표가 누적되는 실제 성과 화면입니다.',
        metric: '조회수 80',
    },
];

/**
 * 메인 페이지 — payment-page/index.html (838줄) 마이그레이션.
 * 4개 섹션: Hero · TrustBar · Explore · Testimonials.
 * inline style 그대로 유지 (사용자 요구).
 */
function IndexPage() {
    const [activeProofIndex, setActiveProofIndex] = useState(0);
    const [liveState, setLiveState] = useState<HomeLiveState>(() => buildFallbackHomeLiveState('loading'));
    const [activeSourceLaneId, setActiveSourceLaneId] = useState<SourceLaneId>('naver');
    const [activeSourceKeyword, setActiveSourceKeyword] = useState('');

    // SEO meta (페이지 진입 시 document.title 변경)
    useEffect(() => {
        const prevTitle = document.title;
        document.title = '리더스프로 | Leaders Pro 네이버 자동화 툴 · AI 블로그 자동 발행';
        return () => { document.title = prevTitle; };
    }, []);

    // fade-in scroll animation (.fade-in 클래스 보유 요소 자동 감지)
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    (entry.target as HTMLElement).style.transitionDelay = `${i * 0.08}s`;
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let alive = true;
        loadHomeLiveState()
            .then((state) => {
                if (alive) setLiveState(state);
            })
            .catch(() => {
                if (alive) setLiveState(buildFallbackHomeLiveState('error'));
            });
        return () => {
            alive = false;
        };
    }, []);

    const liveUpdatedAt = formatLiveUpdatedAt(liveState.updatedAt);
    const liveStatusLabel = liveState.status === 'ready' ? 'LIVE' : liveState.status === 'error' ? 'FAST FALLBACK' : 'LOADING';
    const activeSourceLane = liveState.lanes.find((lane) => lane.id === activeSourceLaneId)
        || liveState.lanes[0]
        || { ...SOURCE_LANE_CONFIGS[0], items: [] };
    const activeSourceItems = activeSourceLane.items.slice(0, 10);
    const activeSourceInsightItem = activeSourceItems.find((item) => cleanLiveText(item.keyword || item.title, activeSourceLane.label) === activeSourceKeyword) || activeSourceItems[0] || null;
    const selectSourceLane = (laneId: SourceLaneId) => {
        setActiveSourceLaneId(laneId);
        setActiveSourceKeyword('');
    };
    const heroProofs = DEFAULT_HERO_PROOFS;
    const activeProof = heroProofs[activeProofIndex % heroProofs.length] || DEFAULT_HERO_PROOFS[0];

    useEffect(() => {
        if (heroProofs.length <= 1) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const timer = window.setInterval(() => {
            setActiveProofIndex((index) => (index + 1) % heroProofs.length);
        }, 4200);
        return () => window.clearInterval(timer);
    }, [heroProofs.length]);

    return (
        <>
            <ParticlesCanvas />

            {/* ═══ HERO ═══ */}
            <section className="home-hero" style={{ minHeight: 'calc(100vh - 80px)', display: 'grid', gridTemplateColumns: 'minmax(0, 980px) minmax(280px, 360px)', columnGap: 24, rowGap: 14, padding: '76px 24px 28px', maxWidth: 1412, margin: '0 auto', position: 'relative', zIndex: 1, alignItems: 'stretch', justifyContent: 'center' }}>
                <div className="hero-eyebrow">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }} />
                    <span>PREMIUM AUTOMATION</span>
                </div>
                <div className="hero-content">
                    <div className="hero-realtime-board" aria-label="실시간 검색어">
                        <div className="hero-realtime-head">
                            <span>{liveStatusLabel}</span>
                            <strong>실시간 검색어</strong>
                            <small>{liveUpdatedAt}</small>
                        </div>
                        <div className="hero-source-tabs" role="tablist" aria-label="홈 실시간 소스 선택">
                            {liveState.lanes.map((lane) => {
                                const isActive = lane.id === activeSourceLane.id;
                                return (
                                    <button
                                        key={lane.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        className={`hero-source-tab${isActive ? ' active' : ''}`}
                                        onClick={() => selectSourceLane(lane.id)}
                                        style={{ borderColor: isActive ? lane.accent : 'rgba(255,255,255,0.13)', color: isActive ? '#061018' : 'rgba(255,255,255,0.74)', background: isActive ? lane.accent : 'rgba(255,255,255,0.045)' }}
                                    >
                                        <span style={{ background: isActive ? '#061018' : lane.accent }} />
                                        <strong>{lane.label}</strong>
                                        <small>{lane.items.length}</small>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="hero-source-panel" style={{ borderColor: activeSourceLane.accent + '66', background: 'linear-gradient(135deg, ' + activeSourceLane.accent + '16, rgba(255,255,255,0.035))' }}>
                            <div className="hero-source-panel-head">
                                <span style={{ background: activeSourceLane.accent }} />
                                <div>
                                    <strong>{activeSourceLane.label}</strong>
                                    <p>{activeSourceLane.description}</p>
                                </div>
                                <small>{activeSourceItems.length}개 표시</small>
                            </div>
                            <div className="hero-source-body">
                                <div className="hero-source-list-shell">
                                    <div className="hero-source-list">
                                    {activeSourceItems.length === 0 ? (
                                        <article className="hero-source-empty">
                                            <strong>원본 수집 중</strong>
                                            <p>{activeSourceLane.label} 원본에서 확인된 실시간 항목만 표시합니다.</p>
                                        </article>
                                    ) : activeSourceItems.map((item, index) => {
                                        const keyword = cleanLiveText(item.keyword || item.title, activeSourceLane.label);
                                        const description = cleanLiveText(item.description || item.title, activeSourceLane.description);
                                        return (
                                            <article key={item.id || `${activeSourceLane.id}-hero-${keyword}-${index}`} className={`hero-source-row${activeSourceInsightItem === item ? ' active' : ''}`}>
                                                <button type="button" className="hero-source-row-main" onClick={() => setActiveSourceKeyword(keyword)}>
                                                    <span>{index + 1}</span>
                                                    <div>
                                                        <strong>{keyword}</strong>
                                                        <p>{description}</p>
                                                    </div>
                                                    <small>{item.priority || 'LIVE'}</small>
                                                </button>
                                                <a className="hero-source-row-search" href={buildSourceSearchUrl(activeSourceLane.id, keyword)} target="_blank" rel="noreferrer">검색</a>
                                            </article>
                                        );
                                    })}
                                    </div>
                                    {activeSourceItems.length > 5 && (
                                        <span className="hero-source-scroll-hint" aria-hidden="true">
                                            <span />
                                        </span>
                                    )}
                                </div>
                                <SourceSignalInsightPanel lane={activeSourceLane} item={activeSourceInsightItem} items={activeSourceItems} />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hero-proof-stage" aria-label="실제 사용자 성과 이미지">
                    <div className="proof-summary">
                        <span>{activeProof.metric || '성과 인증'}</span>
                        <strong>{activeProof.title || '실제 운영 성과'}</strong>
                        <small>{activeProof.desc || '사용자가 직접 확인한 성과 이미지를 순서대로 보여줍니다.'}</small>
                    </div>
                    <div className="proof-image-shell">
                        {heroProofs.map((proof, index) => (
                            <img
                                key={`${proof.src}-${index}`}
                                src={proof.src}
                                alt={proof.alt || proof.title || 'Leaders Pro 사용자 성과 이미지'}
                                loading={index === 0 ? 'eager' : 'lazy'}
                                decoding="async"
                                className={`proof-image${index === activeProofIndex % heroProofs.length ? ' active' : ''}`}
                            />
                        ))}
                    </div>
                    <div className="proof-dots" role="tablist" aria-label="성과 이미지 선택">
                        {heroProofs.map((proof, index) => (
                            <button
                                key={`${proof.src}-dot-${index}`}
                                type="button"
                                className={index === activeProofIndex % heroProofs.length ? 'active' : ''}
                                onClick={() => setActiveProofIndex(index)}
                                aria-label={`${index + 1}번째 성과 이미지 보기`}
                                aria-selected={index === activeProofIndex % heroProofs.length}
                            />
                        ))}
                    </div>
                </div>
                <div className="hero-action-strip" aria-label={'\ud648 \ube60\ub978 \uc774\ub3d9'}>
                    {[
                        { to: '/leword', label: '\ud669\uae08\ud0a4\uc6cc\ub4dc \ubcf4\ub7ec\uac00\uae30', desc: '\uc2e4\uc2dc\uac04 \ud669\uae08\ud0a4\uc6cc\ub4dc\ub97c \ubc14\ub85c \ud655\uc778', tone: 'gold' },
                        { to: '/chatbots', label: '\ubb34\ub8cc \ucc57\ubd07 \uc0ac\uc6a9\ud558\ub7ec\uac00\uae30', desc: '\uc9c8\ubb38\ud558\uace0 \uc544\uc774\ub514\uc5b4 \ubc14\ub85c \ubc1b\uae30', tone: 'cyan' },
                        { to: '/pricing', label: '\uc790\ub3d9\ud654 \uad6c\ub9e4\ud558\ub7ec\uac00\uae30', desc: '\ubc1c\ud589 \uc790\ub3d9\ud654\ub97c \ubc14\ub85c \uc2dc\uc791', tone: 'green' },
                    ].map((action, index) => (
                        <Link key={action.to} to={action.to} className={`hero-action-button ${action.tone}`} style={{ animationDelay: `${index * 0.14}s` }}>
                            <strong>{action.label}</strong>
                            <span>{action.desc}</span>
                        </Link>
                    ))}
                </div>
            </section>

            <style>{`
                .hero-eyebrow {
                    grid-column: 1 / -1;
                    justify-self: center;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 16px;
                    background: rgba(201, 168, 76, 0.1);
                    border: 1px solid rgba(201, 168, 76, 0.3);
                    border-radius: 50px;
                    color: var(--gold-primary);
                    font-size: 12px;
                    font-weight: 800;
                    letter-spacing: 2px;
                }

                .hero-realtime-board {
                    width: 100%;
                    min-height: 0;
                    height: clamp(500px, calc(100vh - 280px), 540px);
                    display: grid;
                    grid-template-rows: auto auto minmax(0, 1fr);
                    gap: 16px;
                    margin: 0;
                    padding: 18px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: rgba(8,15,24,0.62);
                    backdrop-filter: blur(16px);
                    box-shadow: 0 24px 70px rgba(0,0,0,0.22);
                }

                .hero-realtime-head {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }

                .hero-realtime-head span {
                    flex: 0 0 auto;
                    padding: 6px 10px;
                    border-radius: 999px;
                    background: rgba(68,215,182,0.14);
                    color: #44d7b6;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                }

                .hero-realtime-head strong {
                    color: #fff;
                    font-size: 14px;
                    font-weight: 900;
                }

                .hero-realtime-head small {
                    margin-left: auto;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    font-weight: 700;
                    white-space: nowrap;
                }

                .hero-source-tabs {
                    display: flex;
                    flex-wrap: nowrap;
                    align-items: center;
                    gap: 7px;
                    overflow-x: auto;
                    padding-bottom: 2px;
                    scrollbar-width: none;
                }

                .hero-source-tabs::-webkit-scrollbar {
                    display: none;
                }

                .hero-source-tab {
                    min-height: 38px;
                    flex: 0 0 auto;
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    padding: 8px 10px;
                    border: 1px solid rgba(255,255,255,0.13);
                    border-radius: 999px;
                    font: inherit;
                    cursor: pointer;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .hero-source-tab:hover,
                .hero-source-tab.active {
                    transform: translateY(-1px);
                }

                .hero-source-tab span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex: 0 0 auto;
                }

                .hero-source-tab strong {
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-tab small {
                    min-width: 18px;
                    padding: 2px 5px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.16);
                    font-size: 11px;
                    font-weight: 900;
                    text-align: center;
                }

                .hero-source-panel {
                    min-height: 0;
                    height: 100%;
                    display: grid;
                    grid-template-rows: auto minmax(0, 1fr);
                    align-content: start;
                    gap: 12px;
                    padding: 14px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .hero-source-panel-head {
                    display: grid;
                    grid-template-columns: 12px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 10px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .hero-source-panel-head > span {
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                }

                .hero-source-panel-head strong {
                    display: block;
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                }

                .hero-source-panel-head p {
                    margin: 3px 0 0;
                    color: rgba(255,255,255,0.60);
                    font-size: 12px;
                    line-height: 1.38;
                }

                .hero-source-panel-head small {
                    color: rgba(255,255,255,0.62);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-list {
                    display: grid;
                    align-content: start;
                    gap: 7px;
                    height: 100%;
                    max-height: 100%;
                    min-height: 0;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    padding-right: 10px;
                    scrollbar-gutter: stable;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(68,215,182,0.95) rgba(255,255,255,0.12);
                }

                .hero-source-list::-webkit-scrollbar,
                .source-insight-panel::-webkit-scrollbar {
                    width: 11px;
                }

                .hero-source-list::-webkit-scrollbar-track,
                .source-insight-panel::-webkit-scrollbar-track {
                    border-radius: 999px;
                    background: rgba(255,255,255,0.12);
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
                }

                .hero-source-list::-webkit-scrollbar-thumb,
                .source-insight-panel::-webkit-scrollbar-thumb {
                    border: 2px solid rgba(13,28,42,0.96);
                    border-radius: 999px;
                    background: linear-gradient(180deg, #44d7b6, #2f8cff);
                    box-shadow: 0 0 14px rgba(68,215,182,0.38);
                }

                .hero-source-list::-webkit-scrollbar-thumb:hover,
                .source-insight-panel::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #65ffd9, #59a8ff);
                }

                .hero-source-list-shell {
                    position: relative;
                    min-width: 0;
                    height: 100%;
                    min-height: 0;
                }

                .hero-source-scroll-hint {
                    position: absolute;
                    top: 8px;
                    right: 2px;
                    bottom: 8px;
                    width: 12px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.16);
                    background: rgba(255,255,255,0.13);
                    box-shadow: inset 0 0 0 1px rgba(6,13,22,0.68), 0 0 18px rgba(68,215,182,0.20);
                    pointer-events: none;
                    z-index: 3;
                }

                .hero-source-scroll-hint span {
                    position: absolute;
                    left: 2px;
                    right: 2px;
                    top: 8px;
                    height: 34%;
                    border-radius: 999px;
                    background: linear-gradient(180deg, #65ffd9, #2f8cff);
                    box-shadow: 0 0 12px rgba(68,215,182,0.50);
                    animation: sourceScrollHint 2.8s ease-in-out infinite;
                }

                @keyframes sourceScrollHint {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(18px); }
                }

                .hero-source-empty {
                    min-height: 96px;
                    display: grid;
                    align-content: center;
                    gap: 6px;
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px dashed rgba(255,255,255,0.16);
                    background: rgba(255,255,255,0.035);
                }

                .hero-source-empty strong {
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                }

                .hero-source-empty p {
                    margin: 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .hero-source-row {
                    min-height: 48px;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 46px;
                    align-items: center;
                    gap: 6px;
                    padding: 0;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.045);
                    overflow: hidden;
                }

                .hero-source-row-main {
                    min-width: 0;
                    width: 100%;
                    height: 100%;
                    display: grid;
                    grid-template-columns: 30px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 9px;
                    padding: 7px 8px 7px 10px;
                    border: 0;
                    background: transparent;
                    color: inherit;
                    text-align: left;
                    font: inherit;
                    cursor: pointer;
                }

                .hero-source-row-main > span {
                    width: 26px;
                    height: 26px;
                    border-radius: 999px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.10);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 900;
                }

                .hero-source-row strong {
                    display: block;
                    min-width: 0;
                    color: #fff;
                    font-size: 14px;
                    line-height: 1.28;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .hero-source-row p {
                    margin: 2px 0 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 11px;
                    line-height: 1.3;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .hero-source-row-main > small {
                    color: rgba(255,255,255,0.56);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-row-search {
                    width: 40px;
                    min-height: 32px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 6px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.14);
                    color: rgba(255,255,255,0.74);
                    text-decoration: none;
                    font-size: 11px;
                    font-weight: 900;
                }

                .hero-source-body,
                .home-source-body {
                    display: grid;
                    grid-template-columns: minmax(330px, 0.82fr) minmax(0, 1.18fr);
                    gap: 12px;
                    align-items: start;
                    min-height: 0;
                    height: 100%;
                }

                .hero-source-row,
                .home-source-row {
                    color: inherit;
                    text-decoration: none;
                    cursor: pointer;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .hero-source-row:hover,
                .hero-source-row.active,
                .home-source-row:hover,
                .home-source-row.active {
                    transform: translateY(-1px);
                    border-color: rgba(255,255,255,0.24);
                    background: rgba(255,255,255,0.085);
                }

                .source-insight-panel {
                    min-width: 0;
                    height: 100%;
                    min-height: 0;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    scrollbar-gutter: stable;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(68,215,182,0.95) rgba(255,255,255,0.12);
                    display: grid;
                    gap: 10px;
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: rgba(5,10,18,0.35);
                }

                .source-insight-panel-empty {
                    min-height: 180px;
                    align-content: center;
                    border-style: dashed;
                }

                .source-insight-panel-empty strong {
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                }

                .source-insight-panel-empty p {
                    margin: 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .source-insight-head {
                    display: flex;
                    align-items: start;
                    justify-content: space-between;
                    gap: 10px;
                }

                .source-insight-head span {
                    display: block;
                    font-size: 11px;
                    font-weight: 900;
                }

                .source-insight-head strong {
                    display: block;
                    max-width: 310px;
                    margin-top: 3px;
                    color: #fff;
                    font-size: 15px;
                    font-weight: 900;
                    line-height: 1.25;
                    max-height: 38px;
                    overflow: hidden;
                }

                .source-insight-head a {
                    flex: 0 0 auto;
                    padding: 6px 9px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.16);
                    color: rgba(255,255,255,0.84);
                    text-decoration: none;
                    font-size: 11px;
                    font-weight: 900;
                }

                .source-insight-desc {
                    margin: 0;
                    color: rgba(255,255,255,0.62);
                    font-size: 11px;
                    line-height: 1.45;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .source-insight-panel-rich {
                    align-content: start;
                }

                .source-strategy-grid {
                    min-height: 0;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 8px;
                    align-content: start;
                }

                .source-strategy-card {
                    min-width: 0;
                    display: grid;
                    gap: 8px;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(255,255,255,0.04);
                }

                .source-strategy-card-main {
                    grid-column: 1 / -1;
                }

                .source-strategy-card-head {
                    display: grid;
                    gap: 3px;
                }

                .source-strategy-card-head strong {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 950;
                }

                .source-strategy-card-head small {
                    color: rgba(255,255,255,0.56);
                    font-size: 10px;
                    line-height: 1.35;
                }

                .source-idea-list {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 6px;
                }

                .source-idea-card,
                .source-question-list a,
                .source-cluster-list a {
                    min-width: 0;
                    display: grid;
                    gap: 4px;
                    padding: 8px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.10);
                    background: rgba(7,13,20,0.35);
                    color: inherit;
                    text-decoration: none;
                }

                .source-idea-card span,
                .source-question-list span,
                .source-cluster-list span {
                    color: #44d7b6;
                    font-size: 10px;
                    font-weight: 950;
                }

                .source-idea-card strong,
                .source-question-list strong,
                .source-cluster-list strong {
                    color: #fff;
                    font-size: 11px;
                    font-weight: 900;
                    line-height: 1.25;
                    min-height: 28px;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                }

                .source-idea-card small,
                .source-question-list small {
                    color: rgba(255,255,255,0.58);
                    font-size: 10px;
                    line-height: 1.25;
                }

                .source-idea-card p {
                    margin: 0;
                    color: rgba(255,255,255,0.62);
                    font-size: 10px;
                    line-height: 1.3;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .source-question-list,
                .source-cluster-list {
                    display: grid;
                    gap: 6px;
                }

                .source-cluster-core {
                    min-height: 34px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 7px 9px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.18);
                    background: rgba(255,255,255,0.055);
                    font-size: 11px;
                    font-weight: 950;
                    line-height: 1.2;
                    text-align: center;
                }

                .source-cluster-list p {
                    margin: 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 10px;
                    line-height: 1.45;
                }

                .source-publish-guide {
                    display: grid;
                    gap: 7px;
                    padding: 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(68,215,182,0.22);
                    background: rgba(68,215,182,0.08);
                }

                .source-publish-guide strong {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 950;
                }

                .source-publish-guide div {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 6px;
                }

                .source-publish-guide span {
                    min-width: 0;
                    padding: 7px 8px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.72);
                    font-size: 10px;
                    font-weight: 850;
                    text-align: center;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .source-mindmap {
                    display: grid;
                    gap: 10px;
                }

                .source-mindmap-core {
                    min-height: 42px;
                    max-height: 42px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 9px 11px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.18);
                    background: rgba(255,255,255,0.055);
                    font-size: 12px;
                    font-weight: 900;
                    text-align: center;
                    line-height: 1.25;
                    overflow: hidden;
                }

                .source-mindmap-branches {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 7px;
                }

                .source-mindmap-branch {
                    min-width: 0;
                    display: grid;
                    gap: 5px;
                    padding: 8px;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.045);
                }

                .source-mindmap-branch span {
                    color: rgba(255,255,255,0.88);
                    font-size: 11px;
                    font-weight: 900;
                }

                .source-mindmap-branch a,
                .source-expansion-chips a {
                    min-width: 0;
                    color: rgba(255,255,255,0.62);
                    text-decoration: none;
                    font-size: 10px;
                    font-weight: 800;
                    line-height: 1.25;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .source-mindmap-branch a:hover,
                .source-expansion-chips a:hover,
                .source-insight-head a:hover {
                    color: #fff;
                    border-color: rgba(255,255,255,0.28);
                }

                .source-expansion-box {
                    display: grid;
                    gap: 8px;
                }

                .source-expansion-box > strong {
                    color: #fff;
                    font-size: 12px;
                    font-weight: 900;
                }

                .source-expansion-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    max-height: 64px;
                    overflow-y: auto;
                }

                .source-expansion-chips a {
                    max-width: 100%;
                    padding: 6px 8px;
                    border-radius: 999px;
                    border: 1px solid rgba(255,255,255,0.13);
                    background: rgba(255,255,255,0.045);
                }


                .hero-live-rack {
                    margin-top: 22px;
                    display: grid;
                    gap: 12px;
                    padding: 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(9,14,22,0.64);
                    backdrop-filter: blur(14px);
                }

                .hero-live-rack-main {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                }

                .hero-live-rack-main span {
                    flex: 0 0 auto;
                    padding: 5px 9px;
                    border-radius: 999px;
                    background: rgba(68,215,182,0.14);
                    color: #44d7b6;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                }

                .hero-live-rack-main strong {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #fff;
                    font-size: 14px;
                }

                .hero-live-rack-main small {
                    flex: 0 0 auto;
                    color: rgba(255,255,255,0.54);
                    font-size: 12px;
                }

                .hero-live-rack-lanes {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 7px;
                }

                .hero-live-rack-lanes span {
                    padding: 5px 9px;
                    border: 1px solid;
                    border-radius: 999px;
                    font-size: 12px;
                    font-weight: 800;
                    background: rgba(255,255,255,0.04);
                }

                .hero-content {
                    width: 100%;
                    height: clamp(500px, calc(100vh - 280px), 540px);
                    justify-self: stretch;
                    align-self: stretch;
                    display: grid;
                    text-align: center;
                    position: relative;
                    z-index: 3;
                }

                .hero-action-strip {
                    grid-column: 1 / -1;
                    width: 100%;
                    margin: 0 auto;
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                }

                .hero-action-button {
                    position: relative;
                    min-height: 82px;
                    display: grid;
                    align-content: center;
                    gap: 7px;
                    padding: 16px 18px;
                    border-radius: 8px;
                    border: 3px solid rgba(255,255,255,0.30);
                    background: linear-gradient(135deg, rgba(1,5,10,0.98), rgba(10,18,30,0.96));
                    color: #fff;
                    text-decoration: none;
                    text-align: left;
                    overflow: hidden;
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12);
                    animation: heroActionPulse 2.7s ease-in-out infinite;
                    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
                }

                .hero-action-button::before {
                    content: '';
                    position: absolute;
                    inset: -2px;
                    background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.18) 45%, transparent 62%);
                    transform: translateX(-120%);
                    animation: heroActionShine 3.6s ease-in-out infinite;
                    pointer-events: none;
                }

                .hero-action-button:hover {
                    transform: translateY(-3px) scale(1.015);
                    border-color: rgba(255,255,255,0.52);
                    box-shadow: 0 30px 68px rgba(0,0,0,0.62), 0 0 34px rgba(225,177,44,0.24);
                }

                .hero-action-button strong,
                .hero-action-button span {
                    position: relative;
                    z-index: 1;
                }

                .hero-action-button strong {
                    color: #fff;
                    font-size: 17px;
                    font-weight: 950;
                    line-height: 1.28;
                }

                .hero-action-button span {
                    color: rgba(255,255,255,0.70);
                    font-size: 14px;
                    font-weight: 800;
                    line-height: 1.35;
                }

                .hero-action-button.gold {
                    border-color: rgba(225,177,44,0.95);
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), 0 0 34px rgba(225,177,44,0.34);
                }

                .hero-action-button.cyan {
                    border-color: rgba(64,210,255,0.88);
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), 0 0 34px rgba(64,210,255,0.26);
                }

                .hero-action-button.green {
                    border-color: rgba(68,215,182,0.88);
                    box-shadow: 0 24px 58px rgba(0,0,0,0.55), 0 0 34px rgba(68,215,182,0.26);
                }

                @keyframes heroActionPulse {
                    0%, 100% { transform: translateY(0); filter: brightness(1); }
                    50% { transform: translateY(-2px); filter: brightness(1.16); }
                }

                @keyframes heroActionShine {
                    0%, 38% { transform: translateX(-120%); }
                    62%, 100% { transform: translateX(120%); }
                }



                .home-live-section {
                    max-width: 1280px;
                    margin: 0 auto;
                    padding: 76px 24px 88px;
                    position: relative;
                    z-index: 1;
                }

                .home-live-header {
                    display: flex;
                    justify-content: space-between;
                    gap: 24px;
                    align-items: flex-end;
                    margin-bottom: 24px;
                }

                .home-live-header h2 {
                    margin: 10px 0 8px;
                    color: var(--text-primary);
                    font-size: clamp(28px, 4vw, 44px);
                    line-height: 1.18;
                    letter-spacing: 0;
                }

                .home-live-header p {
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 15px;
                    line-height: 1.6;
                }

                .home-live-status {
                    display: grid;
                    gap: 4px;
                    min-width: 138px;
                    padding: 12px 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(68,215,182,0.28);
                    background: rgba(68,215,182,0.08);
                    text-align: right;
                }

                .home-live-status strong {
                    color: #44d7b6;
                    font-size: 13px;
                    font-weight: 900;
                }

                .home-live-status span {
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                }

                .home-live-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 22px;
                }

                .home-live-metrics div {
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.10);
                    background: rgba(255,255,255,0.04);
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 12px;
                }

                .home-live-metrics strong {
                    color: #fff;
                    font-size: 28px;
                    font-weight: 900;
                }

                .home-live-metrics span {
                    color: var(--text-secondary);
                    font-size: 13px;
                    font-weight: 700;
                }

                .home-live-grid {
                    display: grid;
                    grid-template-columns: minmax(260px, 0.95fr) minmax(420px, 1.5fr) minmax(260px, 0.9fr);
                    gap: 18px;
                    align-items: stretch;
                }

                .home-live-group {
                    min-width: 0;
                    display: grid;
                    align-content: start;
                    gap: 12px;
                }

                .home-live-group-title {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    min-height: 30px;
                    gap: 12px;
                }

                .home-live-group-title span {
                    color: #fff;
                    font-weight: 900;
                    font-size: 15px;
                }

                .home-live-group-title a,
                .home-live-group-title small {
                    color: var(--gold-primary);
                    font-size: 12px;
                    font-weight: 800;
                    text-decoration: none;
                    white-space: nowrap;
                }

                .home-golden-list {
                    display: grid;
                    gap: 12px;
                }

                .home-golden-card,
                .home-source-panel,
                .home-proof-card {
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.12);
                    background: rgba(12,18,28,0.72);
                    box-shadow: 0 18px 46px rgba(0,0,0,0.18);
                }

                .home-golden-card {
                    min-height: 142px;
                    display: grid;
                    grid-template-columns: 52px minmax(0, 1fr);
                    gap: 12px;
                    padding: 16px;
                }

                .home-golden-rank {
                    width: 44px;
                    height: 44px;
                    border-radius: 8px;
                    background: rgba(244,201,93,0.14);
                    color: #f4c95d;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 900;
                    font-size: 13px;
                }

                .home-golden-card strong {
                    display: block;
                    color: #fff;
                    font-size: 16px;
                    line-height: 1.35;
                    margin-bottom: 7px;
                }

                .home-golden-card p {
                    margin: 0 0 10px;
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                    line-height: 1.55;
                }

                .home-golden-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }

                .home-golden-meta span {
                    padding: 4px 7px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.07);
                    color: rgba(255,255,255,0.74);
                    font-size: 11px;
                    font-weight: 800;
                }

                .home-source-tabs {
                    display: flex;
                    flex-wrap: nowrap;
                    gap: 6px;
                    align-items: center;
                    overflow-x: auto;
                    padding-bottom: 2px;
                    scrollbar-width: none;
                }

                .home-source-tabs::-webkit-scrollbar {
                    display: none;
                }

                .home-source-tab {
                    min-height: 42px;
                    flex: 0 0 auto;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 9px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
                    background: rgba(255,255,255,0.045);
                    font: inherit;
                    cursor: pointer;
                    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
                }

                .home-source-tab:hover,
                .home-source-tab.active {
                    transform: translateY(-1px);
                    background: rgba(255,255,255,0.09);
                }

                .home-source-tab span,
                .home-source-panel-head > span {
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                    flex: 0 0 auto;
                }

                .home-source-tab strong {
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .home-source-tab small {
                    min-width: 18px;
                    padding: 2px 5px;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.10);
                    color: rgba(255,255,255,0.72);
                    font-size: 11px;
                    font-weight: 900;
                    text-align: center;
                }

                .home-source-panel {
                    min-height: 364px;
                    padding: 16px;
                    display: grid;
                    align-content: start;
                    gap: 14px;
                }

                .home-source-panel-head {
                    display: grid;
                    grid-template-columns: 12px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 10px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid rgba(255,255,255,0.10);
                }

                .home-source-panel-head strong {
                    display: block;
                    color: #fff;
                    font-size: 17px;
                    font-weight: 900;
                }

                .home-source-panel-head p {
                    margin: 3px 0 0;
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    line-height: 1.4;
                }

                .home-source-panel-head small {
                    color: rgba(255,255,255,0.58);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .home-source-list {
                    display: grid;
                    gap: 10px;
                }

                .home-source-row {
                    min-height: 72px;
                    display: grid;
                    grid-template-columns: 38px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 11px;
                    padding: 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(5,10,18,0.34);
                }

                .home-source-row-rank {
                    width: 34px;
                    height: 34px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255,255,255,0.09);
                    color: #fff;
                    font-size: 12px;
                    font-weight: 900;
                }

                .home-source-row strong {
                    display: block;
                    color: #fff;
                    font-size: 15px;
                    line-height: 1.34;
                    letter-spacing: 0;
                    overflow-wrap: anywhere;
                }

                .home-source-row p {
                    margin: 5px 0 0;
                    color: rgba(255,255,255,0.62);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .home-source-row > small {
                    padding: 5px 7px;
                    border-radius: 999px;
                    background: rgba(244,201,93,0.12);
                    color: #f4c95d;
                    font-size: 11px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .home-proof-card {
                    overflow: hidden;
                }

                .home-proof-card img {
                    width: 100%;
                    height: 255px;
                    display: block;
                    object-fit: contain;
                    background: rgba(0,0,0,0.28);
                    padding: 12px;
                }

                .home-proof-card div {
                    padding: 16px;
                }

                .home-proof-card span {
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                }

                .home-proof-card strong {
                    display: block;
                    margin: 6px 0;
                    color: #fff;
                    font-size: 17px;
                    line-height: 1.35;
                }

                .home-proof-card p {
                    margin: 0;
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                    line-height: 1.55;
                }

                .hero-proof-stage {
                    position: relative;
                    width: 100%;
                    min-height: 0;
                    height: clamp(500px, calc(100vh - 280px), 540px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    isolation: isolate;
                    overflow: hidden;
                    border-radius: 8px;
                    opacity: 0.92;
                    pointer-events: auto;
                }

                .hero-proof-stage::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: 8px;
                    border: 1px solid rgba(201,168,76,0.28);
                    background:
                        linear-gradient(135deg, rgba(12,18,28,0.78), rgba(5,8,12,0.52)),
                        linear-gradient(90deg, rgba(244,201,93,0.10), rgba(68,215,182,0.08));
                    box-shadow: 0 26px 90px rgba(0,0,0,0.30);
                    pointer-events: none;
                    z-index: -2;
                }

                .proof-summary {
                    position: absolute;
                    left: 16px;
                    top: 16px;
                    width: calc(100% - 32px);
                    display: grid;
                    gap: 6px;
                    padding: 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.14);
                    background: rgba(8,13,18,0.78);
                    backdrop-filter: blur(14px);
                    z-index: 4;
                    box-shadow: 0 18px 46px rgba(0,0,0,0.26);
                }

                .proof-summary span {
                    color: #f4c95d;
                    font-size: 12px;
                    font-weight: 900;
                }

                .proof-summary strong {
                    color: #fff;
                    font-size: 18px;
                    line-height: 1.35;
                }

                .proof-summary small {
                    color: rgba(255,255,255,0.62);
                    font-size: 12px;
                    line-height: 1.45;
                }

                .proof-image-shell {
                    width: 100%;
                    height: 390px;
                    position: relative;
                    z-index: 1;
                    overflow: hidden;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.16);
                    background:
                        linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)),
                        #080d12;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 26px 90px rgba(0,0,0,0.34);
                }

                .proof-image {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    object-position: center;
                    padding: 18px;
                    opacity: 0;
                    transform: translateX(22px) scale(0.985);
                    transition: opacity 0.52s ease, transform 0.52s ease;
                }

                .proof-image.active {
                    opacity: 1;
                    transform: translateX(0) scale(1);
                }

                .proof-dots {
                    position: absolute;
                    left: 50%;
                    bottom: 22px;
                    transform: translateX(-50%);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    z-index: 5;
                }

                .proof-dots button {
                    width: 9px;
                    height: 9px;
                    border: 0;
                    border-radius: 999px;
                    background: rgba(255,255,255,0.32);
                    cursor: pointer;
                    transition: width 0.2s ease, background 0.2s ease;
                }

                .proof-dots button.active {
                    width: 28px;
                    background: #f4c95d;
                }

                @media (max-width: 1080px) {
                    .home-live-grid {
                        grid-template-columns: 1fr;
                    }

                    .home-source-panel {
                        min-height: 320px;
                    }
                }

                @media (max-width: 900px) {
                    .hero-realtime-board {
                        width: 100%;
                    }

                    .hero-realtime-primary h1 {
                        font-size: clamp(34px, 8vw, 56px);
                    }

                    .home-hero {
                        grid-template-columns: 1fr !important;
                        gap: 28px !important;
                        min-height: auto !important;
                        padding: 100px 20px 56px !important;
                    }

                    .hero-proof-stage {
                        display: none;
                    }

                    .proof-image-shell {
                        width: 100%;
                        height: 460px;
                    }
                }

                @media (max-width: 640px) {
                    .hero-realtime-board {
                        padding: 14px;
                    }

                    .hero-realtime-head {
                        align-items: flex-start;
                        flex-direction: column;
                    }

                    .hero-realtime-head small {
                        margin-left: 0;
                    }

                    .hero-source-panel {
                        min-height: 0;
                        padding: 12px;
                    }

                    .hero-source-body {
                        grid-template-columns: 1fr;
                    }

                    .hero-source-list {
                        max-height: 260px;
                    }

                    .source-insight-panel {
                        display: none;
                    }

                    .hero-action-strip {
                        grid-template-columns: 1fr;
                        margin: 0 auto;
                    }

                    .hero-action-button {
                        width: calc(100% - 58px);
                        justify-self: start;
                        min-height: 78px;
                        padding: 14px 18px;
                    }

                    .hero-action-button strong {
                        font-size: 18px;
                    }

                    .hero-source-panel-head {
                        grid-template-columns: 12px minmax(0, 1fr);
                    }

                    .hero-source-panel-head small {
                        grid-column: 2;
                    }

                    .hero-source-row {
                        grid-template-columns: minmax(0, 1fr) 42px;
                        align-items: start;
                    }

                    .hero-source-row-main {
                        grid-template-columns: 28px minmax(0, 1fr);
                        align-items: start;
                    }

                    .hero-source-row-main > small {
                        grid-column: 2;
                        justify-self: start;
                    }

                    .hero-source-row-search {
                        width: 36px;
                        min-height: 30px;
                        margin: 8px 5px 0 0;
                    }

                    .hero-source-row strong,
                    .hero-source-row p {
                        white-space: normal;
                    }

                    .hero-live-rack-main {
                        align-items: flex-start;
                        flex-direction: column;
                    }

                    .hero-live-rack-main strong {
                        white-space: normal;
                    }


                .home-live-section {
                        padding: 58px 14px 68px;
                    }

                    .home-live-header {
                        display: grid;
                        align-items: start;
                    }

                    .home-live-status {
                        width: 100%;
                        text-align: left;
                    }

                    .home-live-metrics {
                        grid-template-columns: 1fr;
                    }

                    .home-source-tabs {
                        flex-wrap: nowrap;
                        overflow-x: auto;
                        padding-bottom: 2px;
                        scrollbar-width: none;
                    }

                    .home-source-tabs::-webkit-scrollbar {
                        display: none;
                    }

                    .home-source-tab {
                        flex: 0 0 auto;
                    }

                    .home-source-panel {
                        min-height: 0;
                        padding: 14px;
                    }

                    .home-source-panel-head {
                        grid-template-columns: 12px minmax(0, 1fr);
                    }

                    .home-source-panel-head small {
                        grid-column: 2;
                    }

                    .home-source-row {
                        grid-template-columns: 34px minmax(0, 1fr);
                    }

                    .home-source-row > small {
                        grid-column: 2;
                        justify-self: start;
                    }

                    .home-golden-card {
                        grid-template-columns: 44px minmax(0, 1fr);
                        padding: 14px;
                    }

                    .home-hero {
                        padding: 92px 14px 48px !important;
                    }

                    .hero-proof-stage {
                        min-height: 455px;
                        margin-top: 4px;
                    }

                    .hero-proof-stage::before {
                        inset: 18px 0 36px;
                    }

                    .proof-summary {
                        display: none;
                    }

                    .proof-image-shell {
                        height: 390px;
                    }

                    .proof-image {
                        padding: 12px;
                    }

                    .proof-dots {
                        bottom: 38px;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .hero-action-button,
                    .hero-action-button::before {
                        animation: none;
                    }
                }
            `}</style>
        </>
    );
}

export default IndexPage;
