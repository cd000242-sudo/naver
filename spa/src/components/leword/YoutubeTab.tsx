import { useEffect, useState } from 'react';
import { fetchGapTopics, fetchKeywordPostIdeas, fetchYoutubeTrending, formatCount, type KinPostIdea, type LiveTrendingVideo } from '../../lib/keywordApi';
import { bridgePostIdeas } from '../../lib/bridge';
import { loadUserKeys } from '../../lib/userKeys';
import { TabIntro } from './LewordShared';

/**
 * 유튜브 급상승 → 네이버 빈자리.
 *
 * 예전 이 탭은 유튜브 인기 목록을 그대로 다시 보여 줬다. 유튜브 앱을 켜면
 * 똑같은 걸 본다 — 우리가 낼 값이 없었다(사장님 판정 2026-08-20).
 *
 * 지금은 한 줄이 셋으로 나뉜다(사장님 지정 배치):
 *   좌  영상 — 눌러서 그 자리에서 본다
 *   중  검색어와 실측 — 검색량·문서수·부족 배수, 어느 영상에서 나왔는지, 날짜
 *   우  이 검색어로 쓸 수 있는 것 — 확장 검색어와 키워드마다의 제목
 *
 * 확장 검색어는 수집 때 네이버 자동완성으로 실측한 값이고, 제목만 누를 때
 * 구독 엔진으로 만든다. 화면에서 계산하는 숫자는 없다.
 */

type GapRow = {
    keyword: string;
    expansions?: string[];
    searchVolume: number;
    documentCount: number;
    ratio: number;
    /** 광고 경쟁도 실측 — '높음'이면 광고주가 몰리는, 돈 걸린 검색어. */
    compIdx?: string;
    /** 글감 주제(수집 때 판정): policy(복지·정책) · ai · shopping(제휴각). */
    topics?: string[];
    video: {
        videoId: string; title: string; channel: string;
        thumbnail: string; viewCount: number | null; publishedAt: string;
        categoryId?: string; form?: string;
    };
};

/*
 * 유튜브 카테고리 번호 → 사람 말. 급상승에 실제로 오르는 것만 싣는다
 * (여행 19·교육 27 은 한국 급상승에서 404 다).
 */
const CATEGORY_LABEL: Record<string, string> = {
    24: '스타·연예', 25: '뉴스·이슈', 22: '인물·브이로그', 26: '노하우·스타일',
    1: '영화·애니', 17: '스포츠', 20: '게임', 28: 'IT·과학',
};

/*
 * 유튜브 분류를 그대로 믿지 않는다(사장님 지적 2026-08-22 "영화·애니 카테고리가
 * 맞니? 이선민은 개그맨인데").
 *
 * 실측: 유튜브가 준 categoryId 가 1(영화·애니)인데 내용은 예능이었다 —
 *   cat=1 | 아빠로 오해받은 이선민 #이선민 #예능
 *   cat=1 | 카자흐스탄어 아님 #나혼산 #김신영
 *   cat=1 | ... 한 직원의 최후 #숏드라마 #선행 #숏킹
 * 업로더가 정하는 값이라 예능 클립을 영화·애니로 올리는 채널이 많다.
 * 제목·해시태그에 **명확한 낱말**이 있을 때만 덮어쓴다. 애매하면 건드리지 않는다.
 */
