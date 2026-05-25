import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * 커뮤니티 — payment-page/community.html 마이그.
 * 3 탭: 공지사항 / 수익 인증 / 활용 팁
 * GAS get-notices / income-list / get-tips 로드, 실패 시 fallback.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

type TabKey = 'notices' | 'income' | 'tips';

interface Notice { badge: string; date: string; title: string; preview: string; body: string; }
interface Income { emoji: string; amount: string; author: string; date: string; desc: string; tags: string[]; }
interface Tip { author?: string; title: string; detail: string; icon?: string; timestamp?: string; }

const NOTICE_BADGE_LABEL: Record<string, string> = { important: '중요', update: '업데이트', event: '이벤트', tip: '안내' };

const FALLBACK_NOTICES: Notice[] = [
    {
        badge: 'important', date: '2026.05.23',
        title: 'Better Life Naver v2.10.337 — 안정성 11건 + 봇 우회 강화',
        preview: '발행 간격 jitter, 사람형 타이핑, 세션 워밍업 등 안정성 진단 픽스 11건을 통합했습니다.',
        body: 'v2.10.337 릴리즈가 배포되었습니다. 발행 간격에 ±40% 랜덤 jitter, 사람형 가우시안 타이핑, 세션 워밍업, 연속발행 try/catch 보호, AI 클리셰 금지어 제거 등이 포함되었습니다.',
    },
    {
        badge: 'update', date: '2026.05.22',
        title: '이미지 생성 모델 강화 — gpt-image-1.5 + 나노바나나 3종 분리',
        preview: '새 이미지 모델과 품질 선택을 추가하고, 한글 텍스트 깨짐 회귀를 잡았습니다.',
        body: 'gpt-image-1.5 모델 신규 지원 + 품질 선택, 나노바나나 3종 분리(Pro/2/기본), 썸네일만 모드 본문 중복 배치 버그 수정, Gemini 원문 모드 그라운딩 OFF.',
    },
    {
        badge: 'tip', date: '2026.03.10',
        title: '환불 정책 안내',
        preview: '라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불이 가능합니다.',
        body: '전액 환불: 발급 후 7일 이내 + 미사용. 부분 환불: 활성화 후 7일 이내. 환불 불가: 7일 초과 또는 정상 이용 후.',
    },
];

const FALLBACK_INCOME: Income[] = [
    { emoji: '📊', amount: '월 127만원', author: '블로그왕 K님', date: '2026.03', desc: '네이버 블로그 7개 운영, 쿠팡 파트너스 + 체험단 수익입니다. Better Life Naver로 하루 평균 35건 발행 중.', tags: ['Better Life Naver', '쿠팡파트너스', '7개 블로그'] },
    { emoji: '💵', amount: '월 $420', author: '글로벌 블로거 L님', date: '2026.03', desc: 'WordPress 3개 + Blogspot 2개 운영. 영어 콘텐츠로 구글 애드센스 수익화 성공. Leaders Orbit 8개월차.', tags: ['Leaders Orbit', '구글 애드센스', '다국어'] },
    { emoji: '🏆', amount: '월 85만원', author: '부업러 P님', date: '2026.02', desc: '직장인 부업으로 네이버 블로그 4개 운영 중. 출근 전 키워드 세팅만 하면 퇴근 시 30건 완료.', tags: ['Better Life Naver', '직장인 부업', '4개 블로그'] },
    { emoji: '🎯', amount: '월 200만원+', author: '에이전시 대표 M님', date: '2026.03', desc: '마케팅 에이전시 운영. 클라이언트 블로그 12개를 Leaders Pro로 통합 관리. 인건비 절약 + 품질 향상.', tags: ['Better Life Naver', '에이전시', '12개 블로그'] },
];

