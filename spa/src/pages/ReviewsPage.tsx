import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import SplitWords from '../components/motion/SplitWords';
import { mergeAdsenseProofs } from '../lib/adsenseProofs';
import { isValidEmail, isValidPhone, maskContactText, maskEmail, maskPhone } from '../lib/privacy';
import {
    fetchSiteContent,
    managedHomeProofsToIncomeProofs,
    type CommunityIncomeProof,
} from '../lib/siteOps';
import { light, lightRadius, type as typeScale } from '../styles/tokens';

/**
 * 후기 페이지
 * - 실제 서버 후기만 노출합니다. 더미 후기는 사용하지 않습니다.
 * - 작성은 수익인증 이미지 + 후기 글 중심의 모달로 처리합니다.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const EDGE_URL = 'https://leaderspro-edge.leword.workers.dev'; // 읽기 전용 캐시 방패 (siteOps 참고)
// v3: summary(100자 절단)가 아니라 detail(전문)을 싣는다 — 옛 캐시는 잘린 글이라 버린다.
const REVIEWS_CACHE_KEY = 'leaderspro_reviews_cache_v3';
const REVIEWS_TIMEOUT_MS = 4500;
const MAX_MEDIA_BYTES = 18 * 1024 * 1024;

const AVATAR_COLORS: Array<[string, string]> = [
    ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
    ['#fdcb6e', '#e17055'], ['#a8edea', '#fed6e3'], ['#ff9a9e', '#fad0c4'],
    ['#c2e9fb', '#a1c4fd'], ['#fbc2eb', '#a6c1ee'],
];

// 제품 페이지(components/products/ReviewQuotes)도 같은 정리 · 가리기를 쓴다(2026-10-07).
export interface Testimonial {
    author: string;
    role?: string;
    /** 작성 시각 — 화면에 날짜로 적는다. 없으면 비운다. */
    timestamp?: string;
    text: string;
    image?: string;
    mediaType?: 'image' | 'video';
    imageAlt?: string;
    badge?: string;
    gradient?: string;
    email?: string;
    phone?: string;
}

/**
 * 글쓴이가 넣은 줄바꿈을 문단으로 되살린다.
 *
 * 44건 중 28건이 여러 줄로 쓰였다(실측). 한 덩어리로 뭉치면 읽는 흐름이
 * 사라진다 — 그 줄바꿈이 곧 글쓴이가 정한 읽는 속도다.
 */
function toParas(text: string): string[] {
    return String(text || '')
        .split(String.fromCharCode(10))
        .map((line) => line.replace(String.fromCharCode(13), '').trim())
        .filter(Boolean);
}

/** '2026-03-31T…' → '2026-03-31'. 못 읽으면 빈 문자열 — 지어내지 않는다. */
function fmtDate(value?: string): string {
    const at = new Date(String(value || ''));
    if (Number.isNaN(at.getTime())) return '';
    return at.toISOString().slice(0, 10);
}

/** 자세히 쓴 글을 가르는 기준. 이 아래는 짧은 한마디로 본다. */
const LONG_REVIEW_CHARS = 300;

/** Short reviews shown before [후기 더 보기]. The rest stay in the DOM, hidden. */
const SHORTS_FIRST = 12;
/** Lines of a short review shown before [더 보기]. */
const CLAMP_LINES = 6;

/** Second-rank button: white face, quiet line. */
const quietButton: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 48, padding: '12px 24px',
    borderRadius: lightRadius.control, border: `1px solid ${light.lineStrong}`,
    background: light.surface, color: light.text,
    fontSize: typeScale.body, fontWeight: 500, cursor: 'pointer',
};

const fieldLabel: CSSProperties = {
    display: 'block', fontSize: typeScale.small, fontWeight: 600, color: light.text, marginBottom: 8,
};

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

