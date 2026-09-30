/**
 * 내 블로그 공개 판(앱 없이 완결) — 내 글 제목 어절 ∩ 사이트 보드 키워드(추천키워드 32주제 · 황금 보드).
 *
 * 값은 전부 실측·매칭 사실·단순 산술이다: 보드가 잰 검색량·문서수·빈자리, 내 글 제목에 그 말이 든 편수.
 * 확률·예상치·임의 주제 분류는 없다(2026-09-30 플랜 C ①).
 */

export interface MyBlogPostTitle { title: string; link?: string; publishedAt?: string | null }

export interface PicksRowInput { keyword: string; searchVolume: number; documentCount: number; ratio?: number }
export interface PicksTopicInput { topic: string; rows: PicksRowInput[] }
export interface GoldenRowInput {
    keyword: string;
    topic: string;
    tierLabel?: string;
    openSlot?: number | null;
    searchVolume: number | null;
    documentCount: number | null;
    evidence?: { text: string }[];
}

export interface MyBlogFitRow {
    keyword: string;
    topic: string;
    /** 어느 보드에서 온 말인가 — 둘 다면 golden 을 앞세운다. */
    source: 'golden' | 'picks';
    searchVolume: number | null;
    documentCount: number | null;
    /** 황금 보드 실측 빈자리(상위 몇 번째). 추천키워드 행은 안 잰 것이라 null. */
    openSlot: number | null;
    tierLabel: string | null;
    /** 키워드 어절 중 내 글 제목에 든 것. */
    matchedWords: string[];
    /** 키워드 어절 수(숫자 시작 어절 제외). */
    wordCount: number;
    /** 그 말이 제목에 든 내 글 편수. */
    myPosts: number;
    /** 예시 제목 최대 2개. */
    sampleTitles: string[];
}

export interface MyBlogWordCount { word: string; posts: number }

/** 어절 — 기호를 떼고 소문자, 두 글자 이상만(앱 today-plan 의 keywordWords 와 같은 규칙). */
export function keywordWords(keyword: string): string[] {
    return String(keyword || '')
        .split(/\s+/)
        .map((token) => token.replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase())
        .filter((token) => token.length >= 2);
}

/** 매칭에 쓰는 어절 — 숫자로 시작하는 어절('2027')은 다른 글에도 흔해 빼되, 전부 숫자면 그대로. */
function matchWords(keyword: string): string[] {
    const words = keywordWords(keyword);
    const named = words.filter((word) => !/^\d/.test(word));
    return named.length > 0 ? named : words;
}

const lowerTitle = (title: string) => String(title || '').toLowerCase();

/**
 * 후보 하나를 내 제목들에 대 본다 — 1~3어절은 전부, 4어절 이상은 하나만 빠져도 '내가 다룬 글'로 센다.
 * 절반 규칙은 '양조간장 501 701 차이'가 '차이' 한 어절로, '기아 ev5'가 '기아'로,
 * '릴 에이블 하이브리드 차이'가 '하이브리드 차이'로 자동차 글에 붙었다(2026-09-30 실측).
 */
function fitFor(keyword: string, titles: string[]): { matchedWords: string[]; wordCount: number; myPosts: number; sampleTitles: string[] } {
    const words = matchWords(keyword);
    if (words.length === 0) return { matchedWords: [], wordCount: 0, myPosts: 0, sampleTitles: [] };
    const need = words.length <= 3 ? words.length : words.length - 1;
    const matched = new Set<string>();
    const samples: string[] = [];
    let myPosts = 0;
    for (const title of titles) {
        const lower = lowerTitle(title);
        const hit = words.filter((word) => lower.includes(word));
        if (hit.length < need) continue;
        myPosts += 1;
        hit.forEach((word) => matched.add(word));
        if (samples.length < 2) samples.push(title);
    }
    return { matchedWords: words.filter((word) => matched.has(word)), wordCount: words.length, myPosts, sampleTitles: samples };
}

const compact = (value: string) => String(value || '').toLowerCase().replace(/\s+/g, '');