const FALLBACK_TIPS: Tip[] = [
    { icon: '🎯', title: '키워드 선정이 수익의 80%', detail: '경쟁이 낮고 검색량이 있는 블루오션 키워드를 찾는 것이 핵심입니다. Leword를 활용하면 경쟁 강도·난이도를 한눈에 파악할 수 있습니다.' },
    { icon: '⏰', title: '최적 발행 시간대', detail: '네이버 상위노출을 위한 최적 발행 시간: 오전 7-9시, 오후 12-1시, 저녁 8-10시. 스케줄링으로 자동 설정하세요.' },
    { icon: '📈', title: '일 10건으로 시작하세요', detail: '처음부터 100건을 발행하면 봇 감지 위험이 있습니다. 일 10건부터 시작해서 2주 후 20건, 한 달 후 30건으로 천천히 늘려가세요.' },
    { icon: '🛡️', title: '랜덤 딜레이 활용', detail: '발행 간 랜덤 딜레이(3~8분)를 설정하면 봇 감지 확률이 크게 감소합니다. 자동 설정 옵션을 활성화하세요.' },
    { icon: '🌍', title: '글로벌 수익화 전략', detail: 'Leaders Orbit으로 영어 블로그를 운영하면 구글 애드센스 단가가 한국어 대비 2~5배 높습니다. 다국어 콘텐츠 생성을 활용하세요.' },
    { icon: '🎨', title: 'AI 이미지 품질 높이기', detail: 'Imagen 4 또는 DALL-E를 선택하면 가장 높은 품질의 AI 이미지가 생성됩니다. 글 내용에 맞는 키워드 이미지로 체류시간을 높이세요.' },
];

