/**
 * 홈판 신호 화면 모델 — 라벨 · 미측정 표기 · 필터 · 정렬(순수 함수, node --test).
 *
 * 수치는 PC 앱이 잰 실측 · 단순 산술 그대로다. 못 잰 값은 '미측정'이고 0 으로 채우지 않는다.
 * 확률 · 점수 칸은 없다 — 판정은 사유 코드를 사람 말로 옮겨 보여 줄 뿐이다.
 */

export const UNMEASURED = '미측정';

export const WINDOW_LABEL = Object.freeze({
    OPENING: '열리는 중', OPEN: '열림', NARROWING: '좁아지는 중', CLOSED: '닫힘', UNKNOWN: '판정 불가',
});

export const STATUS_LABEL = Object.freeze({
    NOW: '지금 쓸 만함', EARLY: '이른 신호', WATCH: '지켜보기', LATE: '늦음', DROP: '버림',
});

export const CATEGORY_LABEL = Object.freeze({
    entertainment: '연예 · 방송', sports: '스포츠', money: '돈 · 경제', house: '집 · 부동산', car: '자동차', tech: 'IT · 기기',
    food: '음식', travel: '여행', work: '직장', family: '가족 · 육아', health: '건강', policy: '정책 · 사회',
    incident: '사건 · 사고', weather: '날씨', unknown: '미분류',
});

export const TENSION_LABEL = Object.freeze({
    number_conflict: '숫자 충돌', relationship_shift: '관계 변화', expectation_break: '예상 밖', action_reversal: '번복',
    identity_contrast: '정체 대비', past_vs_now: '과거와 지금', result_first: '결과 먼저', scale_mismatch: '규모 불일치', hidden_reason: '숨은 이유',
});

export const FUN_GAP_LABEL = Object.freeze({
    unexpected_fact: '예상 밖 사실', surprising_number: '놀라운 숫자', relationship_change: '관계 변화', strong_quote: '센 인용',
    visible_contrast: '대비', before_after: '전후', unusual_object_price: '물건 값', outcome_mismatch: '결과 먼저',
    socially_tellable: '한 줄로 전해짐', visual_curiosity: '사진 궁금증',
});

export const STRATEGY_LABEL = Object.freeze({ 'REAL-FIRST': '실제 사진 우선', 'AI-FIRST': 'AI 이미지 우선', HYBRID: '실제 사진 + AI' });

export const READINESS_LABEL = Object.freeze({
    READY: '썸네일 준비됨', NEEDS_REAL_IMAGE: '실제 사진 필요', NEEDS_AI: 'AI 이미지 필요', WEAK: '썸네일 약함',
});

export const VERDICT_LABEL = Object.freeze({ STOP: '멈추게 함', FLAT: '밋밋함', OVER: '과장' });

export const TRIGGER_LABEL = Object.freeze({
    direct_quote: '직접 인용', number_conflict: '숫자 충돌', relation_shift: '관계 변화', expectation_break: '예상 밖',
    result_first: '결과 먼저', identity_hide: '정체 숨김', object_price: '물건 값', before_after: '전후',
});

export const SOURCE_LABEL = Object.freeze({
    'signal.bz': '네이버 실시간(Signal.bz)', nate: '네이트', google: '구글 트렌드', daum: '다음',
    'naver-news': '네이버 뉴스 검색', 'naver-blog': '블로그 문서수', 'site-issue-board': '사이트 이슈 보드', 'og-image': '기사 대표이미지',
});

export const RIGHTS_LABEL = Object.freeze({
    user_owned: '내가 찍은 사진', official_source: '공식 배포 자료', attribution_needed: '출처 표기 필요', rights_check_required: '권리 확인 필요',
});

export const WATERMARK_LABEL = Object.freeze({ yes: '있음', no: '안 보임', unknown: '모름(직접 확인)' });

