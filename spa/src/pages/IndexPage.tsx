import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';
import TrustCounter from '../components/TrustCounter';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';

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
const HOME_LIVE_TIMEOUT_MS = 6500;

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

const HOME_LIVE_FALLBACK_SIGNALS: Record<SourceLaneId, SourceSignal[]> = {
    naver: [{ id: 'fallback-naver', keyword: '여름 가전 추천', title: '네이버 수요', description: '시즌성 구매 검색이 빠르게 붙는 흐름입니다.', priority: 96, source: 'naver' }],
    daum: [{ id: 'fallback-daum', keyword: '장마 준비물', title: '다음 생활 이슈', description: '생활형 검색에서 바로 글감으로 확장하기 좋은 신호입니다.', priority: 91, source: 'daum' }],
    nate: [{ id: 'fallback-nate', keyword: '오늘 방송 출연진', title: '네이트 이슈', description: '방송 직후 검색 전환이 빠른 키워드 흐름입니다.', priority: 88, source: 'nate' }],
    zum: [{ id: 'fallback-zum', keyword: '여름휴가 숙소', title: '줌 이슈', description: '지역명과 가격 비교로 확장하기 좋은 여행 검색입니다.', priority: 86, source: 'zum' }],
    policy: [{ id: 'fallback-policy', keyword: '청년 월세 지원 조건', title: '정책 알림', description: '조건, 서류, 신청기간으로 세분화하기 좋은 정책 키워드입니다.', priority: 94, source: 'policy' }],
    issue: [{ id: 'fallback-issue', keyword: '신작 드라마 출연진', title: '이슈 레이더', description: '인물, 원작, 몇부작까지 빠르게 확장되는 방송 이슈입니다.', priority: 90, source: 'issue' }],
};

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
            items: HOME_LIVE_FALLBACK_SIGNALS[lane.id],
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
        const items = Array.isArray(incoming?.items) && incoming.items.length > 0
            ? incoming.items
            : HOME_LIVE_FALLBACK_SIGNALS[config.id];
        return {
            ...config,
            items: items.slice(0, 3),
        };
    });
}