function CommunityPage() {
    const [tab, setTab] = useState<TabKey>('notices');
    const [notices, setNotices] = useState<Notice[]>(FALLBACK_NOTICES);
    const [income, setIncome] = useState<Income[]>(FALLBACK_INCOME);
    const [tips, setTips] = useState<Tip[]>(FALLBACK_TIPS);
    const [openNotice, setOpenNotice] = useState<number | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '커뮤니티 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    const loadTips = async () => {
        try {
            const res = await fetch(`${GAS_URL}?action=get-tips`);
            const data = await res.json();
            if (!data.success) return;
            const list = data.tips || [];
            if (list.length === 0) return;
            setTips(list);
        } catch { /* fallback */ }
    };

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${GAS_URL}?action=get-notices`);
                const data = await res.json();
                if (data.success && data.notices?.length) setNotices(data.notices);
            } catch { /* fallback */ }
        })();
        (async () => {
            try {
                const res = await fetch(`${GAS_URL}?action=income-list`);
                const data = await res.json();
                if (data.success && data.income?.length) setIncome(data.income);
            } catch { /* fallback */ }
        })();
        loadTips();
    }, []);

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <section style={{ padding: '140px 20px 100px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 50, color: '#FFD700', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>COMMUNITY</span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>Leaders Pro 커뮤니티</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>공지사항, 수익 인증, 활용 팁을 확인하세요</p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 40, flexWrap: 'wrap' }}>
                    {(
                        [
                            ['notices', '📢 공지사항'],
                            ['income', '💰 수익 인증'],
                            ['tips', '💡 활용 팁'],
                        ] as Array<[TabKey, string]>
                    ).map(([k, label]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k)}
                            style={{
                                padding: '12px 28px', borderRadius: 50,
                                background: tab === k ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.08))' : 'rgba(255,255,255,0.03)',
                                border: tab === k ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                                color: tab === k ? '#FFD700' : 'rgba(255,255,255,0.65)',
                                fontWeight: 600, fontSize: 14, cursor: 'pointer',
                                boxShadow: tab === k ? '0 0 20px rgba(255,215,0,0.15)' : 'none',
                            }}
                        >{label}</button>
                    ))}
                </div>

                {tab === 'notices' && <NoticesPanel notices={notices} openIdx={openNotice} onToggle={(i) => setOpenNotice(openNotice === i ? null : i)} />}
                {tab === 'income' && <IncomePanel items={income} />}
                {tab === 'tips' && <TipsPanel items={tips} onSubmitted={loadTips} />}
            </section>
        </div>
    );
}

// ─── Notices ───
function NoticesPanel({ notices, openIdx, onToggle }: { notices: Notice[]; openIdx: number | null; onToggle: (i: number) => void }) {
    const badgeColor = (b: string) => {
        switch (b) {
            case 'important': return { bg: 'rgba(255,92,117,0.15)', color: '#ff5c75', border: 'rgba(255,92,117,0.3)' };
            case 'update': return { bg: 'rgba(0,170,255,0.15)', color: '#00AAFF', border: 'rgba(0,170,255,0.3)' };
            case 'event': return { bg: 'rgba(68,215,182,0.15)', color: '#44d7b6', border: 'rgba(68,215,182,0.3)' };
            default: return { bg: 'rgba(255,215,0,0.12)', color: '#FFD700', border: 'rgba(255,215,0,0.3)' };
        }
    };

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {notices.map((n, i) => {
                const open = openIdx === i;
                const bc = badgeColor(n.badge);
                return (
                    <div
                        key={i}
                        onClick={() => onToggle(i)}
                        style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, marginBottom: 14, cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: bc.bg, color: bc.color, border: `1px solid ${bc.border}` }}>{NOTICE_BADGE_LABEL[n.badge] || n.badge}</span>
                            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{n.date}</span>
                        </div>
                        <h4 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{n.title}</h4>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6 }}>{n.preview}</p>
                        <div style={{ maxHeight: open ? 600 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                            <div
                                style={{ paddingTop: 14, marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.8 }}
                                dangerouslySetInnerHTML={{ __html: n.body }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Income ───
function IncomePanel({ items }: { items: Income[] }) {
    const [form, setForm] = useState({ emoji: '💰', amount: '', author: '', email: '', date: '', desc: '', tags: '' });
    const [msg, setMsg] = useState<{ text: string; color: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.author.trim()) { setMsg({ text: '닉네임을 입력해주세요.', color: '#e95e2c' }); return; }
        if (!form.amount.trim()) { setMsg({ text: '금액을 입력해주세요.', color: '#e95e2c' }); return; }
        if (!form.desc.trim()) { setMsg({ text: '설명을 입력해주세요.', color: '#e95e2c' }); return; }
        setSubmitting(true);
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'income-submit', ...form, timestamp: new Date().toISOString() }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ text: '🎉 수익 인증이 접수되었습니다. 검토 후 1~2일 내 공개됩니다.', color: '#44d7b6' });
                setForm({ emoji: '💰', amount: '', author: '', email: '', date: '', desc: '', tags: '' });
            } else {
                setMsg({ text: data.message || '등록 실패', color: '#e95e2c' });
            }
        } catch (err: any) {
            setMsg({ text: '오류: ' + (err?.message || ''), color: '#e95e2c' });
        }
        setSubmitting(false);
    };

    const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

    return (
        <div>
            {/* Submit form */}
            <div style={{ maxWidth: 720, margin: '0 auto 36px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 16, padding: 28 }}>
                <h3 style={{ fontSize: 16, color: '#FFD700', marginBottom: 6 }}>💰 내 수익 인증 올리기</h3>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 18 }}>검토 후 1~2일 내 공개됩니다. 누구나 가능합니다.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <input value={form.emoji} maxLength={4} onChange={(e) => update('emoji', e.target.value)} placeholder="💰" style={{ ...inputStyle, textAlign: 'center', fontSize: 20 }} />
                    <input value={form.amount} maxLength={50} onChange={(e) => update('amount', e.target.value)} placeholder="금액 (예: 월 127만원)" style={inputStyle} />
                    <input value={form.author} maxLength={20} onChange={(e) => update('author', e.target.value)} placeholder="닉네임" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="이메일 (선택 — 공개 안 됨)" style={inputStyle} />
                    <input value={form.date} maxLength={20} onChange={(e) => update('date', e.target.value)} placeholder="시점 (예: 2026.05)" style={inputStyle} />
                </div>
                <textarea value={form.desc} maxLength={500} rows={3} onChange={(e) => update('desc', e.target.value)} placeholder="어떤 제품으로 어떻게 수익화했는지 1-2줄" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: 12 }} />
                <input value={form.tags} maxLength={200} onChange={(e) => update('tags', e.target.value)} placeholder="태그 (콤마 구분: Better Life Naver, 쿠팡파트너스, 7개 블로그)" style={inputStyle} />
                <button onClick={submit} disabled={submitting} style={{ marginTop: 14, width: '100%', padding: 14, background: submitting ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #c9a84c, #d4a012)', color: submitting ? 'rgba(255,255,255,0.4)' : '#1a1a2e', border: 'none', borderRadius: 10, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14 }}>{submitting ? '등록 중...' : '수익 인증 등록하기'}</button>
                {msg && <div style={{ marginTop: 12, fontSize: 13, textAlign: 'center', color: msg.color }}>{msg.text}</div>}
            </div>

            {/* Income cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {items.map((it, i) => (
                    <div key={i} style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
                        <div style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.08))', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <div style={{ fontSize: 48 }}>{it.emoji}</div>
                            <span style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,215,0,0.9)', color: '#000', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 50 }}>{it.amount}</span>
                        </div>
                        <div style={{ padding: 18 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                                <span style={{ color: '#fff', fontWeight: 600 }}>{it.author}</span>
                                <span style={{ color: 'rgba(255,255,255,0.45)' }}>{it.date}</span>
                            </div>
                            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, marginBottom: 12 }}>{it.desc}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {(it.tags || []).map((t, j) => (
                                    <span key={j} style={{ background: 'rgba(255,215,0,0.08)', color: '#FFD700', fontSize: 11, padding: '3px 10px', borderRadius: 50, border: '1px solid rgba(255,215,0,0.2)' }}>{t}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 32 }}>
                💬 수익 인증을 공유하고 싶으시다면{' '}
                <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#FFD700' }}>카카오톡 1:1 문의</a>로 보내주세요!
            </p>
        </div>
    );
}

// ─── Tips ───
function TipsPanel({ items, onSubmitted }: { items: Tip[]; onSubmitted: () => void }) {
    const [form, setForm] = useState({ author: '', email: '', title: '', detail: '' });
    const [msg, setMsg] = useState<{ text: string; color: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.author.trim()) { setMsg({ text: '닉네임을 입력해주세요.', color: '#e95e2c' }); return; }
        if (!form.title.trim()) { setMsg({ text: '제목을 입력해주세요.', color: '#e95e2c' }); return; }
        if (!form.detail.trim()) { setMsg({ text: '본문을 입력해주세요.', color: '#e95e2c' }); return; }
        setSubmitting(true);
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'submit-tip', ...form, timestamp: new Date().toISOString() }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ text: '🎉 팁이 접수되었습니다. 검토 후 1~2일 내 공개됩니다.', color: '#44d7b6' });
                setForm({ author: '', email: '', title: '', detail: '' });
                onSubmitted();
            } else {
                setMsg({ text: data.message || '등록 실패', color: '#e95e2c' });
            }
        } catch (err: any) {
            setMsg({ text: '오류: ' + (err?.message || ''), color: '#e95e2c' });
        }
        setSubmitting(false);
    };

    const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

    return (
        <div>
            {/* Submit form */}
            <div style={{ maxWidth: 720, margin: '0 auto 36px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(100,149,237,0.25)', borderRadius: 16, padding: 28 }}>
                <h3 style={{ fontSize: 16, color: '#6495ed', marginBottom: 6 }}>💡 내 활용 팁 공유하기</h3>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 18 }}>자유롭게 작성하세요. 누구나 가능합니다.</p>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input value={form.author} maxLength={20} onChange={(e) => update('author', e.target.value)} placeholder="닉네임" style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
                    <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="이메일 (선택 — 공개 안 됨)" style={{ ...inputStyle, flex: 1.3, minWidth: 200 }} />
                </div>
                <input value={form.title} maxLength={100} onChange={(e) => update('title', e.target.value)} placeholder="제목 (예: 키워드 분석 꿀팁)" style={{ ...inputStyle, marginBottom: 12 }} />
                <textarea value={form.detail} maxLength={1500} rows={5} onChange={(e) => update('detail', e.target.value)} placeholder="활용 팁을 자세히 작성해주세요..." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                <button onClick={submit} disabled={submitting} style={{ marginTop: 14, width: '100%', padding: 14, background: submitting ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #6495ed, #4169e1)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14 }}>{submitting ? '등록 중...' : '팁 등록하기'}</button>
                {msg && <div style={{ marginTop: 12, fontSize: 13, textAlign: 'center', color: msg.color }}>{msg.text}</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
                {items.map((t, i) => (
                    <div key={i} style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 22 }}>
                        {t.author ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <span style={{ color: '#6495ed', fontSize: 12, fontWeight: 600 }}>👤 {t.author}</span>
                                {t.timestamp && <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{new Date(t.timestamp).toLocaleDateString('ko-KR')}</span>}
                            </div>
                        ) : (
                            <div style={{ fontSize: 28, marginBottom: 10 }}>{t.icon}</div>
                        )}
                        <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t.title}</h4>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{t.detail}</p>
                    </div>
                ))}
            </div>

            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 32 }}>
                더 많은 정보는{' '}
                <Link to="/reviews" style={{ color: '#FFD700' }}>후기</Link>{' '}또는{' '}
                <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#FFD700' }}>카카오톡 채널</a>
                에서 확인하세요.
            </p>
        </div>
    );
}

export default CommunityPage;