const REASON_LABEL = Object.freeze({
    NO_SAMPLE: '기사 표본이 없다',
    NO_AGE: '처음 본 시각이 없다',
    CLONE_SATURATED: '비슷한 제목이 가득하다',
    NO_ALT_ANGLE: '다른 각도가 없다',
    CLONE_RISING: '비슷한 제목 비율이 오르는 중',
    DOC_VELOCITY_HIGH: '블로그 글이 빠르게 늘고 있다',
    EARLY_BUT_DECELERATING: '막 떴지만 글 증가가 꺾였다',
    YOUNG_ISSUE: '뜬 지 얼마 안 됐다',
    DOC_ACCELERATING: '글 증가가 빨라지는 중',
    SOURCES_GROWING: '원천이 늘고 있다',
    RANK_RISING: '순위가 오르는 중',
    SOURCES_OK: '원천 확산 기준 충족',
    CLONE_LOW: '비슷한 제목 비율이 낮다',
    ALT_ANGLE: '다른 각도가 있다',
    FUN_GAP: '재미 근거가 있다',
    CLONE_ABOVE_OPEN: '비슷한 제목 비율이 열림 기준보다 높다',
    SOURCES_UNMEASURED: '원천을 못 쟀다',
    NO_ANGLE_EVIDENCE: '각도 · 재미 근거가 없다',
    SOURCES_BELOW_OPEN: '원천 확산이 기준보다 적다',
    ALL_GATES_PASSED: '모든 관문 통과',
    NO_EVIDENCE: '근거 기사가 없다',
    RUMOR_ONLY: '루머 표지뿐이다',
    FAN_ONLY: '팬만 아는 말이다',
    SINGLE_SOURCE: '매체 하나뿐이다',
    SHALLOW_PAYOFF: '본문에서 풀어 줄 이야기가 적다',
    NO_CARD_HOOK: '카드에 걸 말이 없다',
    WINDOW_NARROWING: '창이 좁아지는 중',
    WINDOW_CLOSED: '창이 닫혔다',
    WINDOW_UNKNOWN: '창을 판정하지 못했다',
    NO_HISTORY: '이전 회차가 없다(이력 쌓는 중)',
    NO_FRESH_DELTA: '새로 나온 사실이 없다',
    NO_NEW_FACT: '30분 전과 비교해 새 사실 말이 없다',
    FEW_SAMPLES: '기사 표본이 적다',
    FEW_PRESS: '매체 수가 적다',
    NO_FUN_GAP: '눈길 끌 대목이 없다',
    NO_SEARCH_FAILED: '카드만 보고는 무슨 얘긴지 바로 안 와닿는다',
    NOT_TELLABLE: '한 줄로 전하기 어렵다',
    CARD_NOT_READY: '첫 카드를 만들 수 없다',
    AGE_CENSORED: '기록 시작 전부터 떠 있었을 수 있다',
    SENSITIVE_INCIDENT: '사건 · 사고 — 피해자 정보 주의',
    UNSUPPORTED_NUMBER: '기사에 없는 숫자',
    HYPE_WORD: '과장어',
    CLICHE: '상투구',
    COMMA_SPLIT: '쉼표로 끊은 제목',
    ARTICLE_COPY: '기사 제목과 너무 비슷함',
    NO_ANCHOR: '기준어가 없음',
    TOO_LONG: '38자 초과',
    ANSWER_LEAK: '답을 다 드러냄',
    NO_HOOK: '첫 걸림 말이 없음',
    AI_SELF_FLAT: 'AI 가 스스로 밋밋하다고 봄',
    AI_SELF_OVER: 'AI 가 스스로 과장이라고 봄',
});

