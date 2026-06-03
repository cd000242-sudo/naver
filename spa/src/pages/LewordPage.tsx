import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ParticlesCanvas from '../components/ParticlesCanvas';

/**
 * Leword 상세 페이지 — payment-page/leword.html (1338줄) 마이그.
 * 다크 보라 테마 (LEWORD 브랜드 — 보라 primary + 금색 SSS 강조).
 * inline style 그대로 유지.
 */

// ─────────────────────────────────────────────────────────
// CSS variables (LEWORD 전용 보라 테마)
// ─────────────────────────────────────────────────────────
const C = {
    purple: '#7C3AED',
    purpleLight: '#A78BFA',
    purpleDeep: '#4C1D95',
    gold: '#FFD700',
    neonGreen: '#00FF88',
    neonBlue: '#00AAFF',
    bgDark: '#0a0a0f',
    bgCard: '#12121a',
    bgSection: '#0d0d14',
    textPrimary: '#fff',
    textSecondary: '#a0a0b0',
    gradPurple: 'linear-gradient(135deg, #4C1D95, #7C3AED, #A78BFA)',
    gradGold: 'linear-gradient(135deg, #FFD700, #FFA500, #FF6B00)',
    gradPremium: 'linear-gradient(135deg, #4C1D95, #7C3AED 50%, #FFD700)',
};

// ─────────────────────────────────────────────────────────
// 데이터
// ─────────────────────────────────────────────────────────
const PAINS = [
    { icon: '📉', title: '검색량만 보고 글 썼는데', desc: '광고센터 숫자만 보고 글을 쓰면, 상위 노출은 다 대형 블로그였다.' },
    { icon: '⏰', title: '자동완성 정리하다 2시간', desc: '여기저기서 키워드 긁어와 엑셀에 정리하다 보면, 의욕이 먼저 꺾인다.' },
    { icon: '📒', title: '키워드 100개 적어뒀는데', desc: '"황금키워드"라고 메모해둔 게 잔뜩인데, 정작 글로 쓸 만한 건 없다.' },
    { icon: '💸', title: '수익 키워드를 모름', desc: '트래픽 좀 나온다 싶으면 정작 수익이 안 되는 키워드였다.' },
    { icon: '🌊', title: '블루오션인 줄 알았는데', desc: '경쟁 약해 보여서 골랐는데, 사실 검색량이 0에 가까웠다.' },
    { icon: '🔄', title: '매일 새 키워드가 없음', desc: '발굴 시스템이 없어서 일주일에 한 번 몰아서 — 그러다 보니 글감이 떨어진다.' },
];

const GRADES = [
    { tier: 'SSS', color: C.gold, gates: '점수 85+\n검색량 1,000+\n문서수 5,000↓\n비율 5+', highlight: true },
    { tier: 'SS', color: C.purpleLight, gates: '점수 75+\n검색량 500+\n문서수 10,000↓\n비율 3+' },
    { tier: 'S', color: C.purple, gates: '점수 65+\n검색량 300+\n비율 2+' },
    { tier: 'A', color: C.neonGreen, gates: '점수 55+\n검색량 100+' },
    { tier: 'B', color: C.textSecondary, gates: '점수 45+\n(참고용)' },
];

const COMPARISON = [
    { feature: '데이터 소스 수', cs1: '1개', cs2: '2~3개', us: '✓ 17개 교차검증' },
    { feature: '스코어링', cs1: '✕ (원본 수치만)', cs2: '단순 가중합', us: '✓ 5차원 가중 기하평균' },
    { feature: '등급 시스템', cs1: '✕', cs2: '단순 점수', us: '✓ SSS~B 다중 게이트' },
    { feature: '블루오션 판정', cs1: '✕', cs2: '✕', us: '✓ Profit Engine' },
    { feature: 'Rising 감지', cs1: '✕', cs2: '일부', us: '✓ 실시간 곡선 추적' },
    { feature: '카테고리 롱테일', cs1: '✕', cs2: '✕', us: '✓ 자동 조합' },
    { feature: '결정론적 결과', cs1: '✓', cs2: '랜덤 포함', us: '✓ Math.random 0%' },
    { feature: '자동화 도구 연동', cs1: '✕', cs2: '✕', us: '✓ Leaders Pro 원클릭' },
];

