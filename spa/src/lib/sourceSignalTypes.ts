/**
 * 실시간 소스 신호의 형태. 홈(IndexPage)과 브리프 모달, /leword 화면이 같이 쓴다.
 *
 * 스냅샷(`public/data/source-signals.json`)을 만드는 쪽은 크론이고, 여기 적힌
 * 필드는 전부 **수집된 실측값**이다. 화면에서 새로 계산해 채워 넣지 않는다.
 */

export type SourceLaneId = 'popular' | 'naver' | 'google' | 'daum' | 'nate' | 'zum' | 'sports' | 'policy' | 'issue';

export type SourceInsight = {
    /** 배치가 계산해 담아준다. 여기서 다시 만들지 않는다. */
    titles?: { seo?: string; home?: string; topic?: string; topicGroup?: string; summary?: string };
    facts?: Array<{ text: string; sourceIndex: number }>;
    links?: Array<{ url: string; press: string; publishedAt?: string | null }>;
    images?: string[];
    press?: string[];
    headlines?: string[];
    extraction?: 'playwright' | 'search-card';
    collectedAt?: string;
    /** 브리프에 실린 기사 중 가장 최신 발행 시각 — 즉석 브리프(최신순)가 채운다. */
    latestArticleAt?: string;
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
    /** 크롤링한 원본 기사 주소 — 있으면 '검색' 대신 기사로 바로 간다(2026-08-19). */
    articleUrl?: string;
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
    /**
     * 이 레인만의 갱신 시각. 레인마다 공급원이 달라 신선도가 다르다 —
     * 네이버 실검은 화면이 Worker 에서 바로 받아 오고(수 분), 나머지는 크론이 커밋한
     * 정적 스냅샷이다(수 시간). 하나의 시각으로 뭉뚱그리면 어느 한쪽이 거짓말이 된다.
     */
    updatedAt?: string;
};

/** 레인별 원본 검색 주소. 브리프의 사실을 사용자가 직접 확인하는 경로다. */
export const SOURCE_SEARCH_PATHS: Record<SourceLaneId, (keyword: string) => string> = {
    // 인기 레인 원본은 네이트 실시간 이슈 — 네이트 뉴스 검색이 원문 확인 경로다.
    popular: (keyword) => `https://news.nate.com/search?q=${encodeURIComponent(keyword)}`,
    google: (keyword) => `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
    naver: (keyword) => `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`,
    daum: (keyword) => `https://search.daum.net/search?w=tot&q=${encodeURIComponent(keyword)}`,
    nate: (keyword) => `https://search.nate.com/search/all.html?q=${encodeURIComponent(keyword)}`,
    zum: (keyword) => `https://search.zum.com/search.zum?query=${encodeURIComponent(keyword)}`,
    // 스포츠는 뉴스 검색이 원본 확인에 가장 빠르다 — 선수·경기 이슈라서다.
    sports: (keyword) => `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}`,
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

/**
 * 잘린 꼬리를 걷어내고 **마지막 완결 문장까지만** 남긴다.
 *
 * 왜 필요한가 (사장님 지적, 2026-08-10):
 *   검색 API 가 주는 요약은 정해진 길이에서 그냥 끊어 "…" 를 붙인다. 그대로
 *   띄우면 "…압도적인 구위를 뽐냈다...." 처럼 끝나서 대충 만든 화면으로 보인다.
 *
 * 왜 "끝까지"가 아니라 "완결 문장까지"인가:
 *   원문 문단 전체는 우리에게 없다 — 출처가 잘라서 준 것이다. 없는 뒷부분을
 *   지어내는 대신, **온전한 문장만 남기고 잘린 조각은 버린다.** 짧아지더라도
 *   끊긴 자국은 안 보인다.
 *
 * 온전한 문장이 하나도 없으면 **빈 문자열**을 준다. 부르는 쪽이 제목으로 갈아끼우게
 * 하려는 것이다 — 중간에서 끊긴 조각을 띄우느니 완결된 제목이 낫다.
 */
export function trimToCompleteSentence(value: string): string {
    const text = String(value || '').trim();
    if (!text) return '';

    // 꼬리의 말줄임표부터 걷어낸다. 마침표 네 개(".....")로 오는 경우도 있다.
    const withoutTail = text.replace(/(?:\.{2,}|…)+\s*$/, '').trim();
    if (!withoutTail) return '';

    // 종결 부호나 한국어 종결어미로 끝나면 그대로 온전한 문장이다.
    if (/(?:[.!?]|[다요음함됨죠네까])["”'’)\]]*$/.test(withoutTail)) return withoutTail;

    // 아니면 마지막 문장 경계까지 되돌린다.
    const lastBoundary = Math.max(
        withoutTail.lastIndexOf('. '),
        withoutTail.lastIndexOf('! '),
        withoutTail.lastIndexOf('? '),
        withoutTail.lastIndexOf('다 '),
    );
    if (lastBoundary <= 0) return '';
    return withoutTail.slice(0, lastBoundary + 1).trim();
}
