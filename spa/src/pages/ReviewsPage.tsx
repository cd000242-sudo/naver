import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * 후기 — payment-page/reviews.html 마이그.
 * - GAS get-reviews 동적 로드 (실패 시 fallback 3건)
 * - submit-review POST
 * - FAQ accordion
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

const AVATAR_COLORS: Array<[string, string]> = [
    ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
    ['#fdcb6e', '#e17055'], ['#a8edea', '#fed6e3'], ['#ff9a9e', '#fad0c4'],
    ['#c2e9fb', '#a1c4fd'], ['#fbc2eb', '#a6c1ee'],
];

const pickAvatarGradient = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
    return `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
};

interface Testimonial { author: string; role?: string; text: string; badge?: string; gradient?: string; }

const FALLBACK: Testimonial[] = [
    { author: 'K 대표', role: '마케팅 에이전시 · 10개월 사용', text: '블로그 10개를 혼자 운영하는데, 리더스 프로 없었으면 불가능했어요. 출근 전에 키워드만 세팅하면 퇴근할 때 50건이 올라가 있습니다.', badge: '📈 월 방문자 12만 달성', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
    { author: 'P님', role: '제휴 마케터 · 6개월 사용', text: '쿠팡 파트너스 블로그를 4개 돌리고 있는데, 쇼핑 커넥트 기능으로 월 수익이 3배 뛰었어요. AI가 생성한 리뷰 글이 정말 자연스러워요.', badge: '💰 월 수익 3배 성장', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
    { author: 'L님', role: '글로벌 블로거 · 8개월 사용', text: '글로벌 블로그 5개를 Leaders Orbit으로 운영 중입니다. 애드센스 승인이 2주 만에 떨어졌고, 지금은 월 $400 이상 벌고 있어요.', badge: '🌍 월 $400+ 애드센스 수익', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
];

const FAQ: Array<[string, React.ReactNode]> = [
    ['Leaders Pro는 어떤 프로그램인가요?', 'Leaders Pro는 AI 기반 네이버 블로그 자동화 솔루션입니다. 키워드만 입력하면 GPT-4o, Gemini 2.5 등 7종의 AI가 6,000~10,000자의 자연스러운 포스팅을 작성하고, AI 이미지·영상을 생성하며, 네이버 블로그에 자동으로 발행합니다.'],
    ['봇 감지에 걸리지 않나요?', '사람처럼 타이핑하는 고급 봇 회피 엔진을 탑재했습니다. 랜덤 딜레이, 최적 시간대 발행, 쿨다운 기간 등의 기술로 봇 감지를 우회합니다. 실제로 수천 명의 사용자가 안전하게 사용 중입니다.'],
    ['계정을 몇 개까지 등록할 수 있나요?', '계정 수 제한이 없습니다. 네이버 블로그 ID를 원하는 만큼 등록하고, 각 계정별로 독립적인 스케줄을 설정하여 통합 관리할 수 있습니다.'],
    ['환불이 가능한가요?', <>라이선스 코드 발급 후 7일 이내, 서비스 미사용 시 전액 환불 가능합니다. 환불 요청은 cd000242@gmail.com으로 보내주세요. <Link to="/refund" style={{ color: '#FFD700' }}>환불정책 자세히 보기 →</Link></>],
    ['Leaders Orbit과 Leaders Pro의 차이는?', <>Leaders Pro는 <strong>네이버 블로그 전용</strong>, Leaders Orbit은 <strong>워드프레스 + 블로그스팟</strong> 글로벌 플랫폼을 대상으로 합니다. Orbit은 100% API 기반이라 봇 감지 걱정 없이 구글 애드센스 수익화에 최적화되어 있습니다.</>],
    ['기기 변경 시 어떻게 하나요?', '라이선스는 동시에 1대의 기기에서만 사용 가능합니다. 기기를 변경하면 이전 기기에서 자동으로 로그아웃됩니다. 별도의 이전 절차 없이 새 기기에서 바로 로그인하시면 됩니다.'],
];

function ReviewsPage() {
    const [testimonials, setTestimonials] = useState<Testimonial[]>(FALLBACK);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    // form state
    const [author, setAuthor] = useState('');
    const [email, setEmail] = useState('');
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [summary, setSummary] = useState('');
    const [detail, setDetail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '후기 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${GAS_URL}?action=get-reviews`);
                const data = await res.json();
                if (!data.success) return;
                const list = data.reviews || [];
                if (list.length === 0) return;
                setTestimonials(list.map((r: any) => {
                    const a = r.author || (r.email ? r.email.replace(/(.{2}).*(@.*)/, '$1***$2') : '익명');
                    let role = '', badge = '';
                    if (r.detail) {
                        const parts = r.detail.split('|');
                        role = (parts[0] || '').trim();
                        badge = (parts.slice(1).join('|') || '').trim();
                    }
                    return { author: a, role, text: r.summary || '', badge, gradient: pickAvatarGradient(a) };
                }));
            } catch {
                /* fallback */
            }
        })();
    }, []);

    const submitReview = async () => {
        if (rating === 0) { setMsg({ text: '별점을 선택해주세요.', type: 'error' }); return; }
        if (!author.trim()) { setMsg({ text: '닉네임을 입력해주세요.', type: 'error' }); return; }
        if (!summary.trim()) { setMsg({ text: '한줄 요약을 입력해주세요.', type: 'error' }); return; }

        setSubmitting(true);
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'submit-review',
                    author: author.trim(),
                    email: email.trim(),
                    rating,
                    summary: summary.trim(),
                    detail: detail.trim(),
                    timestamp: new Date().toISOString(),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ text: '🎉 후기가 접수되었습니다. 검토 후 1~2일 내 공개됩니다.', type: 'success' });
                setAuthor(''); setEmail(''); setRating(0); setSummary(''); setDetail('');
            } else {
                setMsg({ text: data.message || '등록 실패. 다시 시도해주세요.', type: 'error' });
            }
        } catch {
            setMsg({ text: '서버 연결 오류. 잠시 후 다시 시도해주세요.', type: 'error' });
        }
        setSubmitting(false);
    };

    const inputBase: React.CSSProperties = { width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', marginBottom: 12 };

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            {/* TESTIMONIALS */}
            <section style={{ padding: '140px 20px 80px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 50 }}>
                    <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 50, color: '#FFD700', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>TESTIMONIALS</span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>실제 사용자들의 이야기</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>Leaders Pro를 경험한 분들의 생생한 후기</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 60 }}>
                    {testimonials.map((t, i) => (
                        <div key={i} style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 28, position: 'relative' }}>
                            <div style={{ fontSize: 60, lineHeight: 1, color: '#FFD700', opacity: 0.3, marginBottom: -10 }}>"</div>
                            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', lineHeight: 1.8, marginBottom: 20 }}>{t.text}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                <div style={{ width: 44, height: 44, borderRadius: '50%', background: t.gradient || pickAvatarGradient(t.author), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>
                                    {(t.author.replace(/[^가-힣A-Za-z0-9]/g, '')[0] || '?').toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{t.author}</div>
                                    {t.role && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t.role}</div>}
                                </div>
                            </div>
                            {t.badge && (
                                <div style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#FFD700', fontWeight: 600, display: 'inline-block' }}>{t.badge}</div>
                            )}
                        </div>
                    ))}
                </div>

                {/* REVIEW WRITE FORM */}
                <div style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 'clamp(24px, 4vw, 36px)' }}>
                    <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>✍️ 후기 작성하기</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 20 }}>자유롭게 후기를 남겨주세요. 누구나 작성 가능합니다.</p>

                    <div style={{ display: 'flex', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                        <input type="text" placeholder="닉네임 (예: 블로그생활러)" maxLength={20} value={author} onChange={(e) => setAuthor(e.target.value)} style={{ ...inputBase, flex: 1, minWidth: 180 }} />
                        <input type="email" placeholder="이메일 (선택 — 공개 안 됨)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputBase, flex: 1.3, minWidth: 200 }} />
                    </div>

                    <div style={{ display: 'flex', gap: 4, marginBottom: 16, fontSize: 28 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                            <span
                                key={n}
                                onClick={() => setRating(n)}
                                onMouseEnter={() => setHover(n)}
                                onMouseLeave={() => setHover(0)}
                                style={{ cursor: 'pointer', color: (hover || rating) >= n ? '#FFD700' : 'rgba(255,255,255,0.2)', transition: 'color 0.15s' }}
                            >★</span>
                        ))}
                    </div>

                    <input type="text" placeholder="한줄 요약 (예: 블로그 운영이 정말 편해졌어요!)" maxLength={50} value={summary} onChange={(e) => setSummary(e.target.value)} style={inputBase} />
                    <textarea rows={4} placeholder="상세 후기를 작성해주세요..." maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit' }} />

                    <button
                        onClick={submitReview}
                        disabled={submitting}
                        style={{
                            width: '100%', padding: 14,
                            background: submitting ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #FFD700, #FFA500)',
                            color: submitting ? 'rgba(255,255,255,0.4)' : '#000',
                            border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800,
                            cursor: submitting ? 'not-allowed' : 'pointer',
                        }}
                    >{submitting ? '등록 중...' : '후기 등록하기'}</button>

                    {msg && (
                        <div style={{
                            marginTop: 14, padding: 12, borderRadius: 10, fontSize: 13, textAlign: 'center',
                            background: msg.type === 'success' ? 'rgba(68,215,182,0.08)' : 'rgba(255,92,117,0.08)',
                            border: `1px solid ${msg.type === 'success' ? 'rgba(68,215,182,0.3)' : 'rgba(255,92,117,0.25)'}`,
                            color: msg.type === 'success' ? '#44d7b6' : '#ff5c75',
                        }}>{msg.text}</div>
                    )}
                </div>
            </section>

            {/* FAQ */}
            <section style={{ padding: '60px 20px 100px', maxWidth: 900, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 50 }}>
                    <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(0,170,255,0.1)', border: '1px solid rgba(0,170,255,0.25)', borderRadius: 50, color: '#00AAFF', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>FAQ</span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>자주 묻는 질문</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>궁금한 점을 빠르게 해결하세요</p>
                </div>

                {FAQ.map(([q, a], i) => (
                    <div key={i} style={{ background: 'rgba(18,18,26,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                        <button
                            onClick={() => setOpenFaq(openFaq === i ? null : i)}
                            style={{ width: '100%', padding: '18px 24px', background: 'transparent', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'left' }}
                        >
                            <span>{q}</span>
                            <span style={{ fontSize: 20, color: '#FFD700', transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>⌄</span>
                        </button>
                        <div style={{ maxHeight: openFaq === i ? 500 : 0, overflow: 'hidden', padding: openFaq === i ? '0 24px 20px' : '0 24px', transition: 'all 0.3s ease', color: 'rgba(255,255,255,0.75)' }}>
                            <p style={{ fontSize: 14, lineHeight: 1.8 }}>{a}</p>
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}

export default ReviewsPage;
