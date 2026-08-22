/**
 * 유튜브 급상승 → 네이버 빈자리.
 *
 * 왜 만들었나: 예전 유튜브 탭은 유튜브가 이미 보여주는 인기 목록을 그대로
 * 다시 보여 줬다. 유튜브 앱을 켜면 똑같은 걸 본다 — 우리가 낼 값이 없었다
 * (사장님 판정 2026-08-20 "유튜브는 별로 실용적이지 않은 것 같은데").
 *
 * 그래서 방향을 바꾼다. 영상 목록이 아니라 **글감**을 준다:
 *   ① 유튜브 한국 급상승 영상을 가져온다
 *   ② 제목에서 덩어리를 뽑아 네이버 자동완성에 물어 **실제 검색어**를 얻는다
 *      (제목은 문장이라 그대로는 검색어가 아니다 — 잘라 쓰면 쓰레기가 나온다)
 *   ③ 그 검색어의 검색량·문서수를 실측한다
 *   ④ "찾는 사람은 있는데 글이 없는" 것만 남긴다
 *
 * 지금 터지는 중인데 네이버에 아직 글이 없는 자리 — 그게 선점이다.
 * 모든 숫자는 실측이다. 못 재면 그 행을 버린다.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    fetchAutocomplete, fetchDocumentCount, fetchVolumeDetails,
    missingNaverCredentials, sleep,
} from './lib/naver-measure.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'spa/public/data/youtube-gap.json');

const YOUTUBE_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();

/* 카테고리 — 블로그 글감이 나오는 것만. 음악은 글로벌 뮤비라 재료가 안 된다. */
const CATEGORIES = ['24', '25', '22', '26', '1', '17', '20', '28'];

/**
 * 숏폼인지 확인한다.
 *
 * 재생시간으로는 못 가린다 — 급상승에 오르는 예고편·뮤비가 1~3분이라 짧지만
 * 숏폼이 아니다(실측). 유튜브가 /shorts/ 주소를 200 으로 받아 주는지가
 * 유일하게 확실한 신호다. 숏폼이 아니면 watch 로 303 리다이렉트한다.
 */
