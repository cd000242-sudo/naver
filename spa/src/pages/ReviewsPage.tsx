import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';

/**
 * 후기 페이지
 * - 실제 서버 후기만 노출합니다. 더미 후기는 사용하지 않습니다.
 * - 작성은 수익인증 이미지 + 후기 글 중심의 모달로 처리합니다.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const AVATAR_COLORS: Array<[string, string]> = [
    ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
    ['#fdcb6e', '#e17055'], ['#a8edea', '#fed6e3'], ['#ff9a9e', '#fad0c4'],
    ['#c2e9fb', '#a1c4fd'], ['#fbc2eb', '#a6c1ee'],
];

interface Testimonial {
    author: string;
    role?: string;
    text: string;
    image?: string;
    imageAlt?: string;
    badge?: string;
    gradient?: string;
}

function pickAvatarGradient(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
    return `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
}

function firstText(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function maskEmail(email: string) {
    return email.replace(/(.{2}).*(@.*)/, '$1***$2');
}

function normalizeReview(raw: any): Testimonial | null {
    const email = firstText(raw?.email);
    const author = firstText(raw?.author, raw?.name, raw?.nickname, email ? maskEmail(email) : '', '익명');
    const text = firstText(raw?.reviewText, raw?.review, raw?.text, raw?.summary, raw?.detail);
    const image = firstText(raw?.proofImage, raw?.image, raw?.imageUrl, raw?.proof, raw?.screenshot);
    const role = firstText(raw?.role, raw?.period, raw?.usagePeriod, raw?.product);
    const badge = firstText(raw?.badge, image ? '수익인증 이미지 포함' : '');

    if (!text && !image) return null;
    return {
        author,
        role,
        text: text || '수익인증 이미지를 등록한 후기입니다.',
        image,
        imageAlt: firstText(raw?.imageAlt, raw?.alt, `${author} 수익인증 이미지`),
        badge,
        gradient: pickAvatarGradient(author),
    };
}

function ReviewsPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [author, setAuthor] = useState('');
    const [email, setEmail] = useState('');
    const [reviewText, setReviewText] = useState('');
    const [proofImage, setProofImage] = useState('');
    const [proofImageName, setProofImageName] = useState('');
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
                const res = await fetch(`${GAS_URL}?action=get-reviews`, { cache: 'no-store' });
                const data = await res.json();
                const list = Array.isArray(data?.reviews) ? data.reviews : [];
                const normalized = list.map(normalizeReview).filter(Boolean) as Testimonial[];
                setTestimonials(normalized);
            } catch {
                setTestimonials([]);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const inputBase: CSSProperties = {
        width: '100%',
        padding: '13px 14px',
        background: '#0d121b',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        outline: 'none',
    };

    const closeModal = () => {
        if (submitting) return;
        setModalOpen(false);
        setMsg(null);
    };

    const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setMsg({ text: '이미지 파일만 선택할 수 있습니다.', type: 'error' });
            return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
            setMsg({ text: '이미지는 4MB 이하로 선택해주세요.', type: 'error' });
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setProofImage(String(reader.result || ''));
            setProofImageName(file.name);
            setMsg(null);
        };
        reader.onerror = () => setMsg({ text: '이미지를 읽지 못했습니다. 다른 파일을 선택해주세요.', type: 'error' });
        reader.readAsDataURL(file);
    };

    const submitReview = async () => {
        if (!proofImage) {
            setMsg({ text: '수익인증 이미지를 선택해주세요.', type: 'error' });
            return;
        }
        if (!reviewText.trim()) {
            setMsg({ text: '후기 글을 작성해주세요.', type: 'error' });
            return;
        }

        setSubmitting(true);
        setMsg(null);
        try {
            const payload = {
                action: 'submit-review',
                author: author.trim() || '익명',
                email: email.trim(),
                rating: 5,
                summary: reviewText.trim().slice(0, 120),
                detail: reviewText.trim(),
                reviewText: reviewText.trim(),
                proofImage,
                image: proofImage,
                imageName: proofImageName,
                timestamp: new Date().toISOString(),
            };
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ text: '후기가 접수되었습니다. 검토 후 공개됩니다.', type: 'success' });
                setAuthor('');
                setEmail('');
                setReviewText('');
                setProofImage('');
                setProofImageName('');
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                setMsg({ text: data.message || '등록 실패. 다시 시도해주세요.', type: 'error' });
            }
        } catch {
            setMsg({ text: '서버 연결 오류입니다. 잠시 후 다시 시도해주세요.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <section style={{ padding: '140px 20px 100px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 42, flexWrap: 'wrap' }}>
                    <div>
                        <span style={{ display: 'inline-flex', minHeight: 30, alignItems: 'center', padding: '6px 14px', background: 'rgba(68,215,182,0.10)', border: '1px solid rgba(68,215,182,0.28)', borderRadius: 8, color: '#44d7b6', fontSize: 12, fontWeight: 900, letterSpacing: 0, marginBottom: 16 }}>REVIEWS</span>
                        <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 900, marginBottom: 12, letterSpacing: 0 }}>실제 사용자 후기</h1>
                        <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 16, lineHeight: 1.7, margin: 0 }}>수익인증 이미지와 후기 글이 함께 등록된 실제 후기만 보여드립니다.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setModalOpen(true); setMsg(null); }}
                        style={{
                            minHeight: 46,
                            padding: '12px 20px',
                            borderRadius: 8,
                            border: '1px solid rgba(68,215,182,0.46)',
                            background: '#16c47f',
                            color: '#061018',
                            fontWeight: 900,
                            cursor: 'pointer',
                            boxShadow: '0 14px 34px rgba(22,196,127,0.22)',
                        }}
                    >
                        후기 작성
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: 34, borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(18,18,26,0.76)', color: 'rgba(255,255,255,0.72)' }}>후기를 불러오는 중입니다.</div>
                ) : testimonials.length === 0 ? (
                    <div style={{ padding: '44px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(18,18,26,0.76)', textAlign: 'center' }}>
                        <h2 style={{ margin: '0 0 10px', fontSize: 24 }}>아직 공개된 후기가 없습니다</h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>더미 후기는 표시하지 않습니다. 실제 수익인증과 후기가 승인되면 이곳에 노출됩니다.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
                        {testimonials.map((t, i) => (
                            <article key={`${t.author}-${i}`} style={{ background: 'rgba(18,18,26,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 18px 52px rgba(0,0,0,0.22)' }}>
                                {t.image && (
                                    <div style={{ background: '#080d14', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        <img src={t.image} alt={t.imageAlt || '수익인증 이미지'} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
                                    </div>
                                )}
                                <div style={{ padding: 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 8, background: t.gradient || pickAvatarGradient(t.author), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, color: '#fff' }}>
                                            {(t.author.replace(/[^가-힣A-Za-z0-9]/g, '')[0] || '?').toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 900, fontSize: 14, color: '#fff' }}>{t.author}</div>
                                            {t.role && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{t.role}</div>}
                                        </div>
                                    </div>
                                    {t.badge && <div style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 8, background: 'rgba(68,215,182,0.10)', border: '1px solid rgba(68,215,182,0.26)', color: '#44d7b6', fontSize: 12, fontWeight: 800, marginBottom: 12 }}>{t.badge}</div>}
                                    <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.84)', lineHeight: 1.78, margin: 0, whiteSpace: 'pre-wrap' }}>{t.text}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {modalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="후기 작성"
                    onClick={closeModal}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 18,
                        background: 'rgba(2, 6, 12, 0.78)',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(620px, 100%)',
                            maxHeight: 'calc(100vh - 36px)',
                            overflowY: 'auto',
                            borderRadius: 12,
                            border: '1px solid rgba(68,215,182,0.28)',
                            background: '#101721',
                            boxShadow: '0 30px 90px rgba(0,0,0,0.48)',
                            color: '#fff',
                        }}
                    >
                        <div style={{ padding: '26px 28px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                            <div>
                                <h2 style={{ margin: '0 0 8px', fontSize: 26, letterSpacing: 0 }}>후기 작성</h2>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6 }}>수익인증 이미지와 후기 글을 함께 등록해주세요.</p>
                            </div>
                            <button type="button" onClick={closeModal} style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#0b111a', color: '#fff', fontSize: 20, cursor: 'pointer' }}>x</button>
                        </div>

                        <div style={{ padding: 28 }}>
                            <label style={{ display: 'block', fontWeight: 900, marginBottom: 10 }}>수익인증 이미지</label>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    width: '100%',
                                    minHeight: 48,
                                    borderRadius: 8,
                                    border: '1px solid rgba(68,215,182,0.42)',
                                    background: 'rgba(68,215,182,0.10)',
                                    color: '#8ff5d4',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    marginBottom: 12,
                                }}
                            >
                                {proofImage ? '이미지 다시 선택하기' : '이미지 선택하기'}
                            </button>
                            {proofImage && (
                                <div style={{ marginBottom: 18, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, background: '#080d14', overflow: 'hidden' }}>
                                    <img src={proofImage} alt="선택한 수익인증 미리보기" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }} />
                                    <div style={{ padding: '9px 12px', color: 'rgba(255,255,255,0.58)', fontSize: 12 }}>{proofImageName}</div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12, marginBottom: 12 }}>
                                <input type="text" placeholder="닉네임 선택" maxLength={20} value={author} onChange={(e) => setAuthor(e.target.value)} style={inputBase} />
                                <input type="email" placeholder="이메일 선택, 공개 안 됨" value={email} onChange={(e) => setEmail(e.target.value)} style={inputBase} />
                            </div>

                            <label style={{ display: 'block', fontWeight: 900, marginBottom: 10 }}>후기 글</label>
                            <textarea rows={6} placeholder="사용 후 느낀 점, 수익 변화, 구매 전 고민이 해결된 지점을 적어주세요." maxLength={800} value={reviewText} onChange={(e) => setReviewText(e.target.value)} style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65, marginBottom: 14 }} />

                            <button
                                onClick={submitReview}
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    minHeight: 50,
                                    borderRadius: 8,
                                    border: 'none',
                                    background: submitting ? '#233044' : '#16c47f',
                                    color: submitting ? 'rgba(255,255,255,0.5)' : '#061018',
                                    fontSize: 15,
                                    fontWeight: 900,
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {submitting ? '등록 중...' : '후기 등록하기'}
                            </button>

                            {msg && (
                                <div style={{
                                    marginTop: 14,
                                    padding: 13,
                                    borderRadius: 8,
                                    fontSize: 13,
                                    textAlign: 'center',
                                    background: msg.type === 'success' ? 'rgba(68,215,182,0.10)' : 'rgba(255,92,117,0.10)',
                                    border: `1px solid ${msg.type === 'success' ? 'rgba(68,215,182,0.34)' : 'rgba(255,92,117,0.28)'}`,
                                    color: msg.type === 'success' ? '#8ff5d4' : '#ff9aaa',
                                }}>{msg.text}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReviewsPage;
