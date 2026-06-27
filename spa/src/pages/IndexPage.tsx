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
const HOME_LIVE_TIMEOUT_MS = 15000;

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

function cleanLiveText(value: unknown, fallback: string): string {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const questionMarks = (text.match(/\?/g) || []).length;
    const looksBroken = /[�]|占|揶|醫|怨|筌|嚥|媛|덈떎|섏|ㅼ/.test(text) || questionMarks >= Math.max(3, Math.ceil(text.length / 5));
    return looksBroken ? fallback : text;
}

function buildFallbackHomeLiveState(status: HomeLiveStatus = 'loading'): HomeLiveState {
    return {
        status,
        golden: HOME_LIVE_FALLBACK_GOLDEN,
        lanes: SOURCE_LANE_CONFIGS.map((lane) => ({
            ...lane,
            items: [],
        })),
        boardCount: 0,
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
    const lanes = normalizeSourceLanes(sourcePayload);
    const hasLiveData = lanes.some((lane) => lane.items.length > 0);

    return {
        status: hasLiveData ? 'ready' : 'error',
        golden: fallback.golden,
        lanes,
        updatedAt: sourcePayload?.updatedAt,
        boardCount: 0,
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

const SOURCE_EXPANSION_SUFFIXES: Record<SourceLaneId, string[]> = {
    naver: ['\ud6c4\uae30', '\ucd94\ucc9c', '\uac00\uaca9', '\ube44\uad50', '\ubc29\ubc95', '\uc7a5\ub2e8\uc810', '\uccb4\ud06c\ub9ac\uc2a4\ud2b8', '2026'],
    daum: ['\uc815\ub9ac', '\uc6d0\uc778', '\uc77c\uc815', '\uc804\ub9dd', '\ubc18\uc751', '\uad00\ub828 \ub274\uc2a4', '\ud575\uc2ec', '\uc624\ub298'],
    nate: ['\ucd9c\uc5f0\uc9c4', '\ud504\ub85c\ud544', '\uacf5\uc2dd\uc785\uc7a5', '\uc7ac\ubc29\uc1a1', '\uc778\uc2a4\ud0c0', '\uadfc\ud669', '\uc601\uc0c1', '\ubc18\uc751'],
    zum: ['\uc704\uce58', '\ud6c4\uae30', '\uac00\uaca9', '\uc608\uc57d', '\uc77c\uc815', '\ud560\uc778', '\ucd94\ucc9c', '\uadfc\ucc98'],
    policy: ['\uc2e0\uccad \ubc29\ubc95', '\ub300\uc0c1', '\uc870\uac74', '\uc11c\ub958', '\uc9c0\uae09\uc77c', '\ud648\ud398\uc774\uc9c0', '\uc9c0\uc5ed\ubcc4', '\ubb38\uc758\ucc98'],
    issue: ['\uc815\ub9ac', '\uc774\uc720', '\uacf5\uc2dd\uc785\uc7a5', '\uc77c\uc815', '\ubc18\uc751', '\uad00\ub828\uc8fc', '\uc778\ubb3c', '\uc804\ub9dd'],
};

const SOURCE_MINDMAP_BRANCHES: Record<SourceLaneId, Array<{ label: string; suffixes: string[] }>> = {
    naver: [
        { label: '\uac80\uc0c9\uc758\ub3c4', suffixes: ['\ud6c4\uae30', '\ucd94\ucc9c'] },
        { label: '\uc804\ud658\ud615', suffixes: ['\uac00\uaca9', '\ube44\uad50'] },
        { label: '\ucf58\ud150\uce20\uac01', suffixes: ['\ubc29\ubc95', '\uccb4\ud06c\ub9ac\uc2a4\ud2b8'] },
    ],
    daum: [
        { label: '\ub274\uc2a4\ub9e5\ub77d', suffixes: ['\uc815\ub9ac', '\uc6d0\uc778'] },
        { label: '\uc2dc\uac04\ucd95', suffixes: ['\uc77c\uc815', '\uc624\ub298'] },
        { label: '\ubc18\uc751', suffixes: ['\uc804\ub9dd', '\uad00\ub828 \ub274\uc2a4'] },
    ],
    nate: [
        { label: '\uc778\ubb3c', suffixes: ['\ud504\ub85c\ud544', '\uadfc\ud669'] },
        { label: '\ubc29\uc1a1', suffixes: ['\ucd9c\uc5f0\uc9c4', '\uc7ac\ubc29\uc1a1'] },
        { label: '\ubc18\uc751', suffixes: ['\uacf5\uc2dd\uc785\uc7a5', '\uc778\uc2a4\ud0c0'] },
    ],
    zum: [
        { label: '\ud0d0\uc0c9', suffixes: ['\uc704\uce58', '\uadfc\ucc98'] },
        { label: '\uad6c\ub9e4', suffixes: ['\uac00\uaca9', '\ud560\uc778'] },
        { label: '\uacbd\ud5d8', suffixes: ['\ud6c4\uae30', '\uc608\uc57d'] },
    ],
    policy: [
        { label: '\ub300\uc0c1', suffixes: ['\ub300\uc0c1', '\uc870\uac74'] },
        { label: '\uc2e0\uccad', suffixes: ['\uc2e0\uccad \ubc29\ubc95', '\uc11c\ub958'] },
        { label: '\uc77c\uc815', suffixes: ['\uc9c0\uae09\uc77c', '\ubb38\uc758\ucc98'] },
    ],
    issue: [
        { label: '\ud575\uc2ec', suffixes: ['\uc815\ub9ac', '\uc774\uc720'] },
        { label: '\ud6c4\uc18d', suffixes: ['\uacf5\uc2dd\uc785\uc7a5', '\uc804\ub9dd'] },
        { label: '\ud655\uc0b0', suffixes: ['\ubc18\uc751', '\uc778\ubb3c'] },
    ],
};

function buildSourceSearchUrl(laneId: SourceLaneId, keyword: string): string {
    const trimmed = keyword.trim();
    return SOURCE_SEARCH_PATHS[laneId](trimmed || 'LEWORD');
}

function buildSourceExpansionKeywords(laneId: SourceLaneId, keyword: string): string[] {
    const base = keyword.trim();
    if (!base) return [];
    return Array.from(new Set(SOURCE_EXPANSION_SUFFIXES[laneId].map((suffix) => `${base} ${suffix}`))).slice(0, 8);
}

function buildSourceMindMap(laneId: SourceLaneId, keyword: string): Array<{ label: string; items: string[] }> {
    const base = keyword.trim();
    if (!base) return [];
    return SOURCE_MINDMAP_BRANCHES[laneId].map((branch) => ({
        label: branch.label,
        items: branch.suffixes.map((suffix) => `${base} ${suffix}`),
    }));
}

function SourceSignalInsightPanel({ lane, item }: { lane: SourceLane; item: SourceSignal | null }) {
    if (!item) {
        return (
            <aside className="source-insight-panel source-insight-panel-empty">
                <strong>{'\ub9c8\uc778\ub4dc\ub9f5 \ub300\uae30'}</strong>
                <p>{lane.label} {'\uc6d0\ubcf8\uc774 \ub4e4\uc5b4\uc624\uba74 \uac80\uc0c9 \uc758\ub3c4\uc640 \ud655\uc7a5\ud0a4\uc6cc\ub4dc\ub97c \ud568\uaed8 \ud45c\uc2dc\ud569\ub2c8\ub2e4.'}</p>
            </aside>
        );
    }

    const keyword = cleanLiveText(item.keyword || item.title, lane.label);
    const description = cleanLiveText(item.description || item.title, lane.description);
    const searchUrl = buildSourceSearchUrl(lane.id, keyword);
    const expansions = buildSourceExpansionKeywords(lane.id, keyword);
    const mindMap = buildSourceMindMap(lane.id, keyword);

    return (
        <aside className="source-insight-panel" style={{ borderColor: lane.accent + '66' }}>
            <div className="source-insight-head">
                <div>
                    <span style={{ color: lane.accent }}>{'\ub9c8\uc778\ub4dc\ub9f5'}</span>
                    <strong>{keyword}</strong>
                </div>
                <a href={searchUrl} target="_blank" rel="noreferrer">{'\uac80\uc0c9\uacb0\uacfc'}</a>
            </div>
            <p className="source-insight-desc">{description}</p>
            <div className="source-mindmap" aria-label={`${keyword} \ub9c8\uc778\ub4dc\ub9f5`}>
                <div className="source-mindmap-core" style={{ borderColor: lane.accent, color: lane.accent }}>{keyword}</div>
                <div className="source-mindmap-branches">
                    {mindMap.map((branch) => (
                        <div key={branch.label} className="source-mindmap-branch">
                            <span>{branch.label}</span>
                            {branch.items.map((child) => (
                                <a key={child} href={buildSourceSearchUrl(lane.id, child)} target="_blank" rel="noreferrer">{child}</a>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className="source-expansion-box">
                <strong>{'\ud655\uc7a5\ud0a4\uc6cc\ub4dc'}</strong>
                <div className="source-expansion-chips">
                    {expansions.map((expanded) => (
                        <a key={expanded} href={buildSourceSearchUrl(lane.id, expanded)} target="_blank" rel="noreferrer">{expanded}</a>
                    ))}
                </div>
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
            <section className="home-hero" style={{ minHeight: 'calc(100vh - 80px)', display: 'grid', gridTemplateColumns: 'minmax(0, 850px) minmax(280px, 360px)', gap: 24, padding: '76px 24px 28px', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <div className="hero-content">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', borderRadius: 50, fontSize: 12, fontWeight: 800, letterSpacing: 2, color: 'var(--gold-primary)', marginBottom: 18 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }} />
                        <span>PREMIUM AUTOMATION</span>
                    </div>
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
                                            <a key={item.id || `${activeSourceLane.id}-hero-${keyword}-${index}`} className={`hero-source-row${activeSourceInsightItem === item ? ' active' : ''}`} href={buildSourceSearchUrl(activeSourceLane.id, keyword)} target="_blank" rel="noreferrer" onClick={() => setActiveSourceKeyword(keyword)}>
                                                <span>{index + 1}</span>
                                                <div>
                                                    <strong>{keyword}</strong>
                                                    <p>{description}</p>
                                                </div>
                                                <small>{item.priority || 'LIVE'}</small>
                                            </a>
                                        );
                                    })}
                                </div>
                                <SourceSignalInsightPanel lane={activeSourceLane} item={activeSourceInsightItem} />
                            </div>
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
            </section>

            <style>{`
                .hero-realtime-board {
                    width: 100%;
                    display: grid;
                    gap: 16px;
                    margin: 0 auto 18px;
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
                    display: grid;
                    align-content: start;
                    gap: 12px;
                    padding: 14px;
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 8px;
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
                    gap: 7px;
                    max-height: 270px;
                    overflow-y: auto;
                    padding-right: 4px;
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
                    min-height: 41px;
                    display: grid;
                    grid-template-columns: 30px minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 9px;
                    padding: 7px 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.045);
                }

                .hero-source-row > span {
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

                .hero-source-row > small {
                    color: rgba(255,255,255,0.56);
                    font-size: 12px;
                    font-weight: 900;
                    white-space: nowrap;
                }

                .hero-source-body,
                .home-source-body {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(230px, 0.62fr);
                    gap: 12px;
                    align-items: start;
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
                    max-height: 270px;
                    overflow-y: auto;
                    display: grid;
                    gap: 12px;
                    padding: 13px;
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
                    max-width: 190px;
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
                    justify-self: stretch;
                    text-align: center;
                    position: relative;
                    z-index: 3;
                }

                .hero-action-strip {
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
                    min-height: 480px;
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
                        grid-template-columns: 28px minmax(0, 1fr);
                        align-items: start;
                    }

                    .hero-source-row > small {
                        grid-column: 2;
                        justify-self: start;
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