export function normalizeReview(raw: any): Testimonial | null {
    const email = firstText(raw?.email);
    const phone = firstText(raw?.phone, raw?.tel, raw?.mobile);
    const author = firstText(raw?.author, raw?.name, raw?.nickname, email ? maskEmail(email) : '', '익명');
    /*
     * detail 이 summary 보다 먼저다. GAS 목록은 summary(100자에서 자름)와
     * detail(전문)을 같이 주는데, summary 를 먼저 집으면 모든 후기가 100자에서
     * 끊긴다(사장님 2026-09-06 "후기 글이 짤림" — 실측: summary 100자 vs detail 최대 379자).
     */
    const text = firstText(raw?.reviewText, raw?.review, raw?.text, raw?.detail, raw?.summary);
    const image = firstText(raw?.proofMedia, raw?.proofImage, raw?.video, raw?.videoUrl, raw?.image, raw?.imageUrl, raw?.proof, raw?.screenshot);
    const mediaType = firstText(raw?.mediaType).startsWith('video') || image.startsWith('data:video') ? 'video' : 'image';
    const role = firstText(raw?.role, raw?.period, raw?.usagePeriod, raw?.product);
    const badge = firstText(raw?.badge, image ? (mediaType === 'video' ? '수익인증 영상 포함' : '수익인증 이미지 포함') : '');

    if (!text && !image) return null;
    return {
        author,
        role,
        timestamp: firstText(raw?.timestamp, raw?.date, raw?.createdAt),
        text: maskContactText(text || '수익인증 자료를 등록한 후기입니다.'),
        image,
        mediaType,
        imageAlt: firstText(raw?.imageAlt, raw?.alt, `${author} 수익인증 이미지`),
        badge,
        gradient: pickAvatarGradient(author),
        email: email ? maskEmail(email) : '',
        phone: phone ? maskPhone(phone) : '',
    };
}