const TESTIMONIALS = [
    { avatar: '👨‍💼', name: '김*수', role: '직장인 블로거 · 1년차', text: '1년 동안 글 120개를 썼는데 일방문 50명에서 멈춰 있었어요. 첫날 내가 쓰던 키워드를 넣어봤더니 등급 D. 한 시간을 돌려보니 SSS 한 개가 떴습니다.', highlight: '사람들이 찾지 않는 단어 위에 글을 쌓고 있었구나', result: '📊 발굴 후 글 방향이 잡힘 — 쓰는 시간 단축' },
    { avatar: '👩‍👧', name: '박*영', role: '워킹맘 티스토리 · 6개월', text: '진짜 페인은 \'무엇을 써야 할지 모른다는 것\'이었어요. 빈 에디터 앞에서 30분 보내는 게 일상.', highlight: '카테고리 롱테일', resultText: '이 구원이었습니다. 일요일 밤 30분, 일주일 치 키워드를 뽑아두면 평일 새벽엔 그저 쓰기만 합니다.', result: '⏱️ 글 한 편 작성 시간 50% 단축' },
    { avatar: '🎮', name: '이*호', role: '게임/IT 부업 블로거 · 3개월', text: 'Rising 키워드가 진짜 사기예요. 신작 게임 출시 전날, 떠오르는 단어로 글을 올렸어요. 다음 날 아침,', highlight: '알림이 평소와 달랐습니다.', resultText: '취미였던 손가락이 처음으로 일처럼 보였어요.', result: '⚡ Rising 선점으로 트래픽 흐름 변화' },
];

const FAQS = [
    {
        q: '다른 키워드 도구와 정확히 뭐가 다른가요?',
        a: '대부분의 도구는 데이터를 "보여줍니다". LEWORD는 17개 소스를 교차검증한 뒤, 다중 게이트로 "걸러서" SSS·SS·S 등급으로 정리해줍니다.\n\n핵심 차이는 세 가지입니다:\n① 17개 소스 교차검증\n② 5차원 가중 기하평균\n③ 다중 게이트 등급 (점수+검색량+문서수+비율)',
    },
    {
        q: '네이버 광고센터가 무료인데 왜 LEWORD를 써야 하나요?',
        a: '광고센터는 가공되지 않은 단일 소스입니다. 검색량만 알려주고, 문서수·경쟁도·SERP 분석은 직접 해야 합니다.\n\nLEWORD는 그 작업을 자동화합니다 — 17개 소스 동시 비교 + 5차원 점수 + SSS~B 등급 + Rising/롱테일/PRO 헌터.\n\n혼자 정리하면 키워드 1개당 평균 10~15분이 걸리는 작업을, LEWORD는 클릭 한 번으로 끝냅니다.',
    },
    {
        q: '결과(트래픽·수익)를 보장하나요?',
        a: 'LEWORD는 키워드 발굴 도구입니다. 트래픽이나 수익 자체를 약속하지 않습니다.\n\n발굴된 키워드를 어떻게 활용하시는지 — 글의 품질, 카테고리, 발행 빈도 — 에 따라 결과는 달라집니다.\n\nLEWORD가 약속하는 것은 "이 단어가 어떤 데이터 위에 있는지" 입니다.',
    },
    {
        q: '컴퓨터를 잘 못 다루는데 사용할 수 있을까요?',
        a: '설치 → 키워드 한 단어 입력 → 발굴 버튼. 끝.\n\n· Windows 전용 데스크톱 앱입니다. 별도 서버나 설정 X\n· 결제 후 라이선스 코드 입력만 하면 즉시 사용 가능\n· 자동 업데이트 — 새 버전은 앱 안에서 클릭 한 번\n· 카카오톡 1:1 지원으로 막히면 즉시 도움받을 수 있습니다.',
    },
    {
        q: 'SSS 등급의 4단 게이트가 정확히 뭔가요?',
        a: 'SSS는 점수만 높다고 받는 등급이 아닙니다. 4개 조건을 모두 통과해야 합니다:\n\n① 점수 85+ (MDP 5차원 가중 기하평균)\n② 검색량 1,000+ (네이버 광고센터 실측)\n③ 문서수 5,000 이하 (네이버 통합검색)\n④ 비율 5+ (검색량 ÷ 문서수)\n\n한 게이트라도 미달이면 자동으로 SS·S·A로 떨어집니다.',
    },
    {
        q: '환불 정책은 어떻게 되나요?',
        a: '라이선스 발급 후 48시간 이내, 미사용 상태에서 100% 환불해 드립니다.\n\n· 환불 방법: 카카오톡 채널 \'Leaders Pro\' 1:1 문의 → 환불 요청 → 24시간 내 처리\n· 위약금 없음 — 사유 묻지 않음\n· 결제 전 반드시 무료 체험으로 먼저 확인해주세요.',
    },
];

