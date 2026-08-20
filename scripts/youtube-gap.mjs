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
    fetchAutocomplete, fetchDocumentCount, fetchVolumes,
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
const MAX_ROWS = Number(process.env.YTGAP_MAX_ROWS || 60);
/** 영상 하나가 목록을 도배하지 못하게. */
const MAX_PER_VIDEO = Number(process.env.YTGAP_MAX_PER_VIDEO || 2);

/*
 * 제목 맨 앞이 흔한 부사면 자동완성이 엉뚱한 데로 샌다 — "과연" 을 물으면
 * "과연한우" 가 온다(실측). 사람 이름·작품명이 아닌 게 확실한 것만 막는다.
 */
const STOP_LEADS = new Set([
    '과연', '진짜', '결국', '이제', '오늘', '드디어', '충격', '단독', '속보', '긴급',
    '방금', '역대급', '레전드', '실화', 'full', 'live', 'mv', 'official', 'shorts',
]);

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
    // 롱폼·숏폼은 뜨는 방식이 달라 따로 봐야 한다(사장님 지시). 여기서 한 번만 잰다.
    for (const video of videos) {
        const short = await isShortForm(video.videoId);
        video.form = short === null ? '' : (short ? 'short' : 'long');
        await sleep(80);
    }
    const shortCount = videos.filter((video) => video.form === 'short').length;
    log(`급상승 영상 ${videos.length}편 (숏폼 ${shortCount} · 롱폼 ${videos.length - shortCount})`);
    if (videos.length === 0) return;

    // ② 제목 → 자동완성 → 실제 검색어
    /** 키워드 → 그 키워드를 만들어 낸 영상(제일 먼저 만난 것). */
    const source = new Map();
    for (const video of videos) {
        const leads = [...new Set(chunksOf(video.title).flatMap(leadsOf))].slice(0, 4);
        for (const lead of leads) {
            const matched = suggestionsFor(lead, await fetchAutocomplete(lead));
            await sleep(120);
            // 자동완성이 거의 없으면 사람들이 안 치는 말이다 — 버린다.
            if (matched.length < 2) continue;
            for (const keyword of matched.slice(0, 6)) {
                if (!source.has(keyword)) source.set(keyword, video);
            }
        }
    }
    log(`자동완성이 인정한 검색어 ${source.size}개`);
    if (source.size === 0) return;

    // ③ 검색량 실측 — 검색광고 API 는 한 번에 5개
    const keywords = [...source.keys()];
    const volumes = new Map();
    for (let index = 0; index < keywords.length; index += 5) {
        for (const [name, volume] of await fetchVolumes(keywords.slice(index, index + 5))) volumes.set(name, volume);
        await sleep(220);
    }

    // ④ 검색량이 기준을 넘은 것만 문서수를 잰다 — 문서수 조회가 더 비싸다
    const rows = [];
    for (const keyword of keywords) {
        const searchVolume = volumes.get(keyword.replace(/\s+/g, ''));
        if (!Number.isFinite(searchVolume) || searchVolume < MIN_VOLUME) continue;
        const documentCount = await fetchDocumentCount(keyword);
        await sleep(160);
        if (!Number.isFinite(documentCount) || documentCount > MAX_DOCS) continue;
        // 문서수 0 은 자리가 아니라 아무도 안 쓰는 말일 때가 많다 — 비율로 거른다.
        const ratio = documentCount > 0 ? searchVolume / documentCount : searchVolume;
        if (ratio < MIN_RATIO) continue;
        const video = source.get(keyword);
        /*
         * 확장 키워드 — 이 검색어에서 뻗어 나가는 실제 검색어들.
         * 여기서도 자동완성이 공급원이다. 우리가 조합해 만들면 아무도 안 치는
         * 말이 섞인다. 살아남은 행(60건 남짓)에만 물어 호출을 아낀다.
         */
        const expansions = suggestionsFor(keyword, await fetchAutocomplete(keyword))
            .filter((suggestion) => suggestion !== keyword)
            .slice(0, 6);
        await sleep(120);
        rows.push({
            keyword,
            expansions,
            searchVolume,
            documentCount,
            ratio: Math.round(ratio * 10) / 10,
            video: {
                videoId: video.videoId, title: video.title, channel: video.channel,
                thumbnail: video.thumbnail, viewCount: video.viewCount, publishedAt: video.publishedAt,
                categoryId: video.categoryId, form: video.form || '',
            },
        });
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