const CATEGORY_OVERRIDE: Array<{ id: string; test: RegExp }> = [
    { id: '24', test: /#?(예능|개그맨|개그우먼|코미디|나혼산|런닝맨|무한도전|라디오스타|아는형님|놀면뭐하니|유퀴즈|숏드라마|숏킹|드라마)/ },
    { id: '17', test: /#?(축구|야구|농구|배구|골프|kbo|k리그|올림픽|월드컵|ufc|격투)/i },
    { id: '20', test: /#?(게임|롤|리니지|배그|피파|넥슨|스팀|케스파|e스포츠)/i },
    { id: '25', test: /#?(뉴스|속보|앵커|시사|국회|대통령|정부|광복절)/ },
    { id: '28', test: /#?(ai|인공지능|챗gpt|gpt|반도체|테슬라|아이폰|갤럭시|코딩)/i },
];

/** 유튜브 분류 → 내용으로 본 분류. 근거가 없으면 원래 값 그대로. */
function realCategoryId(row: GapRow): string {
    const hay = `${row.video.title} ${row.keyword}`;
    for (const rule of CATEGORY_OVERRIDE) {
        if (rule.test.test(hay)) return rule.id;
    }
    return row.video.categoryId || '';
}

/*
 * 롱폼과 숏폼은 뜨는 방식이 다르다 — 섞어 놓으면 어느 쪽 재료인지 모른다
 * (사장님 지시 2026-08-20). 판정은 수집 때 /shorts/ 응답으로 실측한다.
 */
/*
 * 글감 주제 — 유튜브 카테고리와 별개의 축(사장님 지시 2026-08-21).
 * 쇼핑각은 검색광고 경쟁도 실측('높음')이 근거다 — 쇼핑 검색 API 는
 * 2026-07-31 종료돼 상품수 실측이 불가능하다.
 */
const TOPICS = [
    { id: 'shopping', label: '제휴·쇼핑각', hint: '광고 경쟁 실측 높음 + AI 에이전트가 "살 수 있는 물건"으로 판정한 검색어' },
    { id: 'policy', label: '복지·정책', hint: '지원금·복지·정책 낱말이 든 검색어' },
    { id: 'ai', label: 'AI', hint: 'AI 관련 검색어' },
];

const FORMS = [
    { id: '', label: '전체' },
    { id: 'short', label: '숏폼' },
    { id: 'long', label: '롱폼' },
];

type GapData = {
    collectedAt: string;
    videoCount: number;
    candidateCount: number;
    gate: { minVolume: number; maxDocs: number; minRatio: number };
    rows: GapRow[];
};

type IdeaState = { status: 'idle' | 'loading' | 'done' | 'error'; ideas?: KinPostIdea[]; message?: string };

function agoText(iso: string, suffix: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const minutes = Math.round((Date.now() - at.getTime()) / 60000);
    if (minutes < 1) return `방금 ${suffix}`;
    if (minutes < 60) return `${minutes}분 전 ${suffix}`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전 ${suffix}`;
    return `${Math.round(minutes / (60 * 24))}일 전 ${suffix}`;
}

/** 영상 날짜는 그대로 적는다 — "3일 전" 만으로는 언제 터진 건지 모른다. */
function dateText(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    return at.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function YoutubeTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [data, setData] = useState<GapData | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    /*
     * 지금 재생 중인 **카드**. 열쇠는 videoId 가 아니라 검색어다 —
     * 같은 영상에서 나온 카드가 여럿이라 videoId 로 잡으면 하나를 눌렀을 때
     * 그 영상 카드가 전부 같이 재생됐다(사장님 실측 2026-08-20).
     * 60개를 한꺼번에 띄우면 화면이 죽으니 누른 하나만 iframe 이 된다.
     */
    const [playing, setPlaying] = useState('');
    const [ideas, setIdeas] = useState<Record<string, IdeaState>>({});
    const [form, setForm] = useState('');
    const [category, setCategory] = useState('');
    const [topic, setTopic] = useState('');
    /** 에이전트 판정 주제 — 검색어별 추가 주제. 수집분마다 브라우저에 캐시. */
    const [aiTopics, setAiTopics] = useState<Record<string, string[]>>({});
    /** 방금 복사한 키워드 — 버튼에 "복사됨"을 잠깐 보여준다. */
    const [copied, setCopied] = useState('');
    /*
     * 지금 갱신(사장님 지시 2026-08-22 "유튜브 급상승도 실시간으로 바뀌어야 하고,
     * 유튜브 API 도 개개인 사용자 껄로").
     *
     * 아래 표는 15분 크론이 만든 스냅샷이다 — 검색량·문서수까지 실측하느라
     * 그 시간이 든다. 이 버튼은 **지금 유튜브에서 뜨는 것**만 방문자 자기 키로
     * 즉시 가져온다. 빈자리 판정(검색량·문서수)은 없다 — 그건 스냅샷의 몫이다.
     */
    const [live, setLive] = useState<{ at: string; videos: LiveTrendingVideo[] } | null>(null);
    const [liveState, setLiveState] = useState<'idle' | 'loading' | 'error'>('idle');
    const [liveNote, setLiveNote] = useState('');
    const refreshLive = async () => {
        if (liveState === 'loading') return;
        setLiveState('loading');
        setLiveNote('');
        const result = await fetchYoutubeTrending();
        if (result.ok && result.data?.videos?.length) {
            setLive({ at: result.data.collectedAt, videos: result.data.videos });
            setLiveState('idle');
            return;
        }
        setLiveState('error');
        setLiveNote(result.error === 'needs-keys'
            ? '내 API 키 탭에 유튜브 API 키를 넣으면 지금 바로 가져옵니다 — 사장님 쿼터가 아니라 본인 키로 돕니다.'
            : (result.message || result.error || '가져오지 못했습니다.'));
    };

    useEffect(() => {
        let cancelled = false;
        fetch('/data/youtube-gap.json')
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((json) => { if (!cancelled) { setData(json); setStatus('ready'); } })
            .catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, []);

    /*
     * 에이전트 주제 판정(사장님 지시 2026-08-21 "API 가 아니지, 에이전트가
     * 있으니까"). 규칙·광고경쟁 실측 위에 얹는다. 같은 수집분은 다시 묻지
     * 않는다 — 캐시 열쇠가 collectedAt 이라 새 수집이 오면 새로 판정한다.
     */
    useEffect(() => {
        if (!data || data.rows.length === 0) return;
        const keys = loadUserKeys();
        if (!keys.claudeToken && !keys.geminiKey && !keys.openaiKey) return;
        const cacheKey = `leaderspro.ytgap.aitopics.${data.collectedAt}`;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) { setAiTopics(JSON.parse(cached)); return; }
        } catch { /* 캐시가 깨졌으면 새로 판정 */ }
        let cancelled = false;
        fetchGapTopics(data.rows.map((row) => row.keyword)).then((result) => {
            if (cancelled || !result.ok || !result.data) return;
            const map: Record<string, string[]> = {};
            for (const verdict of result.data.topics) {
                const topics = [];
                if (verdict.shopping) topics.push('shopping');
                if (verdict.policy) topics.push('policy');
                if (verdict.ai) topics.push('ai');
                if (topics.length > 0) map[verdict.keyword] = topics;
            }
            setAiTopics(map);
            try { localStorage.setItem(cacheKey, JSON.stringify(map)); } catch { /* 저장 실패해도 화면은 동작 */ }
        });
        return () => { cancelled = true; };
    }, [data]);

    const topicsFor = (row: GapRow) => [...new Set([...(row.topics || []), ...(aiTopics[row.keyword] || [])])];

    /*
     * 글감 추론 — 서버(사이트 토큰) 먼저, 안 되면 **앱(본인 구독)** 으로 넘긴다.
     *
     * 왜 폴백이 필요한가(사장님 지적 2026-08-22 "연동이 문제 있으면 절대 안 된다"):
     * 코덱스·제미나이·그록은 이 PC 의 CLI 로그인이라 클라우드 워커가 못 쓴다.
     * 앱에서 네 엔진이 전부 "연동됨"인데 이 카드만 "연동하세요"를 띄우고 있었다.
     * 사용자가 고른 엔진을 그대로 앱에 넘긴다 — 몰래 다른 엔진으로 갈아타지 않는다.
     */
    const makeIdeas = async (row: GapRow) => {
        if (ideas[row.keyword]?.status === 'loading') return;
        setIdeas((previous) => ({ ...previous, [row.keyword]: { status: 'loading' } }));
        const done = (state: IdeaState) => setIdeas((previous) => ({ ...previous, [row.keyword]: state }));

        const viaKeys = await fetchKeywordPostIdeas(row.keyword, row.video.title);
        if (viaKeys.ok && viaKeys.data?.ideas?.length) {
            done({ status: 'done', ideas: viaKeys.data.ideas });
            return;
        }
        // 서버가 실제로 실패한 것(자격 문제가 아닌)은 그대로 알린다.
        if (viaKeys.error && viaKeys.error !== 'needs-keys') {
            done({ status: 'error', message: viaKeys.message || viaKeys.error });
            return;
        }

        const viaApp = await bridgePostIdeas({
            kind: 'keyword',
            keyword: row.keyword,
            context: row.video.title,
            provider: String(loadUserKeys().aiProvider || ''),
        });
        if (viaApp.status === 'ok') {
            /*
             * 제목이 빠진 글감은 화면이 쓸 수 없다 — 빈칸을 채워 넣지 않고 버린다.
             * 전부 빠졌으면 실패로 알린다(빈 목록을 성공으로 보여주지 않는다).
             */
            const usable = viaApp.ideas
                .filter((idea) => idea.seo && idea.home)
                .map((idea) => ({
                    keyword: idea.keyword,
                    why: idea.why || '',
                    clickWhy: idea.clickWhy,
                    seo: idea.seo as string,
                    home: idea.home as string,
                    sub: idea.sub,
                }));
            done(usable.length > 0
                ? { status: 'done', ideas: usable }
                : { status: 'error', message: `${viaApp.provider} 가 제목을 못 만들었습니다 — 다시 눌러 주세요.` });
            return;
        }
        done({
            status: 'error',
            message: viaApp.status === 'outdated'
                ? 'LEWORD 앱이 구버전이라 이 기능이 없습니다 — 앱을 업데이트해 주세요.'
                : viaApp.status === 'offline'
                    ? 'LEWORD 앱을 켜면 본인 구독으로 바로 만듭니다. 앱 없이 쓰려면 내 API 키 탭에서 클로드 [연동] 버튼을 눌러 주세요.'
                    : `만들지 못했습니다: ${viaApp.message}`,
        });
    };

    const copyKeyword = async (keyword: string) => {
        try {
            await navigator.clipboard.writeText(keyword);
            setCopied(keyword);
            window.setTimeout(() => setCopied((current) => (current === keyword ? '' : current)), 1500);
        } catch { /* 클립보드 권한이 없으면 조용히 둔다 — 길게 눌러 복사하면 된다 */ }
    };

    const allRows = data?.rows || [];
    const rows = allRows.filter((row) => (
        (!form || row.video.form === form)
        && (!category || realCategoryId(row) === category)
        && (!topic || topicsFor(row).includes(topic))
    ));
    /** 지금 고른 형식 안에서 카테고리별 몇 건인지 — 빈 버튼을 누르게 두지 않는다. */
    const countIn = (categoryId: string) => allRows
        .filter((row) => (!form || row.video.form === form) && realCategoryId(row) === categoryId).length;
    const formCount = (formId: string) => allRows.filter((row) => !formId || row.video.form === formId).length;
    const topicCount = (topicId: string) => allRows
        .filter((row) => (!form || row.video.form === form) && topicsFor(row).includes(topicId)).length;

    return (
        <>
            <TabIntro
                title="유튜브 급상승 → 네이버 빈자리"
                desc="지금 유튜브에서 터지는 중인데 네이버엔 아직 글이 없는 검색어입니다. 영상 제목을 자른 게 아니라, 네이버 자동완성이 인정한 실제 검색어만 싣습니다."
                source="유튜브 급상승 + 네이버 자동완성·검색량·문서수 실측"
            />

            <div className="lw-yt-filters">
                <div className="lw-yt-forms" role="group" aria-label="영상 형식">
                    {FORMS.map((item) => (
                        <button
                            key={item.id || 'all'}
                            type="button"
                            className={form === item.id ? 'on' : ''}
                            onClick={() => setForm(item.id)}
                        >{item.label} <em>{formCount(item.id)}</em></button>
                    ))}
                </div>
                <div className="lw-yt-cats" role="group" aria-label="카테고리">
                    <button type="button" className={category === '' ? 'on' : ''} onClick={() => setCategory('')}>전체</button>
                    {Object.entries(CATEGORY_LABEL).map(([id, label]) => {
                        const count = countIn(id);
                        if (count === 0) return null;
                        return (
                            <button
                                key={id}
                                type="button"
                                className={category === id ? 'on' : ''}
                                onClick={() => setCategory(id)}
                            >{label} <em>{count}</em></button>
                        );
                    })}
                </div>
                {TOPICS.some((item) => topicCount(item.id) > 0) && (
                    <div className="lw-yt-cats lw-yt-topics" role="group" aria-label="글감 주제">
                        {TOPICS.map((item) => {
                            const count = topicCount(item.id);
                            if (count === 0) return null;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={item.hint}
                                    className={topic === item.id ? 'on' : ''}
                                    onClick={() => setTopic(topic === item.id ? '' : item.id)}
                                >{item.label} <em>{count}</em></button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="lw-toolbar">
                <span className="lw-count">
                    {status === 'loading' ? '불러오는 중…' : `빈자리 ${rows.length}건`}
                </span>
                {data && (
                    <span className="lw-yt-meta">
                        급상승 {data.videoCount}편에서 검색어 {data.candidateCount}개 실측 · {agoText(data.collectedAt, '수집')}
                    </span>
                )}
                <button type="button" className="lw-yt-live-btn" onClick={() => { void refreshLive(); }} disabled={liveState === 'loading'}>
                    {liveState === 'loading' ? '가져오는 중…' : '⚡ 지금 갱신'}
                </button>
            </div>

            {liveNote && <div className={`lw-note${liveState === 'error' ? ' lw-note-err' : ''}`}>{liveNote}</div>}
            {live && (
                <section className="lw-live-panel">
                    <div className="lw-live-head">
                        <b>지금 유튜브에서 뜨는 것 {live.videos.length}편</b>
                        <span>{agoText(live.at, '가져옴')} · 본인 유튜브 키로 방금 받은 목록입니다 — 아래 빈자리 표는 검색량·문서수까지 잰 15분 스냅샷입니다.</span>
                        <button type="button" onClick={() => setLive(null)}>닫기</button>
                    </div>
                    <div className="lw-live-grid">
                        {live.videos.slice(0, 24).map((video) => (
                            <a
                                key={video.videoId}
                                className="lw-live-card"
                                href={`https://www.youtube.com/watch?v=${video.videoId}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" />}
                                <b>{video.title}</b>
                                <em>
                                    {video.channel}
                                    {typeof video.viewCount === 'number' ? ` · 조회 ${formatCount(video.viewCount)}` : ''}
                                    {CATEGORY_LABEL[video.categoryId] ? ` · ${CATEGORY_LABEL[video.categoryId]}` : ''}
                                </em>
                            </a>
                        ))}
                    </div>
                </section>
            )}

            {status === 'error' && (
                <div className="lw-note">
                    <strong>아직 수집분이 없습니다.</strong>
                    <p>15분마다 도는 수집이 한 번 돌면 채워집니다.</p>
                </div>
            )}

            {status === 'ready' && rows.length === 0 && (
                <div className="lw-note">
                    <strong>이번 회차엔 빈자리가 없었습니다.</strong>
                    <p>
                        급상승 검색어가 전부 이미 글이 많다는 뜻입니다
                        (기준: 검색량 {data?.gate.minVolume}+ · 문서수 {data?.gate.maxDocs}↓).
                    </p>
                </div>
            )}

            <div className="lw-yt-gap">
                {rows.map((row) => {
                    const idea = ideas[row.keyword];
                    return (
                        <article key={row.keyword} className="lw-yt-row">
                            <div className="lw-yt-video">
                                {playing === row.keyword ? (
                                    <iframe
                                        src={`https://www.youtube-nocookie.com/embed/${row.video.videoId}?autoplay=1`}
                                        title={row.video.title}
                                        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                                        allowFullScreen
                                    />
                                ) : (
                                    <button type="button" onClick={() => setPlaying(row.keyword)} aria-label={`${row.video.title} 재생`}>
                                        {row.video.thumbnail
                                            ? <img src={row.video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                            : <span className="lw-video-noimg" aria-hidden="true" />}
                                        <span className="lw-yt-play" aria-hidden="true">▶</span>
                                    </button>
                                )}
                            </div>

                            <div className="lw-yt-body">
                                <h3>{row.keyword}</h3>
                                <div className="lw-yt-metrics">
                                    <span>검색량 <strong>{formatCount(row.searchVolume)}</strong></span>
                                    <span>문서수 <strong>{formatCount(row.documentCount)}</strong></span>
                                    {/* 비율은 나눗셈 하나다 — 점수가 아니다. 클수록 자리가 넓다. */}
                                    <span className="lw-yt-ratio">검색 대비 글 <strong>{row.ratio}배 부족</strong></span>
                                </div>
                                <p className="lw-yt-from">
                                    {row.video.channel} · 조회 {formatCount(row.video.viewCount)} · {row.video.title}
                                </p>
                                <p className="lw-yt-tags">
                                    {row.video.form && (
                                        <span className={`lw-yt-form lw-yt-form-${row.video.form}`}>
                                            {row.video.form === 'short' ? '숏폼' : '롱폼'}
                                        </span>
                                    )}
                                    {CATEGORY_LABEL[realCategoryId(row)] && (
                                        <span className="lw-yt-cat">{CATEGORY_LABEL[realCategoryId(row)]}</span>
                                    )}
                                    {topicsFor(row).includes('shopping') && (
                                        <span className="lw-yt-topic lw-yt-topic-shopping" title="광고 경쟁 실측 '높음' 또는 AI 에이전트가 '살 수 있는 물건'으로 판정">제휴·쇼핑각</span>
                                    )}
                                    {topicsFor(row).includes('policy') && (
                                        <span className="lw-yt-topic lw-yt-topic-policy">복지·정책</span>
                                    )}
                                    {topicsFor(row).includes('ai') && (
                                        <span className="lw-yt-topic lw-yt-topic-ai">AI</span>
                                    )}
                                </p>
                                <p className="lw-yt-date">
                                    영상 날짜 {dateText(row.video.publishedAt)}
                                    <span> · {agoText(row.video.publishedAt, '업로드')}</span>
                                </p>
                                <div className="lw-yt-actions">
                                    <button type="button" className="lw-yt-analyze" onClick={() => onAnalyze(row.keyword)}>
                                        키워드 분석
                                    </button>
                                    <a
                                        className="lw-yt-act"
                                        href={row.video.form === 'short'
                                            ? `https://www.youtube.com/shorts/${row.video.videoId}`
                                            : `https://www.youtube.com/watch?v=${row.video.videoId}`}
                                        target="_blank" rel="noreferrer noopener"
                                    >YouTube 보기</a>
                                    <a
                                        className="lw-yt-act"
                                        href={`https://search.naver.com/search.naver?query=${encodeURIComponent(row.keyword)}`}
                                        target="_blank" rel="noreferrer noopener"
                                    >네이버 검색</a>
                                    <button type="button" className="lw-yt-act" onClick={() => copyKeyword(row.keyword)}>
                                        {copied === row.keyword ? '복사됨 ✓' : '키워드 복사'}
                                    </button>
                                </div>
                            </div>

                            <div className="lw-yt-write">
                                <h4>이 키워드로 쓸 수 있는 것</h4>
                                {(row.expansions || []).length > 0 && (
                                    <div className="lw-yt-chips">
                                        {(row.expansions || []).map((expansion) => (
                                            <button key={expansion} type="button" onClick={() => onAnalyze(expansion)} title="이 검색어 분석하기">
                                                {expansion}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {!idea && (
                                    <button type="button" className="lw-yt-make" onClick={() => makeIdeas(row)}>
                                        제목 만들기
                                    </button>
                                )}
                                {idea?.status === 'loading' && <p className="lw-yt-hint">만드는 중…</p>}
                                {idea?.status === 'error' && (
                                    <>
                                        <p className="lw-yt-err">{idea.message}</p>
                                        <button type="button" className="lw-yt-make" onClick={() => makeIdeas(row)}>다시</button>
                                    </>
                                )}
                                {idea?.status === 'done' && (
                                    <ul className="lw-yt-ideas">
                                        {(idea.ideas || []).map((item) => (
                                            <li className={item.recommended ? 'on' : undefined} key={item.keyword}>
                                                <button type="button" className="lw-yt-ideakey" onClick={() => onAnalyze(item.keyword)}>
                                                    {item.keyword}
                                                </button>
                                                {item.recommended && <span className="lw-pick">추천 · 메인+서브+후킹</span>}
                                                <p><em>SEO</em> {item.seo}</p>
                                                <p><em>홈판</em> {item.home}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </>
    );
}

export default YoutubeTab;