function readCachedReviews(): Testimonial[] {
    try {
        const raw = window.localStorage.getItem(REVIEWS_CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Testimonial[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeCachedReviews(items: Testimonial[]) {
    try {
        window.localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify(items.slice(0, 80)));
    } catch {
        /* local cache is optional */
    }
}

function ReviewsPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    /*
     * 길이로 두 갈래로 나눈다 — 자세히 쓴 글은 앞에 넓게, 짧은 한마디는 격자로.
     * 앞세우는 것은 셋까지다. 그 이상이면 '앞세운다'는 말이 무의미해진다.
     */
    const featured = useMemo(
        () => testimonials.filter((t) => (t.text || '').length >= LONG_REVIEW_CHARS).slice(0, 3),
        [testimonials],
    );
    const shorts = useMemo(
        () => testimonials.filter((t) => !featured.includes(t)),
        [testimonials, featured],
    );
    const [loading, setLoading] = useState(true);
    const [showAllShorts, setShowAllShorts] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [author, setAuthor] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [reviewText, setReviewText] = useState('');
    const [proofMedia, setProofMedia] = useState('');
    const [proofMediaName, setProofMediaName] = useState('');
    const [proofMediaType, setProofMediaType] = useState<'image' | 'video'>('image');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    /*
     * 운영자가 등록한 인증 이미지(hero.proofs) — 네이버 조회수·방문자 인증 11장이
     * 여기 있다.
     *
     * 왜 여기서 다시 부르나(사장님 2026-08-23 "커뮤니티에 있던 네이버 수익인증은
     * 어디 갔니, 인증 이미지 말이야"): 수익인증을 커뮤니티에서 후기로 옮길 때
     * (7ca10baf) 애드센스 5장만 가져오고 이 11장을 두고 왔다. 커뮤니티 쪽에서는
     * 지웠으니 사이트 어디에서도 '수익 인증' 판에 안 나오게 됐다.
     *
     * 합치는 방식도 고쳤다. 커뮤니티는 `서버후기.length > 0 ? 서버후기 : 관리목록`
     * 이라 서버 후기가 한 건이라도 있으면 이 11장이 통째로 가려졌다 — 둘은 성격이
     * 다르니 고르는 게 아니라 같이 세운다.
     */
    const [managedProofs, setManagedProofs] = useState<CommunityIncomeProof[]>([]);
    useEffect(() => {
        let active = true;
        fetchSiteContent()
            .then((content) => {
                if (active) setManagedProofs(managedHomeProofsToIncomeProofs(content?.hero?.proofs, 24));
            })
            .catch(() => undefined);
        return () => { active = false; };
    }, []);

    /** 인증 갤러리 = 운영자 등록분 + 애드센스 성과. 같은 그림은 mergeAdsenseProofs 가 거른다. */
    const proofGallery = useMemo(() => mergeAdsenseProofs(managedProofs), [managedProofs]);

    /*
     * 눌러서 크게 본다(사장님 2026-09-06 "수익인증 후기도 클릭하면 이미지를 크게").
     * 격자의 170px 잘린 썸네일로는 조회수·금액 숫자가 안 읽힌다 — 원본 비율 그대로 편다.
     */
    const [zoomProof, setZoomProof] = useState<CommunityIncomeProof | null>(null);
    useEffect(() => {
        if (!zoomProof) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setZoomProof(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zoomProof]);

    useEffect(() => {
        const prev = document.title;
        document.title = '후기 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        const cached = readCachedReviews();
        if (cached.length > 0) {
            setTestimonials(cached);
            setLoading(false);
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), REVIEWS_TIMEOUT_MS);

        (async () => {
            try {
                // 읽기는 엣지 캐시 방패로 — 캐시 적중 0.5초 (siteOps 의 EDGE_URL 설명 참고)
                const res = await fetch(`${EDGE_URL}?action=get-reviews`, { cache: 'no-store', signal: controller.signal });
                const data = await res.json();
                const list = Array.isArray(data?.reviews) ? data.reviews : [];
                const normalized = list.map(normalizeReview).filter(Boolean) as Testimonial[];
                setTestimonials(normalized);
                writeCachedReviews(normalized);
            } catch {
                if (cached.length === 0) setTestimonials([]);
            } finally {
                window.clearTimeout(timer);
                setLoading(false);
            }
        })();

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, []);

    const inputBase: CSSProperties = {
        width: '100%',
        minHeight: 48,
        padding: '12px 16px',
        background: light.surface,
        border: `1px solid ${light.lineStrong}`,
        borderRadius: lightRadius.control,
        color: light.text,
        fontSize: typeScale.body,
    };

    const closeModal = () => {
        if (submitting) return;
        setModalOpen(false);
        setMsg(null);
    };

    const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            setMsg({ text: '이미지 또는 동영상 파일만 선택할 수 있습니다.', type: 'error' });
            return;
        }
        if (file.size > MAX_MEDIA_BYTES) {
            setMsg({ text: '파일은 18MB 이하로 선택해주세요.', type: 'error' });
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setProofMedia(String(reader.result || ''));
            setProofMediaName(file.name);
            setProofMediaType(file.type.startsWith('video/') ? 'video' : 'image');
            setMsg(null);
        };
        reader.onerror = () => setMsg({ text: '파일을 읽지 못했습니다. 다른 파일을 선택해주세요.', type: 'error' });
        reader.readAsDataURL(file);
    };

    const submitReview = async () => {
        if (!email.trim() || !isValidEmail(email)) {
            setMsg({ text: '정확한 이메일을 입력해주세요.', type: 'error' });
            return;
        }
        if (!phone.trim() || !isValidPhone(phone)) {
            setMsg({ text: '정확한 휴대폰 번호를 입력해주세요.', type: 'error' });
            return;
        }
        if (!proofMedia) {
            setMsg({ text: '수익인증 이미지 또는 동영상을 선택해주세요.', type: 'error' });
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
                phone: phone.trim(),
                publicEmail: maskEmail(email),
                publicPhone: maskPhone(phone),
                rating: 5,
                summary: maskContactText(reviewText.trim()).slice(0, 120),
                detail: maskContactText(reviewText.trim()),
                reviewText: maskContactText(reviewText.trim()),
                proofMedia,
                proofImage: proofMedia,
                image: proofMedia,
                mediaType: proofMediaType,
                imageName: proofMediaName,
                mediaName: proofMediaName,
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
                setPhone('');
                setReviewText('');
                setProofMedia('');
                setProofMediaName('');
                setProofMediaType('image');
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
            <section className="reviews-page-shell" style={{ padding: '120px 24px 96px', maxWidth: 1200, margin: '0 auto' }}>
                <div className="reviews-page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 64, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: typeScale.h1, lineHeight: 1.2, fontWeight: 700, margin: '0 0 12px', letterSpacing: 0, color: light.text }}><SplitWords text="실제 사용자 후기" /></h1>
                        <p style={{ color: light.textSecondary, fontSize: typeScale.body, lineHeight: 1.7, margin: 0 }}>수익인증 이미지/동영상과 후기 글이 함께 등록된 실제 후기만 보여드립니다.</p>
                    </div>
                    <button
                        type="button"
                        className="lp-lift lp-sheen"
                        onClick={() => { setModalOpen(true); setMsg(null); }}
                        style={{
                            minHeight: 48,
                            padding: '12px 24px',
                            borderRadius: lightRadius.control,
                            border: 'none',
                            background: light.accent,
                            color: light.onAccent,
                            fontSize: typeScale.body,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        후기 작성
                    </button>
                </div>

                {/*
                  * 수익 인증 — 후기 판이 곧 수익인증 판이다(사장님 지시 2026-08-23
                  * "수익인증은 후기로 가야 되고 탭도 수익인증 및 후기로"). 사용자 후기
                  * 앞에 세운다. 네이버 조회수·방문자 인증과 애드센스 성과를 함께 둔다 —
                  * 전부 화면 그대로이고 여기서 만든 수치는 없다.
                  */}
                <div className="rv-sec">
                    <h2>수익 인증</h2>
                    <span>네이버 조회수·방문자와 애드센스 화면 실측 그대로입니다</span>
                </div>
                <div className="rv-proofs">
                    {proofGallery.map((proof) => (
                        <figure key={proof.id}>
                            <button
                                type="button"
                                className="rv-proof-open"
                                onClick={() => { if (proof.media) setZoomProof(proof); }}
                                aria-label={`${proof.amount} 수익인증 크게 보기`}
                            >
                                <img src={proof.media} alt={proof.mediaName || proof.amount} loading="lazy" decoding="async" />
                            </button>
                            <figcaption>
                                <b>{proof.amount}</b>
                                <span>{proof.desc}</span>
                            </figcaption>
                        </figure>
                    ))}
                </div>

                {loading ? (
                    <div className="rv-empty">후기를 불러오는 중입니다.</div>
                ) : testimonials.length === 0 ? (
                    <div className="rv-empty">
                        <h2>아직 공개된 후기가 없습니다</h2>
                        <p>더미 후기는 표시하지 않습니다. 실제 후기가 승인되면 이곳에 나옵니다.</p>
                    </div>
                ) : (
                    <>
                        {/*
                          * 길이에 따라 자리가 다르다(사장님 선택 2026-08-21).
                          * 자세히 쓴 글은 읽히라고 쓴 것이라 앞에 넓게 두고 접지 않는다.
                          * 짧은 한마디는 뒤에 두 줄 목록으로 — 높이는 글이 정한다.
                          */}
                        {featured.length > 0 && (
                            <>
                                <div className="rv-sec">
                                    <h2>자세히 쓴 후기</h2>
                                    <span>쓰는 데 몇 분씩 들인 글입니다. 접지 않고 그대로 싣습니다</span>
                                </div>
                                <div className="rv-feats">
                                    {featured.map((t, i) => (
                                        <article className="rv-feat" key={`f-${t.author}-${i}`}>
                                            <div className="rv-feat-text">
                                                {toParas(t.text).map((para, k) => <p key={k}>{para}</p>)}
                                            </div>
                                            <footer>
                                                <span className="rv-who">{t.author}</span>
                                                <span className="rv-stars">{'★'.repeat(5)}</span>
                                                {t.role && <span className="rv-role">{t.role}</span>}
                                                <time>{fmtDate(t.timestamp)}</time>
                                            </footer>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}

                        {shorts.length > 0 && (
                            <>
                                <div className="rv-sec">
                                    <h2>나머지 후기</h2>
                                    <span>짧게 남긴 한마디</span>
                                </div>
                                <div className="rv-grid">
                                    {shorts.map((t, i) => (
                                        <ShortReview
                                            key={`s-${t.author}-${i}`}
                                            item={t}
                                            hidden={!showAllShorts && i >= SHORTS_FIRST}
                                        />
                                    ))}
                                </div>
                                {!showAllShorts && shorts.length > SHORTS_FIRST && (
                                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
                                        <button type="button" onClick={() => setShowAllShorts(true)} style={quietButton}>
                                            후기 더 보기
                                            <span style={{ color: light.textMuted, fontVariantNumeric: 'tabular-nums' }}>{shorts.length - SHORTS_FIRST}개</span>
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </section>

            <style>{`
                /* Reviews page. Detailed reviews run wide and unfolded; short ones sit in a
                   two-column ruled list. Height follows the text. */
                .rv-empty {
                    padding: 40px 24px; border-radius: ${lightRadius.card}px; text-align: center;
                    border: 1px solid ${light.line}; background: ${light.surface};
                    color: ${light.textSecondary}; font-size: ${typeScale.body}px; line-height: 1.7;
                }
                .rv-empty h2 { margin: 0 0 8px; font-size: ${typeScale.h3}px; font-weight: 600; color: ${light.text}; }
                .rv-empty p { margin: 0; }

                .rv-sec { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0 0 20px; }
                .rv-sec h2 { margin: 0; font-size: ${typeScale.h3}px; font-weight: 600; letter-spacing: 0; color: ${light.text}; }
                .rv-sec span { color: ${light.textSecondary}; font-size: ${typeScale.small}px; }

                .rv-proofs { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin: 0 0 64px; }
                .rv-proofs figure { margin: 0; border: 1px solid ${light.line}; border-radius: ${lightRadius.card}px; overflow: hidden; background: ${light.surface}; }
                /* The thumbnail is a button: it opens the picture at its own ratio. */
                .rv-proof-open { display: block; width: 100%; padding: 0; margin: 0; border: none; background: none; cursor: zoom-in; }
                .rv-proofs img { display: block; width: 100%; height: 170px; object-fit: cover; object-position: top; background: ${light.raised}; border-bottom: 1px solid ${light.line}; }
                .rv-proofs figcaption { padding: 12px 16px 16px; }
                .rv-proofs b { display: block; font-size: ${typeScale.small}px; font-weight: 600; color: ${light.text}; font-variant-numeric: tabular-nums; }
                .rv-proofs span { display: block; margin-top: 4px; font-size: ${typeScale.meta}px; line-height: 1.6; color: ${light.textSecondary}; }

                .rv-feats { margin-bottom: 64px; border-bottom: 1px solid ${light.line}; }
                .rv-feat {
                    display: grid; grid-template-columns: 200px minmax(0, 760px); column-gap: 40px;
                    padding: 32px 0; border-top: 1px solid ${light.line};
                }
                .rv-feat-text { grid-column: 2; grid-row: 1; }
                .rv-feat-text p { margin: 0 0 12px; font-size: ${typeScale.body}px; line-height: 1.8; color: ${light.text}; word-break: keep-all; overflow-wrap: anywhere; }
                .rv-feat-text p:last-child { margin-bottom: 0; }
                .rv-feat footer {
                    grid-column: 1; grid-row: 1;
                    display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
                }
                .rv-who { font-size: ${typeScale.small}px; font-weight: 600; color: ${light.text}; overflow-wrap: anywhere; }
                .rv-stars { color: ${light.accentInk}; font-size: ${typeScale.meta}px; line-height: 1; letter-spacing: 2px; }
                .rv-role { font-size: ${typeScale.meta}px; color: ${light.textSecondary}; }
                .rv-feat time, .rv-card time { color: ${light.textMuted}; font-size: ${typeScale.meta}px; font-variant-numeric: tabular-nums; }

                .rv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 64px; border-bottom: 1px solid ${light.line}; }
                .rv-card { padding: 24px 0; border-top: 1px solid ${light.line}; }
                .rv-card[hidden] { display: none; }
                .rv-card header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
                .rv-card .rv-body p { margin: 0 0 8px; color: ${light.text}; font-size: ${typeScale.body}px; line-height: 1.75; word-break: keep-all; overflow-wrap: anywhere; }
                .rv-card .rv-body p:last-child { margin-bottom: 0; }
                /* Folded by CSS only: every word stays in the page for readers and search. */
                .rv-body.is-folded { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: ${CLAMP_LINES}; line-clamp: ${CLAMP_LINES}; overflow: hidden; }
                .rv-card footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
                .rv-card footer time { margin-left: auto; }
                .rv-more {
                    display: inline-flex; align-items: center; min-height: 44px; margin-top: 4px; padding: 0;
                    border: none; background: none; color: ${light.accentInk}; font-size: ${typeScale.small}px; font-weight: 500;
                    text-decoration: underline; text-underline-offset: 4px; cursor: pointer;
                }

                @media (max-width: 860px) {
                    .rv-grid { grid-template-columns: minmax(0, 1fr); }
                    .rv-feat { grid-template-columns: minmax(0, 1fr); row-gap: 20px; padding: 24px 0; }
                    .rv-feat-text, .rv-feat footer { grid-column: 1; grid-row: auto; }
                    .rv-feat footer { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 12px; }
                    .rv-feat footer time { margin-left: auto; }
                }

                @media (max-width: 640px) {
                    .reviews-page-shell { padding: 104px 16px 64px !important; }
                    .reviews-page-head { align-items: flex-start !important; margin-bottom: 40px !important; }
                    .reviews-page-head h1 { font-size: ${typeScale.h1Mobile}px !important; }
                    .reviews-page-head button { width: 100%; }
                    .rv-proofs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 48px; }
                    .rv-proofs img { height: 132px; }
                    .rv-proofs figcaption { padding: 12px; }
                    .rv-feats { margin-bottom: 48px; }
                    .review-modal-panel { width: 100% !important; max-height: calc(100dvh - 104px) !important; }
                    .reviews-contact-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>

            {zoomProof && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${zoomProof.amount} 수익인증 크게 보기`}
                    onClick={() => setZoomProof(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 10001,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 16, padding: 20,
                        // The dark veil stays: it is there so the picture can be read.
                        background: 'rgba(20, 24, 28, 0.72)',
                        cursor: 'zoom-out',
                    }}
                >
                    <img
                        src={zoomProof.media}
                        alt={zoomProof.mediaName || zoomProof.amount}
                        style={{ maxWidth: 'min(1100px, 94vw)', maxHeight: '80vh', objectFit: 'contain', borderRadius: lightRadius.card, background: light.surface }}
                    />
                    <div style={{ textAlign: 'center', color: light.onBtn }}>
                        <b style={{ fontSize: typeScale.body, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{zoomProof.amount}</b>
                        <div style={{ marginTop: 4, fontSize: typeScale.small, color: 'rgba(255, 255, 255, 0.82)' }}>{zoomProof.desc}</div>
                    </div>
                    <button
                        type="button"
                        aria-label="닫기"
                        onClick={() => setZoomProof(null)}
                        style={{
                            position: 'absolute', top: 16, right: 16, width: 44, height: 44,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: light.surface, border: `1px solid ${light.line}`, borderRadius: lightRadius.control,
                            color: light.text, cursor: 'pointer',
                        }}
                    ><CloseIcon /></button>
                </div>
            )}

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
                        // Top padding clears the fixed navbar, which sits above this page's stacking context.
                        padding: '88px 16px 16px',
                        background: 'rgba(20, 24, 28, 0.5)',
                    }}
                >
                    <div
                        className="review-modal-panel"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(620px, 100%)',
                            maxHeight: 'calc(100vh - 104px)',
                            overflowY: 'auto',
                            borderRadius: lightRadius.panel,
                            border: `1px solid ${light.line}`,
                            background: light.surface,
                            boxShadow: light.shadowFloat,
                            color: light.text,
                        }}
                    >
                        <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${light.line}`, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                            <div>
                                <h2 style={{ margin: '0 0 8px', fontSize: typeScale.h3, fontWeight: 600, letterSpacing: 0 }}>후기 작성</h2>
                                <p style={{ margin: 0, color: light.textSecondary, fontSize: typeScale.small, lineHeight: 1.6 }}>무분별한 등록을 막기 위해 이메일과 휴대폰 번호를 함께 확인합니다.</p>
                            </div>
                            <button
                                type="button"
                                aria-label="닫기"
                                onClick={closeModal}
                                style={{
                                    flex: 'none', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: lightRadius.control, border: `1px solid ${light.line}`, background: light.surface, color: light.text, cursor: 'pointer',
                                }}
                            ><CloseIcon /></button>
                        </div>

                        <div style={{ padding: 24 }}>
                            <label style={fieldLabel}>수익인증 이미지/동영상</label>
                            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} style={{ display: 'none' }} />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ ...quietButton, width: '100%', marginBottom: 12 }}
                            >
                                {proofMedia ? '파일 다시 선택하기' : '이미지 또는 동영상 선택하기'}
                            </button>
                            {proofMedia && (
                                <div style={{ marginBottom: 20, border: `1px solid ${light.line}`, borderRadius: lightRadius.control, background: light.raised, overflow: 'hidden' }}>
                                    {proofMediaType === 'video' ? (
                                        <video src={proofMedia} controls playsInline style={{ width: '100%', maxHeight: 300, display: 'block' }} />
                                    ) : (
                                        <img src={proofMedia} alt="선택한 수익인증 미리보기" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }} />
                                    )}
                                    <div style={{ padding: '8px 12px', color: light.textMuted, fontSize: typeScale.meta, overflowWrap: 'anywhere' }}>{proofMediaName}</div>
                                </div>
                            )}

                            <div className="reviews-contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12, margin: '8px 0 12px' }}>
                                <input type="text" placeholder="닉네임 선택" maxLength={20} value={author} onChange={(e) => setAuthor(e.target.value)} style={inputBase} />
                                <input type="email" placeholder="이메일 필수, 공개 시 마스킹" value={email} onChange={(e) => setEmail(e.target.value)} style={inputBase} />
                            </div>
                            <input type="tel" placeholder="휴대폰 번호 필수, 공개 시 010-****-**** 처리" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputBase, marginBottom: 20 }} />

                            <label style={fieldLabel}>후기 글</label>
                            <textarea rows={6} placeholder="사용 후 느낀 점, 수익 변화, 구매 전 고민이 해결된 지점을 적어주세요. 본문 속 이메일/폰번호는 자동으로 가려집니다." maxLength={800} value={reviewText} onChange={(e) => setReviewText(e.target.value)} style={{ ...inputBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.65, marginBottom: 16 }} />

                            <button
                                onClick={submitReview}
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    minHeight: 48,
                                    borderRadius: lightRadius.control,
                                    border: 'none',
                                    background: submitting ? light.raised : light.accent,
                                    color: submitting ? light.textMuted : light.onAccent,
                                    fontSize: typeScale.body,
                                    fontWeight: 600,
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {submitting ? '등록 중...' : '후기 등록하기'}
                            </button>

                            {msg && (
                                <div style={{
                                    marginTop: 16,
                                    padding: 12,
                                    borderRadius: lightRadius.control,
                                    fontSize: typeScale.small,
                                    lineHeight: 1.6,
                                    textAlign: 'center',
                                    background: msg.type === 'success' ? light.positiveSoft : light.negativeSoft,
                                    color: msg.type === 'success' ? light.positive : light.negative,
                                }}>{msg.text}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Close mark for the two dialogs: 24 grid, stroke 1.5, follows the text colour. */
function CloseIcon() {
    return (
        <svg aria-hidden="true" focusable="false" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
        </svg>
    );
}

/**
 * One short review in the ruled list.
 * Long text is folded with CSS line-clamp, so the whole review stays in the DOM;
 * the toggle only appears when the text really overflows.
 */
function ShortReview({ item, hidden }: { item: Testimonial; hidden: boolean }) {
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [overflows, setOverflows] = useState(false);

    useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!el || open || hidden) return;
        let active = true;
        const measure = () => { if (active) setOverflows(el.scrollHeight > el.clientHeight + 2); };
        measure();
        // Web fonts can change the line count after the first paint.
        document.fonts?.ready.then(measure).catch(() => undefined);
        window.addEventListener('resize', measure);
        return () => { active = false; window.removeEventListener('resize', measure); };
    }, [open, hidden, item.text]);

    return (
        <article className="rv-card" hidden={hidden}>
            <header>
                <span className="rv-who">{item.author}</span>
                <span className="rv-stars">{'★'.repeat(5)}</span>
            </header>
            <div ref={bodyRef} className={open ? 'rv-body' : 'rv-body is-folded'}>
                {toParas(item.text).map((para, k) => <p key={k}>{para}</p>)}
            </div>
            {(overflows || open) && (
                <button type="button" className="rv-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                    {open ? '접기' : '더 보기'}
                </button>
            )}
            {(item.image || item.role) && (
                <footer>
                    {item.role ? <span className="rv-role">{item.role}</span> : <span />}
                    <time>{fmtDate(item.timestamp)}</time>
                </footer>
            )}
        </article>
    );
}

export default ReviewsPage;
