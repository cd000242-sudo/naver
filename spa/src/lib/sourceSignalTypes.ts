/**
 * 실시간 소스 신호의 형태. 홈(IndexPage)과 브리프 모달, /leword 화면이 같이 쓴다.
 *
 * 스냅샷(`public/data/source-signals.json`)을 만드는 쪽은 크론이고, 여기 적힌
 * 필드는 전부 **수집된 실측값**이다. 화면에서 새로 계산해 채워 넣지 않는다.
 */

export type SourceLaneId = 'naver' | 'daum' | 'nate' | 'zum' | 'policy' | 'issue';

export type SourceInsight = {
    /** 배치가 계산해 담아준다. 여기서 다시 만들지 않는다. */
    titles?: { seo?: string; home?: string; topic?: string; topicGroup?: string };
    facts?: Array<{ text: string; sourceIndex: number }>;
    links?: Array<{ url: string; press: string }>;
    images?: string[];
    press?: string[];
    headlines?: string[];
    extraction?: 'playwright' | 'search-card';
    collectedAt?: string;
};

export type SourceSignal = {
    id?: string;
    keyword?: string;
    title?: string;
    description?: string;
    rank?: number;
    priority?: number;
    source?: string;
    categoryId?: string;
    createdAt?: string;
    /** 네이버 자동완성 실측 확장 — 크론 스냅샷이 채워준다. 합성 확장 대체용 */
    expansions?: string[];
    /** 원본 기사 게시 경과("3분 전"). 이슈 선점 판단의 근거라 원본 값을 그대로 쓴다. */
    ago?: string;
    agoMinutes?: number;
    /** 절대 게시 시각 표기. 툴팁으로 보여준다. */
    publishedLabel?: string;
    /** 목록에서 받아 온 기사 대표 사진. */
    image?: string;
    /**
     * 이슈 브리프 — 배치가 뉴스 기사에서 뽑아 심는다(brightdata-issue-brief-batch).
     * facts 의 문장은 전부 기사 원문 그대로다. 여기서 새로 쓰거나 합치지 않는다.
     */
    insight?: SourceInsight;
};

export type SourceLaneConfig = {
    id: SourceLaneId;
    label: string;
    accent: string;
    description: string;
};

export type SourceLane = SourceLaneConfig & {
    items: SourceSignal[];
};

/** 레인별 원본 검색 주소. 브리프의 사실을 사용자가 직접 확인하는 경로다. */
export const SOURCE_SEARCH_PATHS: Record<SourceLaneId, (keyword: string) => string> = {
    naver: (keyword) => `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`,
    daum: (keyword) => `https://search.daum.net/search?w=tot&q=${encodeURIComponent(keyword)}`,
    nate: (keyword) => `https://search.nate.com/search/all.html?q=${encodeURIComponent(keyword)}`,
    zum: (keyword) => `https://search.zum.com/search.zum?query=${encodeURIComponent(keyword)}`,
    policy: (keyword) => `https://www.korea.kr/search?srchKeyword=${encodeURIComponent(keyword)}`,
    issue: (keyword) => `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}`,
};

export function buildSourceSearchUrl(laneId: SourceLaneId, keyword: string): string {
    const trimmed = keyword.trim();
    return SOURCE_SEARCH_PATHS[laneId](trimmed || 'LEWORD');
}

/**
 * 수집 과정에서 깨진 문자열을 화면에 올리지 않는다.
 * 인코딩이 어긋나면 "占쏙옙" 같은 글자가 그대로 노출된다.
 */
export function cleanLiveText(value: unknown, fallback: string): string {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const questionMarks = (text.match(/\?/g) || []).length;
    const looksBroken = /[�]|占|揶|醫|怨|筌|嚥|媛|덈떎|섏|ㅼ/.test(text) || questionMarks >= Math.max(3, Math.ceil(text.length / 5));
    return looksBroken ? fallback : text;
}