/**
 * 보드 두 장 ∩ 내 글 제목 → 내가 이미 다룬 말 중 보드가 잰 것.
 * 순서: 빈자리 실측(황금) 있는 것 → 내 글 편수 → 검색량. 상한 limit.
 */
export function myBlogFitRows(
    titles: MyBlogPostTitle[],
    picks: PicksTopicInput[],
    golden: GoldenRowInput[],
    limit = 30,
): MyBlogFitRow[] {
    const titleTexts = titles.map((post) => post.title).filter((title) => typeof title === 'string' && title.trim());
    if (titleTexts.length === 0) return [];
    const byKey = new Map<string, MyBlogFitRow>();
    const push = (row: MyBlogFitRow) => {
        const key = compact(row.keyword);
        const prev = byKey.get(key);
        if (!prev) { byKey.set(key, row); return; }
        // 두 보드에 다 있으면 황금(빈자리 실측) 쪽을 남기되, 검색량·문서수가 빈 칸이면 다른 쪽 값을 채운다.
        const keep = prev.source === 'golden' ? prev : row.source === 'golden' ? row : prev;
        const other = keep === prev ? row : prev;
        byKey.set(key, {
            ...keep,
            searchVolume: keep.searchVolume ?? other.searchVolume,
            documentCount: keep.documentCount ?? other.documentCount,
        });
    };
    for (const row of golden) {
        const fit = fitFor(row.keyword, titleTexts);
        if (fit.myPosts === 0) continue;
        push({
            keyword: row.keyword, topic: row.topic || '', source: 'golden',
            searchVolume: row.searchVolume ?? null, documentCount: row.documentCount ?? null,
            openSlot: typeof row.openSlot === 'number' ? row.openSlot : null, tierLabel: row.tierLabel || null,
            ...fit,
        });
    }
    for (const topic of picks) {
        for (const row of topic.rows || []) {
            const fit = fitFor(row.keyword, titleTexts);
            if (fit.myPosts === 0) continue;
            push({
                keyword: row.keyword, topic: topic.topic, source: 'picks',
                searchVolume: typeof row.searchVolume === 'number' ? row.searchVolume : null,
                documentCount: typeof row.documentCount === 'number' ? row.documentCount : null,
                openSlot: null, tierLabel: null,
                ...fit,
            });
        }
    }
    return [...byKey.values()]
        .sort((a, b) => {
            const seatA = a.openSlot !== null ? 0 : 1;
            const seatB = b.openSlot !== null ? 0 : 1;
            if (seatA !== seatB) return seatA - seatB;
            if (a.openSlot !== null && b.openSlot !== null && a.openSlot !== b.openSlot) return a.openSlot - b.openSlot;
            if (a.myPosts !== b.myPosts) return b.myPosts - a.myPosts;
            return (b.searchVolume ?? -1) - (a.searchVolume ?? -1);
        })
        .slice(0, limit);
}

/** 내 제목에 자주 든 어절(숫자 시작 제외) — 글 편수 기준 상위 limit. */
export function myTitleWords(titles: MyBlogPostTitle[], limit = 30): MyBlogWordCount[] {
    const counts = new Map<string, number>();
    for (const post of titles) {
        const words = new Set(keywordWords(post.title).filter((word) => !/^\d/.test(word)));
        for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    }
    return [...counts.entries()]
        .map(([word, posts]) => ({ word, posts }))
        .sort((a, b) => b.posts - a.posts || a.word.localeCompare(b.word, 'ko'))
        .slice(0, limit);
}

/** 보드 키워드 중 내 어절과 하나도 안 겹치는 것은 이 판의 대상이 아니다 — 표 머리말에 "보드 N개 중 M개" 로 쓴다. */
export function boardKeywordCount(picks: PicksTopicInput[], golden: GoldenRowInput[]): number {
    const keys = new Set<string>();
    golden.forEach((row) => keys.add(compact(row.keyword)));
    picks.forEach((topic) => (topic.rows || []).forEach((row) => keys.add(compact(row.keyword))));
    return keys.size;
}