async function isShortForm(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/shorts/${videoId}`, { method: 'HEAD', redirect: 'manual' });
        return response.status === 200;
    } catch {
        return null; // 못 재면 모른다고 둔다 — 짐작으로 분류하지 않는다
    }
}

/** 빈자리 판정. 찾는 사람이 있고(검색량), 글이 적어야(문서수) 자리다. */
const MIN_VOLUME = Number(process.env.YTGAP_MIN_VOLUME || 200);
const MAX_DOCS = Number(process.env.YTGAP_MAX_DOCS || 5000);
const MIN_RATIO = Number(process.env.YTGAP_MIN_RATIO || 1);
const MAX_ROWS = Number(process.env.YTGAP_MAX_ROWS || 150);
/** 영상 하나가 목록을 도배하지 못하게. */
const MAX_PER_VIDEO = Number(process.env.YTGAP_MAX_PER_VIDEO || 2);

/*
 * 실측에 쓸 시간 상한(사장님 지적 2026-08-22 "며칠째 같은 것만 나온다").
 *
 * 무슨 일이 있었나: 크론 한 판은 25분인데 이 수집기가 자동완성 검색어
 * 1,074개를 전부 실측하려다 17분을 쓰고 잘렸다. 잘리면 job 이 통째로
 * 취소되어, **이미 다 끝난 지식인·황금보드 수집물까지 커밋되지 못했다**.
 * 그래서 60회 연속 cancelled — 화면의 모든 판이 이틀째 같은 자리에 멈췄다.
 *
 * 예산을 넘기면 거기까지 잰 것으로 저장한다. 몇 개를 못 쟀는지는 반드시
 * 로그에 남긴다 — 조용히 자르면 "다 봤다"로 읽히기 때문이다.
 */
const BUDGET_MS = Number(process.env.YTGAP_BUDGET_MS || 8 * 60_000);
const STARTED_AT = Date.now();
const overBudget = () => Date.now() - STARTED_AT > BUDGET_MS;

/*
 * 제목 맨 앞이 흔한 부사면 자동완성이 엉뚱한 데로 샌다 — "과연" 을 물으면
 * "과연한우" 가 온다(실측). 사람 이름·작품명이 아닌 게 확실한 것만 막는다.
 */
const STOP_LEADS = new Set([
    '과연', '진짜', '결국', '이제', '오늘', '드디어', '충격', '단독', '속보', '긴급',
    '방금', '역대급', '레전드', '실화', 'full', 'live', 'mv', 'official', 'shorts',
]);

/*
 * 글감 주제 — 유튜브 카테고리와 별개의 축(사장님 지시 2026-08-21: 뉴스·스포츠·
 * 복지/정책/지원금·AI·쇼핑 위주로 글감을 찾는다). 복지·AI 는 유튜브 분류에
 * 없으므로 검색어·확장어의 실제 낱말로 판정한다. 판정 근거 낱말만 쓰고,
 * 없으면 주제를 안 붙인다 — 억지로 분류하지 않는다.
 */
const POLICY_TERMS = [
    '지원금', '보조금', '환급', '정책', '복지', '수당', '연금', '바우처',
    '소비쿠폰', '민생회복', '신청방법', '신청기간', '지급일', '근로장려금',
    '기초연금', '청년도약', '내일배움', '육아휴직', '출산지원',
];
/*
 * AI 는 두 글자라 부분일치가 오탐을 만든다 — 실측: 웹툰 검색어의 확장어
 * "…결혼했다 ai" 하나로 그 행 전체가 AI 글감이 됐다. 그래서 AI 만은
 * ① 키워드 자체에서 ② 낱말 경계로 판정한다.
 */
const AI_RE = /(^|[^a-z0-9])(ai|챗gpt|gpt|인공지능|클로드|제미나이|gemini|미드저니|딥페이크|생성형|오픈ai|openai|코파일럿)([^a-z0-9]|$)/;

/** 검색어(+정책은 확장어까지)에서 주제를 판정한다. 쇼핑은 낱말이 아니라 광고경쟁 실측으로. */
function topicsOf(keyword, expansions, compIdx) {
    const haystack = [keyword, ...expansions].join(' ').toLowerCase();
    const topics = [];
    if (POLICY_TERMS.some((term) => haystack.includes(term))) topics.push('policy');
    if (AI_RE.test(keyword.toLowerCase())) topics.push('ai');
    /*
     * 제휴·쇼핑각 — 쇼핑 검색 API 가 2026-07-31 종료돼 상품수 실측이 불가능하다.
     * 남은 실측은 검색광고 경쟁도: 광고주가 입찰로 몰리는 검색어('높음')는
     * 돈이 걸린 검색어다. 추정이 아니라 네이버가 준 값 그대로다.
     */
    if (compIdx === '높음') topics.push('shopping');
    return topics;
}

const log = (message) => console.log(message);

/** 제목을 구분자로 잘라 '검색될 법한 덩어리'를 만든다. 판단은 자동완성이 한다. */
function chunksOf(title) {
    return String(title)
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ' ')
        .split(/[|/[\]()《》〈〉'"“”‘’•·,!?~\-–—_:;#]+/)
        .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
        .filter((chunk) => chunk.length >= 2);
}

/** 덩어리의 앞 1~3 어절 — 개체 이름은 거의 앞에 온다. */
function leadsOf(chunk) {
    const words = chunk.split(' ');
    const leads = [];
    for (let count = 1; count <= Math.min(3, words.length); count += 1) {
        const lead = words.slice(0, count).join(' ');
        if (lead.length >= 2 && lead.length <= 20 && !STOP_LEADS.has(lead.toLowerCase())) leads.push(lead);
    }
    return leads;
}

/**
 * 자동완성 결과 중 후보로 **시작하는** 것만 취한다.
 *
 * 경계까지 봐야 한다. "도파" 로 물으면 "도파민 뜻" 이 오는데 이건 다른 말이다
 * (실측). 후보 다음이 공백이거나 끝일 때만 같은 말로 친다.
 */
function suggestionsFor(lead, suggestions) {
    const head = lead.toLowerCase();
    return suggestions.filter((suggestion) => {
        const text = suggestion.toLowerCase();
        if (!text.startsWith(head)) return false;
        const next = text.charAt(head.length);
        return next === '' || next === ' ';
    });
}

async function trendingVideos(categoryId) {
    const url = 'https://www.googleapis.com/youtube/v3/videos'
        + `?part=snippet,statistics&chart=mostPopular&regionCode=KR&maxResults=25&key=${YOUTUBE_KEY}`
        + (categoryId ? `&videoCategoryId=${categoryId}` : '');
    try {
        const response = await fetch(url);
        const data = await response.json();
        // 한국 급상승에 없는 카테고리는 404 를 준다 — 빈 배열로 넘긴다.
        if (!response.ok || !Array.isArray(data.items)) return [];
        return data.items.map((item) => ({
            videoId: item.id,
            title: String(item.snippet?.title || ''),
            channel: String(item.snippet?.channelTitle || ''),
            publishedAt: String(item.snippet?.publishedAt || ''),
            thumbnail: item.snippet?.thumbnails?.medium?.url || '',
            viewCount: Number(item.statistics?.viewCount) || null,
            categoryId,
        }));
    } catch {
        return [];
    }
}

async function main() {
    if (!YOUTUBE_KEY) {
        log('YOUTUBE_API_KEY 없음 — 건너뜁니다(기존 파일 유지).');
        return;
    }
    const missing = missingNaverCredentials();
    if (missing.length > 0) {
        log(`네이버 자격증명 없음(${missing.join(', ')}) — 건너뜁니다(기존 파일 유지).`);
        return;
    }

    // ① 급상승 영상
    const videos = [];
    const seenVideo = new Set();
    for (const categoryId of CATEGORIES) {
        for (const video of await trendingVideos(categoryId)) {
            if (seenVideo.has(video.videoId)) continue;
            seenVideo.add(video.videoId);
            videos.push(video);
        }
        await sleep(120);
    }
    /*
     * 롱폼·숏폼은 뜨는 방식이 달라 따로 봐야 한다(사장님 지시). 여기서 한 번만 잰다.
     * 단계 마감을 넘기면 나머지는 form 을 비워 둔다 — 모르는 것을 짐작하지 않고,
     * 뒤에 올 검색량·문서수 실측 예산을 지킨다(그게 빈자리 판정의 본체다).
     */
    const formDeadline = STARTED_AT + BUDGET_MS * 0.25;
    let formSkipped = 0;
    /*
     * 여러 줄로 나눠 받는다. 한 줄로 172편을 돌면 3분이 넘어 82편이 잘렸다(실측).
     * HEAD 요청 하나씩이라 서버 부담이 작고, 유튜브 제 도메인이라 예의 문제도 없다.
     */
    let formCursor = 0;
    const formLane = async () => {
        while (formCursor < videos.length) {
            const video = videos[formCursor++];
            if (Date.now() > formDeadline) { video.form = ''; formSkipped += 1; continue; }
            const short = await isShortForm(video.videoId);
            video.form = short === null ? '' : (short ? 'short' : 'long');
            await sleep(60);
        }
    };
    await Promise.all(Array.from({ length: 6 }, formLane));
    if (formSkipped > 0) log(`!! 숏폼 판정 단계 상한 — ${formSkipped}편은 폼을 못 쟀습니다(빈 값으로 둡니다)`);
    const shortCount = videos.filter((video) => video.form === 'short').length;
    log(`급상승 영상 ${videos.length}편 (숏폼 ${shortCount} · 롱폼 ${videos.length - shortCount})`);
    if (videos.length === 0) return;

    // ② 제목 → 자동완성 → 실제 검색어
    /** 키워드 → 그 키워드를 만들어 낸 영상(제일 먼저 만난 것). */
    const source = new Map();
    /*
     * 이 단계가 예산을 다 먹던 곳이다(실측 2026-08-22): 영상 172편 x 최대 8덩어리
     * = 자동완성 1,300여 회를 부르느라 3분 45초를 썼고, 정작 검색량·문서수를
     * 잴 시간이 남지 않아 "빈자리 0건"이 발행됐다. 마감을 걸고 몇 편을 못 봤는지 남긴다.
     */
    const expandDeadline = STARTED_AT + BUDGET_MS * 0.5;
    let videosSkipped = 0;
    /*
     * 같은 덩어리를 여러 영상이 공유한다(시리즈·재방송 제목). 한 번 물은 것은
     * 다시 묻지 않는다 — 이것만으로 호출이 눈에 띄게 준다.
     */
    // 약속을 담아 둔다 — 값을 담으면 여러 줄이 동시에 같은 말을 물어본다.
    const acCache = new Map();
    const askAutocomplete = (lead) => {
        if (!acCache.has(lead)) {
            acCache.set(lead, (async () => {
                const matched = suggestionsFor(lead, await fetchAutocomplete(lead));
                await sleep(90);
                return matched;
            })());
        }
        return acCache.get(lead);
    };
    let expandCursor = 0;
    const expandLane = async () => {
        while (expandCursor < videos.length) {
            const video = videos[expandCursor++];
            if (Date.now() > expandDeadline) { videosSkipped += 1; continue; }
            /*
             * 후보 상한 4→8 (사장님 확인 2026-08-20). 4개면 제목 앞쪽 덩어리에서
             * 끊겨 뒤쪽의 진짜 개체를 놓쳤다 — 실측: "과연 둠이 …? ≪어벤져스:
             * 둠스데이≫ …" 에서 '어벤져스 둠스데이'가 잘려 그 영상은 빈손이었다.
             * 자동완성은 무료라 비용은 없고 수집이 조금 느려질 뿐이다.
             */
            const leads = [...new Set(chunksOf(video.title).flatMap(leadsOf))].slice(0, 8);
            for (const lead of leads) {
                const matched = await askAutocomplete(lead);
                // 자동완성이 거의 없으면 사람들이 안 치는 말이다 — 버린다.
                if (matched.length < 2) continue;
                for (const keyword of matched.slice(0, 6)) {
                    if (!source.has(keyword)) source.set(keyword, video);
                }
            }
        }
    };
    // 자동완성은 남의 서버다 — 줄을 4개까지만 쓴다.
    await Promise.all(Array.from({ length: 4 }, expandLane));
    if (videosSkipped > 0) log(`!! 검색어 확장 단계 상한 — 영상 ${videos.length}편 중 ${videosSkipped}편은 못 봤습니다`);
    log(`자동완성이 인정한 검색어 ${source.size}개`);
    if (source.size === 0) return;

    /*
     * ③ 검색량 실측 — 검색광고 API 는 한 번에 5개.
     *
     * 예산을 **나눠 쓴다**(2026-08-22 실측 교훈). 처음엔 한 예산을 통으로 뒀더니
     * 검색어 1,074개 검색량을 재는 데 다 써 버려 문서수를 한 건도 못 재고
     * "빈자리 0건"이 발행됐다. 검색량은 넓게 훑는 단계라 절반까지만 쓰고,
     * 나머지는 자리 판정(문서수)에 남긴다.
     */
    const keywords = [...source.keys()];
    const volumeDeadline = STARTED_AT + BUDGET_MS * 0.75;
    const volumes = new Map();
    let volumeStoppedAt = -1;
    for (let index = 0; index < keywords.length; index += 5) {
        if (Date.now() > volumeDeadline) { volumeStoppedAt = index; break; }
        for (const [name, detail] of await fetchVolumeDetails(keywords.slice(index, index + 5))) volumes.set(name, detail);
        await sleep(220);
    }
    if (volumeStoppedAt >= 0) {
        log(`!! 검색량 단계 상한 — 검색어 ${keywords.length}개 중 ${volumeStoppedAt}개까지만 쟀습니다(나머지 예산은 문서수에 씁니다)`);
    }

    /*
     * ④ 검색량이 기준을 넘은 것만 문서수를 잰다 — 문서수 조회가 더 비싸다.
     * **검색량이 큰 것부터** 잰다. 원래 순서대로 돌면 예산이 끊길 때
     * 뒤쪽의 큰 자리들이 통째로 날아간다.
     */
    const measurable = keywords
        .map((keyword) => ({ keyword, detail: volumes.get(keyword.replace(/\s+/g, '')) }))
        .filter(({ detail }) => detail && Number.isFinite(detail.volume) && detail.volume >= MIN_VOLUME)
        .sort((left, right) => right.detail.volume - left.detail.volume);
    log(`검색량 ${MIN_VOLUME}+ ${measurable.length}개 → 문서수 조회`);

    /*
     * 문서수는 **여러 줄로 나눠** 잰다(사장님 지시 2026-08-22 "대량으로 가져와야
     * 사람들이 보고 글감으로 쓴다").
     *
     * 한 줄로 돌던 회차 실측: 검색량을 넘긴 607개 중 287개만 재고 예산이 끝나
     * 빈자리가 30건에 그쳤다 — 나머지 320개는 아예 못 봤다.
     * 문서수 조회는 응답을 기다리는 시간이 대부분이라 나눠 받으면 그만큼 더 본다.
     * 확장 검색어(자동완성)는 살아남은 행에만 물으므로 같은 줄에서 이어서 한다.
     */
    const rows = [];
    let docChecked = 0;
    let docSkipped = 0;
    let cursor = 0;
    const docLane = async () => {
        while (cursor < measurable.length) {
            const index = cursor;
            cursor += 1;
            const { keyword, detail } = measurable[index];
            const searchVolume = detail.volume;
            // 자리가 넉넉히 모였거나 예산을 넘겼으면 멈춘다.
            if (overBudget() || rows.length >= MAX_ROWS * 3) { docSkipped += 1; continue; }
            docChecked += 1;
            const documentCount = await fetchDocumentCount(keyword);
            await sleep(140);
            if (!Number.isFinite(documentCount) || documentCount > MAX_DOCS) continue;
            // 문서수 0 은 자리가 아니라 아무도 안 쓰는 말일 때가 많다 — 비율로 거른다.
            const ratio = documentCount > 0 ? searchVolume / documentCount : searchVolume;
            if (ratio < MIN_RATIO) continue;
            const video = source.get(keyword);
            /*
             * 확장 검색어 — 이 검색어에서 뻗어 나가는 실제 검색어들.
             * 여기서도 자동완성이 공급원이다. 우리가 조합해 만들면 아무도 안 치는
             * 말이 섞인다. 살아남은 행에만 물어 호출을 아낀다.
             */
            const expansions = suggestionsFor(keyword, await fetchAutocomplete(keyword))
                .filter((suggestion) => suggestion !== keyword)
                .slice(0, 6);
            await sleep(100);
            rows.push({
                keyword,
                expansions,
                searchVolume,
                /** 광고 경쟁도 실측('높음'/'중간'/'낮음') — 쇼핑각 판정의 근거. */
                compIdx: detail.compIdx || '',
                topics: topicsOf(keyword, expansions, detail.compIdx),
                documentCount,
                ratio: Math.round(ratio * 10) / 10,
                video: {
                    videoId: video.videoId, title: video.title, channel: video.channel,
                    thumbnail: video.thumbnail, viewCount: video.viewCount, publishedAt: video.publishedAt,
                    categoryId: video.categoryId, form: video.form || '',
                },
            });
        }
    };
    // 네이버 API 다 — 줄을 5개까지만 쓴다(하루 한도보다 초당 쏠림이 먼저 걸린다).
    await Promise.all(Array.from({ length: 5 }, docLane));

    if (docSkipped > 0) {
        log(`!! 문서수 실측 ${docChecked}건 · 상한에 걸려 건너뜀 ${docSkipped}건 (${Math.round((Date.now() - STARTED_AT) / 1000)}초 경과)`);
    }

    // 자리가 넓은 순 — 검색량 대비 글이 적을수록 앞이다.
    rows.sort((left, right) => right.ratio - left.ratio);

    /*
     * 한 영상이 목록을 도배하지 못하게 막는다(사장님 지적 2026-08-20
     * "같은 소스로 만들었네?"). 영상 하나에서 최우수산 / 최우수산 재방송 /
     * 최우수산 시청률 이 줄줄이 나와 화면이 같은 썸네일로 채워졌다.
     * 자리가 제일 넓은 것부터 담되 영상당 둘까지만 — 공급은 172편이라 넉넉하다.
     */
    const perVideo = new Map();
    const kept = [];
    for (const row of rows) {
        const used = perVideo.get(row.video.videoId) || 0;
        if (used >= MAX_PER_VIDEO) continue;
        perVideo.set(row.video.videoId, used + 1);
        kept.push(row);
        if (kept.length >= MAX_ROWS) break;
    }

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({
        collectedAt: new Date().toISOString(),
        gate: { minVolume: MIN_VOLUME, maxDocs: MAX_DOCS, minRatio: MIN_RATIO },
        videoCount: videos.length,
        candidateCount: source.size,
        rows: kept,
    }, null, 1), 'utf8');
    log(`빈자리 ${kept.length}건 발행 → ${OUT}`);
    kept.slice(0, 8).forEach((row) => log(`  · ${row.keyword} — 검색 ${row.searchVolume} / 문서 ${row.documentCount} (비율 ${row.ratio})`));
}

main().catch((error) => {
    console.error('유튜브 빈자리 수집 실패:', error);
    process.exitCode = 0; // 크론의 다른 단계를 막지 않는다
});