// ─────────────────────────────────────────────────────────
// 유틸 컴포넌트
// ─────────────────────────────────────────────────────────
function MidCTA({ text, btnLabel = '지금 시작하기 →' }: { text: string; btnLabel?: string }) {
    return (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(255,215,0,0.04))', borderTop: '1px solid rgba(124,58,237,0.15)', borderBottom: '1px solid rgba(124,58,237,0.15)' }}>
            <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{text}</p>
            <Link to="/pricing" style={btnPrimary}>{btnLabel}</Link>
        </div>
    );
}

const btnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    background: C.gradPremium, color: '#fff',
    fontSize: 16, fontWeight: 700,
    padding: '16px 36px', borderRadius: 12,
    textDecoration: 'none', transition: 'all 0.3s',
};

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
    return <div style={{ color, fontWeight: 700, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16, display: 'inline-block' }}>{children}</div>;
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, marginBottom: 20, lineHeight: 1.3, letterSpacing: '-1.5px', ...style }}>{children}</h2>;
}

// ─────────────────────────────────────────────────────────
// 페이지
// ─────────────────────────────────────────────────────────
function LewordPage() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = 'Leword — 황금키워드 발굴의 단 하나의 기준';
        return () => { document.title = prev; };
    }, []);

    return (
        <div style={{ background: C.bgDark, color: C.textPrimary, minHeight: '100vh' }}>
            <ParticlesCanvas />
            {/* URGENCY BANNER */}
            <div style={{ background: C.gradPremium, padding: '16px 20px', textAlign: 'center', fontWeight: 700, fontSize: 16, position: 'sticky', top: 56, zIndex: 50 }}>
                💎 SSS 등급 키워드 1개를 못 찾고 보낸 글 1편 = 4시간 손실
            </div>

            {/* HERO */}
            <section style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 20px', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 900 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)', padding: '8px 20px', borderRadius: 50, fontSize: 14, color: C.purpleLight, marginBottom: 30 }}>
                        <span>💎</span><span>키워드 인텔리전스 · LEWORD</span>
                    </div>
                    <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.2, marginBottom: 20, letterSpacing: '-2px' }}>
                        왜 같은 주제인데<br />
                        <span style={{ background: C.gradPremium, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>누구는 떴을까?</span>
                    </h1>
                    <p style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', color: C.textSecondary, marginBottom: 15, fontWeight: 300 }}>
                        17개 데이터 소스를 교차검증하고 5차원으로 점수를 매겨,<br />
                        4단 게이트를 모두 통과한 키워드만 <strong style={{ color: C.gold }}>SSS</strong>로 표시합니다.
                    </p>
                    <p style={{ fontSize: 'clamp(18px, 3vw, 28px)', fontWeight: 700, color: '#ff6b6b', marginBottom: 40 }}>
                        "글은 늘어가는데, 왜 방문자는 그대로일까."<br />
                        문제는 글이 아니라, <strong>글이 올라탄 단어</strong>였습니다.
                    </p>
                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/pricing" style={btnPrimary}>💎 지금 시작하기</Link>
                        <a href="#features" style={{ ...btnPrimary, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: C.textPrimary }}>기능 자세히 보기 ↓</a>
                    </div>
                    <div style={{ display: 'flex', gap: 40, justifyContent: 'center', flexWrap: 'wrap', marginTop: 40 }}>
                        {[{ n: '17', l: '교차검증 데이터 소스' }, { n: '5', l: '차원 가중 기하평균' }, { n: '4', l: '단계 게이트 (SSS)' }].map((s, i) => (
                            <div key={i} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 32, fontWeight: 900, background: C.gradPremium, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.n}</div>
                                <div style={{ fontSize: 14, color: C.textSecondary }}>{s.l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* PAIN POINTS */}
            <section style={{ padding: '100px 20px', background: C.bgSection, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <SectionLabel color="#ff6b6b">😩 이런 적 있으신가요?</SectionLabel>
                    <SectionTitle>키워드 발굴, <span style={{ color: '#ff6b6b' }}>이렇게 막막해야 하나요?</span></SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginTop: 50 }}>
                        {PAINS.map((p, i) => (
                            <div key={i} style={{ background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 16, padding: 32, textAlign: 'left' }}>
                                <div style={{ fontSize: 40, marginBottom: 16 }}>{p.icon}</div>
                                <h3 style={{ fontSize: 20, marginBottom: 10, color: '#ff6b6b' }}>{p.title}</h3>
                                <p style={{ color: C.textSecondary, fontSize: 15 }}>{p.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 12, padding: 24, marginTop: 40 }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#ff8888' }}>키워드 잘못 잡은 글 1편 = <span style={{ fontSize: 32, color: '#ff6b6b' }}>평균 4시간 손실</span></p>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#ff8888' }}>월 30편 × 4시간 = <span style={{ fontSize: 32, color: '#ff6b6b' }}>120시간</span>을 매달 헛다리에 쓰고 있는 셈입니다.</p>
                    </div>
                </div>
            </section>

            {/* MEGA 01: 17 SOURCES */}
            <section id="features" style={{ padding: '100px 20px', background: C.bgSection, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                    <SectionLabel color={C.purpleLight}>🧬 MEGA FEATURE 01</SectionLabel>
                    <SectionTitle>17개 데이터 소스를<br /><span style={{ color: C.purpleLight }}>동시에 교차검증합니다</span></SectionTitle>
                    <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 700, margin: '0 auto 60px' }}>한 곳의 숫자만 보면 반드시 어긋납니다. 여러 각도가 일관될 때 비로소 후보로 올립니다.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, maxWidth: 800, margin: '0 auto' }}>
                        {[
                            { icon: '📊', title: '실측 검색량', desc: '네이버 광고센터 원본 직접 조회' },
                            { icon: '📈', title: '실시간 트렌드', desc: '시그널BZ + 네이버 트렌드 동기화' },
                            { icon: '🔗', title: '연관 신호', desc: '자동완성 + 연관검색어 + SERP 분석' },
                        ].map((s, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                                <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                                <div style={{ fontSize: 12, color: C.textSecondary }}>{s.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <MidCTA text="🧬 17개 소스를 1개 라이선스로" btnLabel="무료로 체험 시작 →" />

            {/* MEGA 02: MDP 5D */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                    <SectionLabel color={C.neonGreen}>📐 MEGA FEATURE 02</SectionLabel>
                    <SectionTitle>MDP v3.0<br /><span style={{ color: C.neonGreen }}>5차원 가중 기하평균 스코어링</span></SectionTitle>
                    <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 700, margin: '0 auto 60px' }}>단순 평균은 하나만 튀어도 점수가 부풀려집니다. LEWORD는 "어느 하나라도 약하면 점수가 끌려 내려가는" 보수적 구조로 계산합니다.</p>
                    <ul style={{ listStyle: 'none', display: 'inline-flex', flexDirection: 'column', gap: 12, textAlign: 'left', fontSize: 15, color: C.textSecondary }}>
                        {['가중 기하평균 (단순 산술평균이 아닌 보수적 결합)', '5축: 검색량 / 문서수 / CPC / 경쟁도 / SERP 반영', 'Math.random 사용 0% — 결정론적 스코어링', '동일 키워드 = 항상 동일한 점수 (재현성 보장)'].map((t, i) => (
                            <li key={i} style={{ paddingLeft: 24, position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, color: C.neonGreen, fontWeight: 700 }}>✓</span>{t}
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* GRADE SHOWCASE */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                    <SectionLabel color={C.gold}>🏆 MEGA FEATURE 03</SectionLabel>
                    <SectionTitle>SSS는 <span style={{ color: C.gold }}>4단 게이트</span>를<br />모두 통과한 키워드뿐입니다</SectionTitle>
                    <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 700, margin: '0 auto 60px' }}>점수만 높다고 SSS가 아닙니다. 검색량·문서수·비율을 모두 통과해야만 최상위 등급입니다.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, maxWidth: 1100, margin: '60px auto 0' }}>
                        {GRADES.map((g) => (
                            <div key={g.tier} style={{
                                background: g.highlight ? 'linear-gradient(180deg, rgba(255,215,0,0.10), rgba(18,18,26,0.95))' : C.bgCard,
                                border: g.highlight ? `2px solid ${C.gold}` : `1px solid ${g.color}55`,
                                borderRadius: 16, padding: '28px 16px', textAlign: 'center',
                                transform: g.highlight ? 'scale(1.05)' : 'none',
                                boxShadow: g.highlight ? '0 0 40px rgba(255,215,0,0.15)' : 'none',
                            }}>
                                <div style={{
                                    fontSize: 32, fontWeight: 900, marginBottom: 8,
                                    background: g.highlight ? C.gradGold : 'transparent',
                                    WebkitBackgroundClip: g.highlight ? 'text' : 'unset',
                                    WebkitTextFillColor: g.highlight ? 'transparent' : g.color,
                                }}>{g.tier}</div>
                                <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                                    {g.gates.split('\n').map((line, i) => {
                                        const m = line.match(/^(.+?)\s+(\d[\d,+↓]*\+?)$/);
                                        if (m) return <div key={i}>{m[1]} <strong style={{ color: C.gold }}>{m[2]}</strong></div>;
                                        return <div key={i}>{line}</div>;
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 12, padding: 24, marginTop: 60, maxWidth: 800, marginLeft: 'auto', marginRight: 'auto' }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: C.purpleLight }}>📍 게이트 한 개라도 미달이면 자동으로 SS·S·A로 떨어집니다</p>
                        <p style={{ fontSize: 15, color: C.textSecondary, fontWeight: 500, marginTop: 8 }}>같은 단어를 보고도 결과가 다른 이유 — 다중 게이트입니다.</p>
                    </div>
                </div>
            </section>

            <MidCTA text="💎 SSS 키워드, 내 분야엔 몇 개일까?" btnLabel="1분 안에 확인 →" />

            {/* MEGA 04: HUNTERS */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                    <SectionLabel color="#ff6b6b">🎯 MEGA FEATURE 04</SectionLabel>
                    <SectionTitle>상황별 4가지 발굴 엔진<br /><span style={{ color: '#ff6b6b' }}>"무엇을 쓸지 모르겠다" 끝</span></SectionTitle>
                    <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 700, margin: '0 auto 40px' }}>시드 키워드 발굴 · 카테고리 롱테일 · Rising 급상승 · PRO 트래픽 헌터. 매일 새 후보가 쌓입니다.</p>
                    <ul style={{ listStyle: 'none', display: 'inline-flex', flexDirection: 'column', gap: 12, textAlign: 'left', fontSize: 15, color: C.textSecondary, maxWidth: 700 }}>
                        {[
                            <><strong>황금키워드 발굴</strong> — MDP 5차원 점수 1차 정렬</>,
                            <><strong>카테고리 롱테일</strong> — 카테고리 × 타겟 자동 조합</>,
                            <><strong>Rising 키워드</strong> — 검색량 증가 곡선 추적, 선점</>,
                            <><strong>PRO 트래픽 헌터</strong> — 트래픽 폭발 가능성 높은 프리미엄</>,
                        ].map((t, i) => (
                            <li key={i} style={{ paddingLeft: 24, position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, color: C.neonGreen, fontWeight: 700 }}>✓</span>{t}
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* MEGA 05: PROFIT ENGINE */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
                    <SectionLabel color={C.neonBlue}>💰 MEGA FEATURE 05</SectionLabel>
                    <SectionTitle>Profit Engine —<br /><span style={{ color: C.neonBlue }}>CPC × 검색량 × 경쟁, 블루오션 판정</span></SectionTitle>
                    <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 700, margin: '0 auto 40px' }}>CPC 단일소스 DB 기반. 트래픽뿐 아니라 광고 단가까지 보고 블루오션 키워드를 판정합니다.</p>
                    <ul style={{ listStyle: 'none', display: 'inline-flex', flexDirection: 'column', gap: 12, textAlign: 'left', fontSize: 15, color: C.textSecondary, maxWidth: 700 }}>
                        {[
                            'CPC 단일소스 DB — 추정값 충돌 제거',
                            'RPM 환산 (광고 단가 기반 고수익 키워드)',
                            '블루오션 판정 — 경쟁 약함 + 단가 높음 + 검색량 충분',
                            '결정론적 — 같은 입력이면 항상 같은 결과',
                        ].map((t, i) => (
                            <li key={i} style={{ paddingLeft: 24, position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, color: C.neonGreen, fontWeight: 700 }}>✓</span>{t}
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <MidCTA text="💰 트래픽 키워드 vs 수익 키워드, 한 화면에서 확인" />

            {/* COMPARISON */}
            <section style={{ padding: '100px 20px', background: C.bgSection, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 50 }}>
                        <SectionLabel color={C.neonBlue}>📊 비교</SectionLabel>
                        <SectionTitle>왜 <span style={{ color: C.purpleLight }}>LEWORD</span>인가?</SectionTitle>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', maxWidth: 900, margin: '0 auto' }}>
                            <thead>
                                <tr style={{ background: 'rgba(124,58,237,0.12)' }}>
                                    <th style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 16, fontWeight: 700 }}>기능</th>
                                    <th style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 16, fontWeight: 700 }}>네이버 광고센터</th>
                                    <th style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 16, fontWeight: 700 }}>일반 키워드 도구</th>
                                    <th style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 16, fontWeight: 700, color: C.purpleLight }}>LEWORD</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON.map((row, i) => (
                                    <tr key={i}>
                                        <td style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>{row.feature}</td>
                                        <td style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: row.cs1.startsWith('✕') ? '#ff4444' : '#fff' }}>{row.cs1}</td>
                                        <td style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', color: row.cs2.startsWith('✕') ? '#ff4444' : '#ffaa00' }}>{row.cs2}</td>
                                        <td style={{ padding: '18px 24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(124,58,237,0.10)', color: C.neonGreen }}>{row.us}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* AUTHORITY */}
            <div style={{ textAlign: 'center', padding: '30px 20px', background: 'rgba(124,58,237,0.10)', borderTop: '1px solid rgba(124,58,237,0.25)', borderBottom: '1px solid rgba(124,58,237,0.25)', position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: 16, color: C.textSecondary, fontWeight: 500 }}>
                    <strong style={{ color: C.purpleLight }}>키워드 인텔리전스의 새 기준</strong> — 17개 소스 × 5차원 × 4단 게이트
                </p>
            </div>

            {/* TESTIMONIALS */}
            <section style={{ padding: '100px 20px', background: C.bgSection, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 50 }}>
                        <SectionLabel color={C.gold}>💬 사용자 후기</SectionLabel>
                        <SectionTitle>실제 사용자들의 <span style={{ background: C.gradPremium, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>변화 스토리</span></SectionTitle>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                        {TESTIMONIALS.map((t, i) => (
                            <div key={i} style={{ background: C.bgCard, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 32, position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.gradPremium, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{t.avatar}</div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                                        <div style={{ fontSize: 13, color: C.textSecondary }}>{t.role}</div>
                                    </div>
                                </div>
                                <p style={{ fontSize: 15, color: C.textSecondary, lineHeight: 1.8, marginBottom: 16 }}>
                                    "{t.text} <strong style={{ color: C.purpleLight }}>{t.highlight}</strong>{t.resultText ? ' ' + t.resultText : ''}"
                                </p>
                                <div style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.purpleLight, fontWeight: 600 }}>{t.result}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <MidCTA text="💎 키워드 한 번 보는 것이, 글 한 편 쓰는 것보다 빠릅니다" btnLabel="요금제 보기 →" />

            {/* PRICING */}
            <section id="pricing" style={{ padding: '100px 20px', background: C.bgDark, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <SectionLabel color={C.purpleLight}>💎 PRICING</SectionLabel>
                    <SectionTitle>Leword도 이제<br /><span style={{ background: C.gradPremium, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>올인원 이용권에 포함</span></SectionTitle>
                    <p style={{ color: C.textSecondary, fontSize: 16, maxWidth: 680, margin: '0 auto 28px', lineHeight: 1.8 }}>
                        네이버 자동화툴, 블로그스팟·워드프레스툴, Leword를 따로 구매하지 않아도 됩니다.
                        기간제 올인원 이용권 하나로 키워드 분석까지 함께 사용하세요.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', maxWidth: 900, margin: '0 auto', gap: 16, alignItems: 'stretch' }}>
                        {[
                            { name: '올인원 1개월', price: '₩50,000', per: '가볍게 시작', features: ['Leword 키워드 분석 이용', '네이버 자동화툴 이용', '블로그스팟·워드프레스툴 이용'] },
                            { name: '올인원 3개월', price: '₩120,000', per: '월 40,000원', features: ['Leword 전체 기능 이용', '여러 채널 안정 운영', '우선 고객 지원'], popular: true },
                            { name: '올인원 1년', price: '₩400,000', per: '월 33,333원', features: ['Leword + 전용 커뮤니티', '모든 자동화툴 기간 내 이용', '1:1 우선 지원'] },
                        ].map((p, i) => (
                            <div key={i} style={{
                                background: p.popular ? 'linear-gradient(180deg, rgba(124,58,237,0.14), rgba(18,18,26,0.9))' : 'rgba(18,18,26,0.7)',
                                backdropFilter: 'blur(20px)',
                                border: p.popular ? `2px solid ${C.purple}` : '1px solid rgba(255,255,255,0.06)',
                                padding: '34px 24px',
                                position: 'relative',
                                borderRadius: 18,
                                boxShadow: p.popular ? '0 0 60px rgba(124,58,237,0.15)' : 'none',
                            }}>
                                {p.popular && <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: C.gradPremium, padding: '6px 22px', borderRadius: 50, fontSize: 13, fontWeight: 800, color: '#fff' }}>추천</div>}
                                <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>{p.name}</h3>
                                <div style={{ fontSize: 40, fontWeight: 900, background: C.gradPremium, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>{p.price}</div>
                                <div style={{ fontSize: 14, color: C.neonGreen, fontWeight: 600, marginBottom: 8 }}>{p.per}</div>
                                <ul style={{ listStyle: 'none', textAlign: 'left', marginBottom: 26, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    {p.features.map((f, j) => (
                                        <li key={j} style={{ padding: '7px 0', fontSize: 14, color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ color: C.neonGreen, fontWeight: 700, width: 18 }}>✓</span>{f}
                                        </li>
                                    ))}
                                </ul>
                                <Link to="/pricing" style={{
                                    display: 'block', width: '100%', padding: 16, borderRadius: 14,
                                    background: p.popular ? C.gradPremium : 'rgba(255,255,255,0.06)',
                                    color: '#fff', fontWeight: 700, fontSize: 16,
                                    textAlign: 'center', textDecoration: 'none',
                                    border: p.popular ? 'none' : '1px solid rgba(255,255,255,0.12)',
                                }}>올인원 가격표 보기 →</Link>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginTop: 40, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSecondary, fontSize: 14 }}>🔒 안전한 결제 (Toss)</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSecondary, fontSize: 14 }}>🔄 7일 환불 보장</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSecondary, fontSize: 14 }}>💬 카카오 1:1 지원</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.textSecondary, fontSize: 14 }}>🔑 즉시 라이선스 발급</div>
                    </div>
                </div>
            </section>

            {/* GUARANTEE */}
            <section style={{ padding: '80px 20px', background: C.bgSection, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 700, margin: '0 auto', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, padding: 40 }}>
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🛡️</div>
                    <h3 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>결제 부담은 0</h3>
                    <p style={{ color: C.textSecondary, fontSize: 16 }}>
                        라이선스 코드 발급일로부터 <strong style={{ color: C.purpleLight }}>48시간 이내</strong>,<br />
                        서비스 미사용(미로그인) 시 전액 환불해 드립니다.<br />
                        결제 전 반드시 <strong style={{ color: C.purpleLight }}>무료 체험</strong>으로 먼저 확인해주세요.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section style={{ padding: '100px 20px', background: C.bgDark, position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 50 }}>
                        <SectionLabel color={C.neonBlue}>❓ 자주 묻는 질문</SectionLabel>
                        <SectionTitle>궁금한 점이 있으신가요?</SectionTitle>
                    </div>
                    {FAQS.map((f, i) => (
                        <div key={i} style={{ background: C.bgCard, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                            <button
                                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                style={{
                                    width: '100%', padding: '20px 28px',
                                    background: 'transparent', border: 'none',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    cursor: 'pointer', color: C.textPrimary,
                                    fontWeight: 700, fontSize: 16, textAlign: 'left',
                                }}
                            >
                                <span>{f.q}</span>
                                <span style={{ fontSize: 22, color: C.purpleLight, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.3s' }}>+</span>
                            </button>
                            <div style={{
                                maxHeight: openFaq === i ? 800 : 0,
                                overflow: 'hidden',
                                padding: openFaq === i ? '0 28px 24px' : '0 28px',
                                transition: 'all 0.4s ease',
                                color: C.textSecondary,
                            }}>
                                <p style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{f.a}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* FINAL CTA */}
            <section style={{ padding: '120px 20px', background: C.bgDark, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <SectionTitle style={{ fontSize: '2.5rem' }}>오늘 밤에 쓸 글,<br /><span style={{ background: C.gradPremium, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>아직도 감으로 정하시겠습니까.</span></SectionTitle>
                    <p style={{ color: C.textSecondary, fontSize: 18, maxWidth: 600, margin: '0 auto 32px' }}>
                        글을 한 편 더 쓰는 것보다,<br />
                        키워드를 한 번 더 보는 게 빠릅니다.
                    </p>
                    <Link to="/pricing" style={{ ...btnPrimary, fontSize: 20, padding: '20px 48px' }}>💎 올인원으로 LEWORD 시작하기 →</Link>
                    <p style={{ marginTop: 16, color: '#888', fontSize: 14 }}>🔒 안전한 결제 · 7일 환불 보장 · 카카오톡 즉시 지원</p>
                </div>
            </section>
        </div>
    );
}

export default LewordPage;