async function loadHomeLiveState(): Promise<HomeLiveState> {
    const fallback = buildFallbackHomeLiveState('error');
    const [goldenResult, sourceResult] = await Promise.allSettled([
        fetchHomeJson<{ updatedAt?: string; boardCount?: number; boardTarget?: number; lockedCount?: number; running?: boolean; publicPreview?: LiveGoldenPreview[] }>('/v1/public/live-golden'),
        fetchHomeJson<{ updatedAt?: string; fallbackUsed?: boolean; lanes?: Array<Partial<SourceLane> & { id?: string }> }>('/v1/public/source-signals?limit=60'),
    ]);
    const goldenPayload = goldenResult.status === 'fulfilled' ? goldenResult.value : null;
    const sourcePayload = sourceResult.status === 'fulfilled' ? sourceResult.value : null;
    const golden = Array.isArray(goldenPayload?.publicPreview) && goldenPayload.publicPreview.length > 0
        ? goldenPayload.publicPreview.slice(0, 5)
        : fallback.golden;
    const lanes = normalizeSourceLanes(sourcePayload);
    const hasLiveData = Boolean(goldenPayload || sourcePayload);

    return {
        status: hasLiveData ? 'ready' : 'error',
        golden,
        lanes,
        updatedAt: goldenPayload?.updatedAt || sourcePayload?.updatedAt,
        boardCount: Number(goldenPayload?.boardCount || 0),
        boardTarget: Number(goldenPayload?.boardTarget || 120),
        lockedCount: Number(goldenPayload?.lockedCount || 0),
        running: Boolean(goldenPayload?.running),
        fallbackUsed: Boolean(sourcePayload?.fallbackUsed || !sourcePayload),
    };
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
    const [siteContent, setSiteContent] = useState<SiteContent | null>(null);
    const [activeProofIndex, setActiveProofIndex] = useState(0);
    const [liveState, setLiveState] = useState<HomeLiveState>(() => buildFallbackHomeLiveState('loading'));

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
        fetchSiteContent().then(setSiteContent);
    }, []);

    const heroBenefit = siteContent?.hero?.benefit || '2,800+명이 사용 중';
    const heroNotice = siteContent?.hero?.notice || '';
    const configuredProofs = siteContent?.hero?.proofs?.filter((proof) => proof?.src) || [];
    const mergedProofs = configuredProofs.length
        ? [
            ...configuredProofs,
            ...DEFAULT_HERO_PROOFS.filter((defaultProof) => !configuredProofs.some((proof) => proof?.src === defaultProof.src)),
        ]
        : DEFAULT_HERO_PROOFS;
    const heroProofs = mergedProofs.map((proof, index) => ({
        ...DEFAULT_HERO_PROOFS[index % DEFAULT_HERO_PROOFS.length],
        ...proof,
    }));
    const activeProof = heroProofs[activeProofIndex % heroProofs.length] || DEFAULT_HERO_PROOFS[0];
    const liveUpdatedAt = formatLiveUpdatedAt(liveState.updatedAt);
    const liveStatusLabel = liveState.status === 'ready' ? 'LIVE' : liveState.status === 'error' ? 'FAST FALLBACK' : 'LOADING';
    const livePrimaryGolden = liveState.golden[0] || HOME_LIVE_FALLBACK_GOLDEN[0];
    const liveSourceTotal = liveState.lanes.reduce((sum, lane) => sum + lane.items.length, 0);
    const heroRealtimeTerms = liveState.lanes.map((lane) => {
        const fallback = HOME_LIVE_FALLBACK_SIGNALS[lane.id][0];
        const item = lane.items.find((entry) => entry.keyword || entry.title) || fallback;
        return {
            id: lane.id,
            label: lane.label,
            accent: lane.accent,
            keyword: cleanLiveText(item.keyword || item.title, fallback.keyword || lane.label),
            priority: item.priority || 0,
        };
    });

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
            <section className="home-hero" style={{ minHeight: 'calc(100vh - 80px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 40, padding: '120px 24px 60px', maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1, alignItems: 'center' }}>
                <div className="hero-content">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(201, 168, 76, 0.1)', border: '1px solid rgba(201, 168, 76, 0.3)', borderRadius: 50, fontSize: 12, fontWeight: 800, letterSpacing: 2, color: 'var(--gold-primary)', marginBottom: 24 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-primary)', boxShadow: '0 0 8px var(--gold-primary)' }} />
                        <span>PREMIUM AUTOMATION</span>
                    </div>
                    <div className="hero-realtime-board" aria-label="실시간 검색어">
                        <div className="hero-realtime-head">
                            <span>{liveStatusLabel}</span>
                            <strong>실시간 검색어</strong>
                            <small>{liveUpdatedAt}</small>
                        </div>
                        <div className="hero-realtime-primary">
                            <span style={{ background: heroRealtimeTerms[0]?.accent || '#44d7b6' }}>{heroRealtimeTerms[0]?.label || 'LIVE'}</span>
                            <h1>{heroRealtimeTerms[0]?.keyword || '실시간 검색어'}</h1>
                            <p>{liveState.status === 'ready' ? '지금 뜨는 검색 흐름을 바로 글감으로 전환하세요.' : '실시간 검색어를 빠르게 준비하고 있습니다.'}</p>
                        </div>
                        <div className="hero-realtime-grid">
                            {heroRealtimeTerms.slice(1).map((term) => (
                                <div key={term.id} className="hero-realtime-chip" style={{ borderColor: term.accent + '66', background: 'linear-gradient(135deg, ' + term.accent + '18, rgba(5,10,18,0.38))' }}>
                                    <span style={{ color: term.accent }}>{term.label}</span>
                                    <strong>{term.keyword}</strong>
                                    <small>{term.priority || 'LIVE'}</small>
                                </div>
                            ))}
                        </div>
                    </div>
                    {heroNotice && (
                        <div style={{ marginBottom: 24, padding: '12px 16px', border: '1px solid rgba(201,168,76,0.28)', borderRadius: 12, color: 'var(--gold-primary)', background: 'rgba(201,168,76,0.08)', fontSize: 14, fontWeight: 700 }}>
                            {heroNotice}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24 }}>
                        <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px', background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-light))', color: '#1a1a2e', borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: 'none', boxShadow: '0 8px 24px rgba(201, 168, 76, 0.4)' }}>
                            <span>지금 자동화 시작하기</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex' }}>
                                {[
                                    { bg: 'linear-gradient(135deg, #667eea, #764ba2)', letter: 'J' },
                                    { bg: 'linear-gradient(135deg, #f093fb, #f5576c)', letter: 'K' },
                                    { bg: 'linear-gradient(135deg, #4facfe, #00f2fe)', letter: 'L' },
                                ].map((a, i) => (
                                    <div key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, border: '2px solid var(--bg-dark)', marginLeft: i === 0 ? 0 : -10 }}>{a.letter}</div>
                                ))}
                            </div>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{heroBenefit}</span>
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
            </section>

            {/* ═══ TRUST BAR ═══ */}
            <section style={{ padding: '40px 24px', maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap', gap: 24, position: 'relative', zIndex: 1, borderTop: '1px solid var(--border-glass)', borderBottom: '1px solid var(--border-glass)' }}>
                <TrustCounter target={127000} label="누적 발행" />
                <div style={{ width: 1, height: 40, background: 'var(--border-glass)' }} />
                <TrustCounter target={2847} label="활성 사용자" />
                <div style={{ width: 1, height: 40, background: 'var(--border-glass)' }} />
                <TrustCounter target={99} label="가동률 %" />
                <div style={{ width: 1, height: 40, background: 'var(--border-glass)' }} />
                <TrustCounter target={15000} label="일일 자동 발행" />
            </section>

            <section id="leaders-live-home" className="home-live-section">
                <div className="home-live-header">
                    <div>
                        <span className="section-tag">LEWORD LIVE</span>
                        <h2>황금키워드와 실시간 소스를 홈에서 바로 확인하세요</h2>
                        <p>네이버·다음·네이트·줌·정책·이슈 신호와 성과 이미지를 한 화면에 모았습니다.</p>
                    </div>
                    <div className="home-live-status">
                        <strong>{liveStatusLabel}</strong>
                        <span>{liveUpdatedAt}</span>
                    </div>
                </div>

                <div className="home-live-metrics">
                    <div><strong>{liveState.boardCount > 0 ? liveState.boardCount : liveState.golden.length}</strong><span>검증 키워드</span></div>
                    <div><strong>{liveSourceTotal}</strong><span>수집 소스</span></div>
                    <div><strong>{liveState.lockedCount > 0 ? liveState.lockedCount : 'PRO'}</strong><span>잠금 성과</span></div>
                </div>

                <div className="home-live-grid">
                    <div className="home-live-group">
                        <div className="home-live-group-title">
                            <span>황금키워드</span>
                            <Link to="/leword">LEWORD 열기</Link>
                        </div>
                        <div className="home-golden-list">
                            {liveState.golden.slice(0, 3).map((item, index) => (
                                <article key={item.id || String(item.keyword || 'golden') + '-' + index} className="home-golden-card">
                                    <div className="home-golden-rank">#{item.rank || index + 1}</div>
                                    <div>
                                        <strong>{cleanLiveText(item.keyword, HOME_LIVE_FALLBACK_GOLDEN[index]?.keyword || '황금키워드')}</strong>
                                        <p>{cleanLiveText(item.publicReason, HOME_LIVE_FALLBACK_GOLDEN[index]?.publicReason || '검색 수요와 경쟁도를 검증 중입니다.')}</p>
                                        <div className="home-golden-meta">
                                            <span>{cleanLiveText(item.grade, 'S')}</span>
                                            <span>{cleanLiveText(item.publicSearchVolumeLabel, '수요 확인')}</span>
                                            <span>{cleanLiveText(item.publicDocumentCountLabel, '경쟁 잠금')}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>

                    <div className="home-live-group home-live-group-wide">
                        <div className="home-live-group-title">
                            <span>포털·정책·이슈</span>
                            <small>{liveState.fallbackUsed ? '보정 데이터 포함' : '실시간 연결'}</small>
                        </div>
                        <div className="home-source-grid">
                            {liveState.lanes.map((lane) => {
                                const fallback = HOME_LIVE_FALLBACK_SIGNALS[lane.id][0];
                                const item = lane.items[0] || fallback;
                                return (
                                    <article key={lane.id} className="home-source-lane" style={{ borderColor: lane.accent + '55', background: 'linear-gradient(135deg, ' + lane.accent + '18, rgba(255,255,255,0.03))' }}>
                                        <div className="home-source-lane-head">
                                            <span style={{ background: lane.accent }} />
                                            <strong>{lane.label}</strong>
                                            <small>{item.priority || 0}</small>
                                        </div>
                                        <h3>{cleanLiveText(item.keyword || item.title, fallback.keyword || lane.label)}</h3>
                                        <p>{cleanLiveText(item.description, fallback.description || lane.description)}</p>
                                    </article>
                                );
                            })}
                        </div>
                    </div>

                    <div className="home-live-group">
                        <div className="home-live-group-title">
                            <span>성과</span>
                            <Link to="/reviews">더 보기</Link>
                        </div>
                        <article className="home-proof-card">
                            <img src={activeProof.src} alt={activeProof.alt || activeProof.title || 'Leaders Pro 성과 이미지'} loading="lazy" decoding="async" />
                            <div>
                                <span>{activeProof.metric || '성과 인증'}</span>
                                <strong>{activeProof.title || '실제 운영 성과'}</strong>
                                <p>{activeProof.desc || '사용자가 직접 확인한 블로그 운영 성과입니다.'}</p>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            {/* ═══ EXPLORE GRID ═══ */}
            <section className="section">
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">EXPLORE</span>
                        <h2 className="section-title">원하는 정보를 빠르게 확인하세요</h2>
                        <p className="section-desc">각 페이지에서 상세 정보를 확인할 수 있습니다</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
                        {[
                            { to: '/products', emoji: '🚀', title: '제품 소개', desc: 'Leaders Pro의 강력한 블로그 자동화 기능을\n자세히 확인하세요', cta: '자세히 보기 →' },
                            { to: '/pricing', emoji: '💰', title: '구매', desc: '올인원 기간권 선택 및\n토스페이먼츠 안전 결제', cta: '가격표 보기 →', highlight: true, badge: '💳 결제' },
                            { to: '/reviews', emoji: '⭐', title: '후기 & FAQ', desc: '실제 사용자들의 생생한 후기와\n자주 묻는 질문 모음', cta: '후기 보기 →' },
                            { to: '/community', emoji: '👥', title: '커뮤니티', desc: '공지사항, 수익 인증,\n활용 팁 확인', cta: '커뮤니티 →' },
                            { to: '/download', emoji: '📥', title: '다운로드', desc: '구매 후 비밀번호 입력으로\n최신 버전 다운로드', cta: '다운로드 →' },
                            { to: '/lookup', emoji: '🔍', title: '주문 조회', desc: '이메일 또는 주문번호로\n구매 내역 확인', cta: '조회하기 →' },
                        ].map(card => (
                            <Link
                                key={card.to}
                                to={card.to}
                                className="fade-in"
                                style={{
                                    textDecoration: 'none',
                                    background: 'var(--bg-card)',
                                    border: card.highlight ? '1px solid var(--border-gold)' : '1px solid var(--border-glass)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '36px 28px',
                                    backdropFilter: 'blur(20px)',
                                    transition: 'all 0.3s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--border-gold)';
                                    e.currentTarget.style.transform = 'translateY(-4px)';
                                    e.currentTarget.style.boxShadow = card.highlight ? '0 12px 40px rgba(201,168,76,0.25)' : '0 12px 40px rgba(201,168,76,0.15)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = card.highlight ? 'var(--border-gold)' : 'var(--border-glass)';
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                {card.badge && (
                                    <div style={{ position: 'absolute', top: 12, right: 12, background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-light))', color: '#000', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>{card.badge}</div>
                                )}
                                <div style={{ fontSize: 40, marginBottom: 16 }}>{card.emoji}</div>
                                <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{card.title}</h3>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-line' }}>{card.desc}</p>
                                <span style={{ color: 'var(--gold-primary)', fontSize: 13, fontWeight: 600 }}>{card.cta}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ TESTIMONIALS ═══ */}
            <section className="section">
                <div className="section-inner">
                    <div className="section-header">
                        <span className="section-tag">TESTIMONIALS</span>
                        <h2 className="section-title">실제 사용자들의 이야기</h2>
                        <p className="section-desc">Leaders Pro를 경험한 분들의 생생한 후기</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
                        {[
                            {
                                quote: <>블로그 10개를 혼자 운영하는데, <strong style={{ color: 'var(--text-primary)' }}>리더스 프로 없었으면 불가능</strong>했어요. 출근 전에 키워드만 세팅하면 퇴근할 때 50건이 올라가 있습니다.</>,
                                bg: 'linear-gradient(135deg, #667eea, #764ba2)',
                                letter: 'K',
                                name: 'K 대표',
                                meta: '마케팅 에이전시 · 10개월 사용',
                            },
                            {
                                quote: <>쿠팡 파트너스 블로그를 4개 돌리고 있는데, 쇼핑 커넥트 기능으로 <strong style={{ color: 'var(--text-primary)' }}>월 수익이 3배</strong> 뛰었어요. AI가 생성한 리뷰 글이 정말 자연스러워요.</>,
                                bg: 'linear-gradient(135deg, #f093fb, #f5576c)',
                                letter: 'P',
                                name: 'P님',
                                meta: '제휴 마케터 · 6개월 사용',
                            },
                            {
                                quote: <>글로벌 블로그 5개를 Leaders Orbit으로 운영 중입니다. <strong style={{ color: 'var(--text-primary)' }}>애드센스 승인이 2주 만에</strong> 떨어졌고, 지금은 월 $400 이상 벌고 있어요.</>,
                                bg: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                                letter: 'L',
                                name: 'L님',
                                meta: '글로벌 블로거 · 8개월 사용',
                            },
                        ].map((t, i) => (
                            <div key={i} className="fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: 32, backdropFilter: 'blur(20px)' }}>
                                <div style={{ fontSize: 32, color: 'var(--gold-primary)', marginBottom: 12, lineHeight: 1, fontFamily: 'Georgia, serif' }}>"</div>
                                <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 20 }}>{t.quote}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>{t.letter}</div>
                                    <div>
                                        <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{t.name}</strong>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.meta}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 40 }}>
                        <Link to="/reviews" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', color: 'var(--gold-primary)', fontSize: 14, fontWeight: 600, transition: 'all 0.3s' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-gold)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-glass)'}
                        >
                            더 많은 후기 보기 →
                        </Link>
                    </div>
                </div>
            </section>

            <style>{`
                .hero-realtime-board {
                    width: min(100%, 720px);
                    display: grid;
                    gap: 16px;
                    margin-bottom: 24px;
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

                .hero-realtime-primary {
                    display: grid;
                    gap: 8px;
                    min-width: 0;
                }

                .hero-realtime-primary span {
                    width: fit-content;
                    max-width: 100%;
                    padding: 6px 11px;
                    border-radius: 999px;
                    color: #051018;
                    font-size: 12px;
                    font-weight: 900;
                }

                .hero-realtime-primary h1 {
                    margin: 0;
                    color: #fff;
                    font-size: clamp(38px, 5.7vw, 68px);
                    line-height: 1.08;
                    letter-spacing: 0;
                    overflow-wrap: anywhere;
                    text-shadow: 0 12px 34px rgba(0,0,0,0.28);
                }

                .hero-realtime-primary p {
                    margin: 0;
                    color: rgba(255,255,255,0.74);
                    font-size: 17px;
                    line-height: 1.55;
                }

                .hero-realtime-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px;
                }

                .hero-realtime-chip {
                    min-height: 72px;
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    gap: 5px 10px;
                    align-content: center;
                    padding: 12px;
                    border: 1px solid;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.04);
                }

                .hero-realtime-chip span {
                    grid-column: 1 / -1;
                    font-size: 12px;
                    font-weight: 900;
                }

                .hero-realtime-chip strong {
                    min-width: 0;
                    color: #fff;
                    font-size: 14px;
                    line-height: 1.35;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .hero-realtime-chip small {
                    color: rgba(255,255,255,0.52);
                    font-size: 12px;
                    font-weight: 900;
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
                .home-source-lane,
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

                .home-source-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                }

                .home-source-lane {
                    min-height: 144px;
                    padding: 15px;
                }

                .home-source-lane-head {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 10px;
                }

                .home-source-lane-head span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                .home-source-lane-head strong {
                    color: #fff;
                    font-size: 13px;
                    font-weight: 900;
                }

                .home-source-lane-head small {
                    margin-left: auto;
                    color: rgba(255,255,255,0.50);
                    font-size: 12px;
                    font-weight: 800;
                }

                .home-source-lane h3 {
                    margin: 0 0 8px;
                    color: #fff;
                    font-size: 15px;
                    line-height: 1.36;
                    letter-spacing: 0;
                }

                .home-source-lane p {
                    margin: 0;
                    color: rgba(255,255,255,0.64);
                    font-size: 12px;
                    line-height: 1.5;
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
                    min-height: 560px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    isolation: isolate;
                    overflow: hidden;
                    border-radius: 8px;
                }

                .hero-proof-stage::before {
                    content: '';
                    position: absolute;
                    inset: 24px 8px 42px;
                    border-radius: 8px;
                    border: 1px solid rgba(201,168,76,0.22);
                    background:
                        linear-gradient(135deg, rgba(12,18,28,0.82), rgba(5,8,12,0.38)),
                        linear-gradient(90deg, rgba(244,201,93,0.10), rgba(68,215,182,0.08));
                    box-shadow: 0 26px 90px rgba(0,0,0,0.30);
                    pointer-events: none;
                    z-index: -2;
                }

                .proof-summary {
                    position: absolute;
                    left: 26px;
                    top: 58px;
                    width: min(230px, 44%);
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
                    width: min(100%, 560px);
                    height: 480px;
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
                    bottom: 52px;
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

                    .home-source-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
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
                        min-height: 520px;
                        margin-top: 22px;
                        width: 100%;
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

                    .hero-realtime-grid {
                        grid-template-columns: 1fr;
                    }

                    .hero-realtime-chip strong {
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

                    .home-source-grid {
                        grid-template-columns: 1fr;
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
            `}</style>
        </>
    );
}

export default IndexPage;