export function reasonLabel(code) {
    return REASON_LABEL[code] ?? String(code || '');
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function formatCount(value, unit = '') {
    return isNumber(value) ? `${value.toLocaleString('ko-KR')}${unit}` : UNMEASURED;
}

/** 부호를 붙인 증감. 0 은 '±0'. */
export function formatSigned(value, unit = '') {
    if (!isNumber(value)) return UNMEASURED;
    const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
    return `${sign}${Math.abs(value).toLocaleString('ko-KR')}${unit}`;
}

/** 순위 변화 — 음수가 상승이다. */
export function formatRankDelta(value) {
    if (!isNumber(value)) return UNMEASURED;
    if (value === 0) return '변화 없음';
    return value < 0 ? `▲${Math.abs(value)}` : `▼${value}`;
}

export function formatDuration(minutes) {
    if (!isNumber(minutes)) return UNMEASURED;
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

/** 나이 — 기록 시작 전부터 떠 있었을 수 있으면 하한으로만 말한다. */
export function formatAge(minutes, censored) {
    if (!isNumber(minutes)) return UNMEASURED;
    return censored ? `기록 이후 ${formatDuration(minutes)} 이상` : `${formatDuration(minutes)} 전 처음 봄`;
}

export function formatSaturation(sampleN, cloneN) {
    if (!isNumber(sampleN) || sampleN === 0) return '기사 표본 없음';
    if (!isNumber(cloneN)) return UNMEASURED;
    return `표본 ${sampleN}건 중 비슷한 제목 ${cloneN}건`;
}

export function formatPresence(presence) {
    if (!presence || !isNumber(presence.total) || presence.total === 0) return UNMEASURED;
    return `최근 60분 수집 ${presence.total}회 중 ${presence.seen}회 등장`;
}

export function formatVelocity(value) {
    return isNumber(value) ? `분당 ${value.toLocaleString('ko-KR')}건` : UNMEASURED;
}

export function formatTime(iso) {
    const ms = Date.parse(String(iso || ''));
    if (!Number.isFinite(ms)) return UNMEASURED;
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

export const DEFAULT_FILTERS = Object.freeze({
    status: 'active', category: 'all', window: 'all', period: 'all',
    funGap: false, noSearch: false, payoff2: false, visualReady: false, query: '',
});

const ACTIVE_STATUSES = new Set(['NOW', 'EARLY', 'WATCH']);

/**
 * 필터. 기간 필터는 처음 본 시각이 확실한 이슈만 남긴다 — 검열된 나이(기록 이전부터 떠 있었을 수 있음)는
 * 진짜 나이를 모르니 기간 안이라고 말할 수 없다.
 */
export function filterStories(stories, filters = DEFAULT_FILTERS) {
    const query = String(filters.query || '').replace(/\s+/g, '').toLowerCase();
    const period = Number(filters.period);
    return (stories || []).filter((story) => {
        if (filters.status === 'active' && !ACTIVE_STATUSES.has(story.status.state)) return false;
        if (filters.status !== 'active' && filters.status !== 'all' && story.status.state !== filters.status) return false;
        if (filters.category !== 'all' && story.category !== filters.category) return false;
        if (filters.window !== 'all' && story.window.state !== filters.window) return false;
        if (Number.isFinite(period) && period > 0) {
            const age = story.signals.ageMinutes;
            if (story.signals.firstSeenCensored || !isNumber(age) || age > period) return false;
        }
        if (filters.funGap && !(story.funGap || []).length) return false;
        if (filters.noSearch && !story.noSearchPassed) return false;
        if (filters.payoff2 && !(story.payoffCount >= 2)) return false;
        if (filters.visualReady && story.thumbnail.readiness !== 'READY') return false;
        if (query) {
            const haystack = `${story.keyword} ${story.anchor ? story.anchor.text : ''}`.replace(/\s+/g, '').toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    });
}

export const SORT_OPTIONS = Object.freeze([
    { id: 'window', label: '창 순서(기본)' },
    { id: 'age', label: '처음 본 시각(최근 먼저)' },
    { id: 'acceleration', label: '글 증가 가속' },
    { id: 'sources', label: '원천 확산' },
    { id: 'funGap', label: '재미 근거 수' },
]);

function descNullLast(a, b) {
    if (!isNumber(a) && !isNumber(b)) return 0;
    if (!isNumber(a)) return 1;
    if (!isNumber(b)) return -1;
    return b - a;
}

/** 정렬 — 앱이 이미 창 순서로 줬으므로 'window' 는 받은 순서를 지킨다. 같으면 받은 순서. */
export function sortStories(stories, key = 'window') {
    const indexed = (stories || []).map((story, index) => ({ story, index }));
    const compare = {
        window: () => 0,
        // 젊은 것 먼저. 검열된 나이(진짜 나이 모름) · 미측정은 뒤로.
        age: (a, b) => {
            const ageA = a.story.signals.firstSeenCensored ? null : a.story.signals.ageMinutes;
            const ageB = b.story.signals.firstSeenCensored ? null : b.story.signals.ageMinutes;
            if (!isNumber(ageA) && !isNumber(ageB)) return 0;
            if (!isNumber(ageA)) return 1;
            if (!isNumber(ageB)) return -1;
            return ageA - ageB;
        },
        acceleration: (a, b) => descNullLast(a.story.signals.docAcceleration, b.story.signals.docAcceleration),
        sources: (a, b) => descNullLast(a.story.signals.sourceCountNow, b.story.signals.sourceCountNow),
        funGap: (a, b) => (b.story.funGap || []).length - (a.story.funGap || []).length,
    }[key] || (() => 0);
    return indexed.sort((a, b) => compare(a, b) || a.index - b.index).map((row) => row.story);
}

export function countBy(stories, pick) {
    const out = {};
    for (const story of stories || []) {
        const key = pick(story);
        out[key] = (out[key] || 0) + 1;
    }
    return out;
}

/** 원천 상태 한 줄 — 건너뜀(설정 · 키 없음) · 오류(연속 실패) · 정상. */
export function sourceHealth(sources) {
    const rows = (sources || []).map((source) => ({
        name: source.name,
        label: SOURCE_LABEL[source.name] || source.name,
        state: source.skipped ? 'skipped' : source.consecutiveFailures > 0 ? 'error' : 'ok',
        lastSuccessAt: source.lastSuccessAt,
        lastError: source.lastError,
        consecutiveFailures: source.consecutiveFailures,
    }));
    return {
        rows,
        ok: rows.filter((row) => row.state === 'ok').length,
        error: rows.filter((row) => row.state === 'error').length,
        skipped: rows.filter((row) => row.state === 'skipped').length,
    };
}

/** 보정 표 한 칸의 문장 — n 에 따라 보여 줄 수 있는 것만. */
export function calibrationText(group) {
    if (!group) return UNMEASURED;
    if (group.display === 'sample_short') return `표본 부족(${group.n}건 — 5건부터 수치를 보여 줍니다)`;
    const median = isNumber(group.medianRecommend24h) ? `24시간 추천 유입 중앙값 ${group.medianRecommend24h.toLocaleString('ko-KR')}` : '추천 유입 미기록';
    if (group.display === 'counts') return `${group.n}건 중 피드 진입 ${group.entered}건 · ${median} (20건 전에는 비율을 내지 않습니다)`;
    const rate = isNumber(group.entryRate) ? `${Math.round(group.entryRate * 1000) / 10}%` : UNMEASURED;
    const spread = isNumber(group.p25) && isNumber(group.p75) ? ` · 가운데 절반 ${group.p25.toLocaleString('ko-KR')}~${group.p75.toLocaleString('ko-KR')}` : '';
    return `${group.n}건 중 피드 진입 ${group.entered}건(${rate}) · ${median}${spread}`;
}

/** 검사 항목 이름 — 카드만 보고 이해되나 · 첫 카드 · 썸네일. 처음 쓰는 사람도 알아볼 수 있게 쉬운 말로 적는다. */
export const CHECK_LABEL = Object.freeze({
    situation_in_1s: '무슨 분야 이야기인지 바로 보임', immediate_why: '눈길 끄는 대목이 있음', answer_wanted: '본문에서 풀어 줄 답이 있음',
    image_curiosity: '사진이 더 궁금하게 만듦', payoff_beyond_answer: '풀어 줄 이야기가 더 있음',
    anchor_visible: '무엇에 대한 이야기인지 보임', hook_in_first_15: '첫 15자 안에 걸리는 말', answer_hidden: '답을 다 보여 주지 않음',
    image_ready: '쓸 사진이 있음', not_article_copy: '기사 제목을 옮기지 않음',
    hero_exists: '대표 사진 있음', subject_in_1s: '무엇인지 1초에 보임', text_lines_ok: '문구 줄 수 · 길이 적당',
    no_title_copy: '제목과 같은 말 아님', face_object_clear: '얼굴 · 물건을 가리지 않음', rights_noted: '사진 권리 표시',
    mobile_text_short: '휴대폰에서 읽힘',
});

/** 원고 검사 문제 — 앱 draft.ts 의 DRAFT_PROBLEM_LABEL 과 같은 말. */
export const DRAFT_PROBLEM_LABEL = Object.freeze({
    EMPTY: '원고가 비었다', FIRST_LINE_NOT_TITLE: '첫 줄이 "최종 제목:"이 아니다', H3_USED: '### 소제목을 썼다', NO_IMAGE_GUIDE: '이미지 배치 가이드가 없다',
    HASHTAG_COUNT: '해시태그가 5~10개가 아니다', ARTICLE_TONE_OPENING: '첫 세 문장이 기사체다', CARD_PROMISE_LATE: '카드에서 건 말을 초반에 풀지 않았다',
    WATERMARK_REMOVAL: '금지 문장(워터마크 삭제 권유)이 들어갔다',
});

export const DIMENSION_LABEL = Object.freeze({
    storyPattern: '스토리 긴장 유형', triggerType: '제목 트리거', visualStrategy: '이미지 전략', thumbnailType: '썸네일 유형', windowAtPublish: '발행 때 창',
});

export const IMAGE_ROLE_LABEL = Object.freeze({ hero: '대표', proof: '근거', secondary: '보조', context: '맥락' });
export const SUITABILITY_LABEL = Object.freeze({ good: '적합', check: '확인 필요', weak: '약함' });
export const ANGLE_CONFIDENCE_LABEL = Object.freeze({
    high: '근거 넉넉함(표본 10건 이상 · 다른 각도 매체 2곳 이상)', medium: '표본 5건 이상', low: '표본이 적음',
});

/** 보정 표 값 이름 — 차원마다 알맞은 라벨표로 옮긴다. */
export function dimensionValueLabel(dimension, value) {
    const table = { storyPattern: TENSION_LABEL, triggerType: TRIGGER_LABEL, visualStrategy: STRATEGY_LABEL, windowAtPublish: WINDOW_LABEL }[dimension];
    return (table && table[value]) || String(value || '');
}

export const PROVIDERS = Object.freeze([
    { id: '', label: '자동(연동된 순서)' },
    { id: 'claude', label: '클로드' },
    { id: 'codex', label: '코덱스' },
    { id: 'gemini', label: '제미나이' },
    { id: 'grok', label: '그록' },
]);
