import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import PostsPanel from '../components/community/PostsPanel';
import { Link } from 'react-router-dom';
import { isValidEmail, isValidPhone, maskContactText, maskEmail, maskPhone } from '../lib/privacy';
import {
    fetchCommunityIncomeProofs,
    fetchSiteContent,
    managedHomeProofsToIncomeProofs,
    type CommunityIncomeProof,
} from '../lib/siteOps';

/**
 * 커뮤니티
 * - 공지사항은 홈에서 바로 확인하고, 커뮤니티는 수익 인증/활용 팁에 집중합니다.
 * - 수익 인증은 홈과 동일한 공유 로더를 사용하고 로컬 미디어 캐시를 만들지 않습니다.
 * - 활용 팁만 로컬 캐시로 먼저 보여준 뒤 서버 최신본으로 갱신합니다.
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const COMMUNITY_CACHE_KEY = 'leaderspro_community_cache_v3';
const COMMUNITY_CACHE_TTL_MS = 15 * 60 * 1000;
const COMMUNITY_TIMEOUT_MS = 4800;
const COMMUNITY_RESPONSE_MAX_BYTES = 32 * 1024 * 1024;
const COMMUNITY_DATA_MEDIA_MAX_CHARS = 32 * 1024 * 1024;
const MAX_MEDIA_BYTES = 18 * 1024 * 1024;

type TabKey = 'income' | 'tips' | 'posts';
type WriteKind = 'income' | 'tips';

interface CommunityMedia { media?: string; mediaType?: 'image' | 'video'; mediaName?: string; }
interface Tip extends CommunityMedia { author?: string; title: string; detail: string; timestamp?: string; email?: string; phone?: string; }

interface CommunityCache {
    tips: Tip[];
    cachedAt: number;
}

const panelStyle: CSSProperties = {
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(15,23,42,0.86), rgba(6,10,18,0.92))',
    boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
};

const fieldStyle: CSSProperties = {
    width: '100%',
    padding: '13px 14px',
    background: '#0d121b',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
};

function firstText(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function normalizeMedia(raw: any): CommunityMedia {
    const media = firstText(raw?.proofMedia, raw?.media, raw?.mediaUrl, raw?.proofImage, raw?.image, raw?.imageUrl, raw?.video, raw?.videoUrl);
    let safeMedia = '';
    if (/^data:(?:image\/(?:png|jpe?g|webp|gif|avif)|video\/(?:mp4|webm|ogg|quicktime));base64,/i.test(media)
        && media.length <= COMMUNITY_DATA_MEDIA_MAX_CHARS) {
        safeMedia = media;
    } else if (media.startsWith('/') && !media.startsWith('//') && !media.includes('\\') && media.length <= 4096) {
        safeMedia = media;
    } else if (media.length <= 4096) {
        try {
            const parsed = new URL(media);
            const hostname = parsed.hostname.toLocaleLowerCase();
            const trustedHost = hostname === 'leaderspro.kr'
                || hostname === 'www.leaderspro.kr'
                || hostname === 'script.googleusercontent.com'
                || hostname.endsWith('.googleusercontent.com');
            if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && trustedHost) safeMedia = media;
        } catch {
            safeMedia = '';
        }
    }
    const mediaType = firstText(raw?.mediaType).startsWith('video') || media.startsWith('data:video') ? 'video' : 'image';
    return {
        media: safeMedia || undefined,
        mediaType: safeMedia ? mediaType : undefined,
        mediaName: maskContactText(firstText(raw?.mediaName, raw?.imageName, raw?.fileName)).slice(0, 120) || undefined,
    };
}

/**
 * 운영 시드(초기 셋업용 예시 글)를 사용자 글로 오인 노출하지 않는다.
 * 수익인증 쪽에는 이미 같은 차단이 있는데(siteOps.ts) 팁에는 없어서
 * 'Leaders Pro 팀' 명의 시드 2건이 사용자 활용 팁처럼 보였다.
 * 빈 상태 문구가 "실제 사용자가 남긴 활용 팁만 공개됩니다"라 모순이기도 했다.
 */
function isSeedTip(raw: any): boolean {
    if (/^T-seed-\d+$/i.test(String(raw?.id || ''))) return true;
    const author = String(raw?.author || raw?.name || raw?.nickname || '');
    return /^(leaders\s*pro\s*팀|리더스프로\s*팀|운영자|관리자)$/i.test(author.trim());
}

function normalizeTip(raw: any): Tip | null {
    if (isSeedTip(raw)) return null;
    const title = firstText(raw?.title);
    const detail = firstText(raw?.detail, raw?.desc, raw?.text);
    const media = normalizeMedia(raw);
    if (!title && !detail && !media.media) return null;
    const email = firstText(raw?.publicEmail, raw?.email);
    const phone = firstText(raw?.publicPhone, raw?.phone);
    return {
        author: maskContactText(firstText(raw?.author, raw?.name, raw?.nickname, '익명')).slice(0, 80),
        title: maskContactText(title || '활용 팁').slice(0, 160),
        detail: maskContactText(detail || '이미지/영상으로 공유한 활용 팁입니다.'),
        timestamp: maskContactText(firstText(raw?.timestamp, raw?.createdAt, raw?.date)).slice(0, 40),
        email: email ? (email.includes('*') ? email : maskEmail(email)) : '',
        phone: phone ? (phone.includes('*') ? phone : maskPhone(phone)) : '',
        ...media,
    };
}

function readCommunityCache(): CommunityCache | null {
    try {
        const raw = window.localStorage.getItem(COMMUNITY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CommunityCache;
        if (!parsed || !Array.isArray(parsed.tips) || typeof parsed.cachedAt !== 'number') return null;
        const age = Date.now() - parsed.cachedAt;
        if (age < 0 || age > COMMUNITY_CACHE_TTL_MS) return null;
        return {
            tips: parsed.tips.map(normalizeTip).filter(Boolean).slice(0, 80) as Tip[],
            cachedAt: parsed.cachedAt,
        };
    } catch {
        return null;
    }
}

function writeCommunityCache(tips: Tip[]) {
    try {
        const cacheableTips = tips.slice(0, 80).map((tip) => {
            const safe: Tip = {
                author: tip.author,
                title: tip.title,
                detail: tip.detail,
                timestamp: tip.timestamp,
            };
            if (tip.media && !tip.media.toLocaleLowerCase().startsWith('data:')) {
                safe.media = tip.media;
                safe.mediaType = tip.mediaType;
                safe.mediaName = tip.mediaName;
            }
            return safe;
        });
        window.localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify({
            tips: cacheableTips,
            cachedAt: Date.now(),
        }));
    } catch {
        /* cache is optional */
    }
}

async function readBoundedCommunityResponse(res: Response): Promise<unknown> {
    const declaredLength = Number(res.headers.get('content-length') || '');
    if (Number.isFinite(declaredLength) && declaredLength > COMMUNITY_RESPONSE_MAX_BYTES) throw new Error('community response too large');
    if (!res.body) {
        const text = await res.text();
        if (new TextEncoder().encode(text).byteLength > COMMUNITY_RESPONSE_MAX_BYTES) throw new Error('community response too large');
        return JSON.parse(text) as unknown;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > COMMUNITY_RESPONSE_MAX_BYTES) {
                await reader.cancel().catch(() => undefined);
                throw new Error('community response too large');
            }
            text += decoder.decode(chunk.value, { stream: true });
        }
        return JSON.parse(text + decoder.decode()) as unknown;
    } finally {
        reader.releaseLock();
    }
}

const EDGE_URL = 'https://leaderspro-edge.leword.workers.dev'; // 읽기 전용 캐시 방패 (siteOps 참고)
const EDGE_READS = new Set(['get-notices', 'get-tips', 'income-list']);

async function fetchCommunityAction(action: string, signal: AbortSignal): Promise<any> {
    const base = EDGE_READS.has(action) ? EDGE_URL : GAS_URL;
    const res = await fetch(`${base}?action=${action}`, { cache: 'no-store', signal });
    if (!res.ok) throw new Error('community request failed');
    return readBoundedCommunityResponse(res);
}

function CommunityPage() {
    /*
     * 기본 탭은 '내 글 홍보'다(사장님 지시 2026-08-23).
     * 이 판에서 실제로 손이 오가는 곳이라 처음 여는 화면이 거기여야 한다.
     */
    const [tab, setTab] = useState<TabKey>('posts');
    const [income, setIncome] = useState<CommunityIncomeProof[]>([]);
    const [managedIncome, setManagedIncome] = useState<CommunityIncomeProof[]>([]);
    const [tips, setTips] = useState<Tip[]>([]);
    const [loading, setLoading] = useState(true);
    const [incomeUnavailable, setIncomeUnavailable] = useState(false);
    const [writer, setWriter] = useState<WriteKind | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '커뮤니티 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    // 공개 승인 글에 미디어가 아직 없더라도, 관리자가 이미 등록한 실제 성과
    // 캡처는 빈 화면 대신 동일한 그리드에 보여준다. 사이트 콘텐츠 로드는
    // 별도로 진행해 커뮤니티의 기본 목록 응답을 기다리게 하지 않는다.
    useEffect(() => {
        let active = true;
        fetchSiteContent()
            .then((content) => {
                if (!active) return;
                setManagedIncome(managedHomeProofsToIncomeProofs(content?.hero?.proofs, 24));
            })
            .catch(() => undefined);
        return () => { active = false; };
    }, []);

    const refreshCommunity = useCallback(async (silent = false) => {
        const cached = readCommunityCache();
        if (cached) {
            setTips(cached.tips);
        }
        if (!silent) {
            setLoading(true);
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), COMMUNITY_TIMEOUT_MS);
        try {
            const incomePromise = fetchCommunityIncomeProofs(80, { view: 'community', signal: controller.signal });
            const [incomeResult, tipResult] = await Promise.allSettled([
                incomePromise,
                fetchCommunityAction('get-tips', controller.signal),
            ]);

            const nextTips = tipResult.status === 'fulfilled' && tipResult.value?.success
                ? (tipResult.value.tips || []).map(normalizeTip).filter(Boolean) as Tip[]
                : cached?.tips || [];

            if (incomeResult.status === 'fulfilled') {
                const unavailable = incomeResult.value.source === 'unavailable';
                setIncomeUnavailable(unavailable);
                if (!unavailable) setIncome(incomeResult.value.items);
            } else {
                setIncomeUnavailable(true);
            }
            if (tipResult.status === 'fulfilled' && tipResult.value?.success) {
                setTips(nextTips);
                writeCommunityCache(nextTips);
            } else if (cached) {
                setTips(cached.tips);
            }
        } catch {
            if (!cached) {
                setTips([]);
            }
            setIncomeUnavailable(true);
        } finally {
            window.clearTimeout(timer);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshCommunity();
    }, [refreshCommunity]);

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <style>{`
                /* ── 내 글 홍보 판 ─────────────────────────────
                   상호성이 눈에 보여야 판이 돈다: 들른 수를 크게, 상대의
                   품앗이 기록을 카드에 적는다. 화면이 만드는 숫자는 없다. */
                .cp-head { margin-bottom: 22px; }
                .cp-head h2 { margin: 0 0 8px; font-size: 24px; font-weight: 900; }
                .cp-head p { margin: 0; color: rgba(255,255,255,.68); font-size: 14px; }
                .cp-rules { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
                .cp-rules span {
                    padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 700;
                    background: rgba(255,255,255,.055); color: rgba(255,255,255,.72);
                }
                .cp-rules b { color: #5ee3ac; }

                .cp-today {
                    display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px;
                    margin: 0 0 24px; padding: 18px 20px; border-radius: 14px;
                    border: 1px solid rgba(22,196,127,.22);
                    background: radial-gradient(420px 200px at 10% 0%, rgba(22,196,127,.1), transparent 70%), rgba(255,255,255,.03);
                }
                .cp-today div { min-width: 0; }
                .cp-today b { display: block; font-size: 24px; font-weight: 900; font-variant-numeric: tabular-nums; }
                .cp-today div:nth-child(1) b { color: #5ee3ac; }
                .cp-today div:nth-child(3) b { color: #f0b53f; }
                .cp-today span { display: block; margin-top: 2px; color: rgba(255,255,255,.5); font-size: 12px; }
                @media (max-width: 620px) { .cp-today { grid-template-columns: 1fr; gap: 14px; } }

                .cp-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
                .cp-chips { display: flex; gap: 7px; flex-wrap: wrap; }
                .cp-chips button {
                    padding: 7px 14px; border-radius: 999px; cursor: pointer; font: inherit;
                    font-size: 12.5px; font-weight: 700; border: 1px solid rgba(255,255,255,.1);
                    background: transparent; color: rgba(255,255,255,.5);
                }
                .cp-chips button.on { background: #16c47f; border-color: #16c47f; color: #061018; font-weight: 900; }
                .cp-chips em { font-style: normal; opacity: .72; margin-left: 4px; }
                .cp-write {
                    margin-left: auto; padding: 11px 20px; border-radius: 9px; border: 0; cursor: pointer;
                    background: #16c47f; color: #061018; font: inherit; font-size: 13.5px; font-weight: 900;
                }

                .cp-composer {
                    margin-bottom: 24px; padding: 22px; border-radius: 16px;
                    border: 1px solid rgba(22,196,127,.25); background: rgba(255,255,255,.03);
                }
                .cp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                @media (max-width: 620px) { .cp-row { grid-template-columns: 1fr; } }
                .cp-composer label, .cp-field { display: block; margin-bottom: 13px; }
                .cp-composer label > span, .cp-field > span {
                    display: block; margin-bottom: 5px; font-size: 12.5px; font-weight: 800; color: rgba(255,255,255,.78);
                }
                .cp-composer label i { font-style: normal; font-weight: 400; color: rgba(255,255,255,.42); }
                .cp-composer input, .cp-composer textarea {
                    width: 100%; box-sizing: border-box; padding: 11px 13px; border-radius: 9px;
                    font: inherit; font-size: 13.5px; border: 1px solid rgba(255,255,255,.1);
                    background: rgba(0,0,0,.32); color: #eef2f8;
                }
                .cp-composer textarea { min-height: 64px; resize: vertical; }
                .cp-composer input[readonly] { color: rgba(255,255,255,.78); }
                .cp-field em {
                    display: block; margin-top: 5px; font-style: normal;
                    color: rgba(255,255,255,.42); font-size: 11.5px; line-height: 1.55;
                }
                .cp-field em.ok { color: #5ee3ac; }
                .cp-msg { margin: 4px 0 0; font-size: 12.5px; }
                .cp-msg.ok { color: #5ee3ac; }
                .cp-msg.error { color: #ff8fa0; }
                .cp-composer-foot { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
                .cp-composer-foot span { color: rgba(255,255,255,.42); font-size: 12px; }
                .cp-composer-foot button {
                    margin-left: auto; padding: 12px 24px; border-radius: 9px; border: 0; cursor: pointer;
                    background: #16c47f; color: #061018; font: inherit; font-size: 13.5px; font-weight: 900;
                }
                .cp-composer-foot button:disabled { opacity: .6; cursor: not-allowed; }

                .cp-empty {
                    padding: 40px 24px; border-radius: 14px; text-align: center;
                    border: 1px solid rgba(255,255,255,.09); background: rgba(255,255,255,.03);
                    color: rgba(255,255,255,.6);
                }
                .cp-empty b { display: block; margin-bottom: 8px; font-size: 17px; color: #fff; }
                .cp-empty p { margin: 0; }

                .cp-list { display: grid; gap: 10px; }
                .cp-post {
                    display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; align-items: center;
                    padding: 16px 18px; border-radius: 13px;
                    border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03);
                    opacity: 0; animation: cpUp 400ms cubic-bezier(.2,.8,.3,1) forwards;
                    animation-delay: calc(.1s + var(--i) * .04s);
                }
                @keyframes cpUp { from { opacity:0; transform: translateY(10px);} to { opacity:1; transform:none;} }
                @media (max-width: 620px) { .cp-post { grid-template-columns: 1fr; gap: 12px; } }
                .cp-post-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
                .cp-plat { padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; background: rgba(255,255,255,.06); color: rgba(255,255,255,.6); }
                .cp-plat.naver { background: rgba(3,199,90,.14); color: #4ade80; }
                .cp-plat.tistory { background: rgba(255,90,0,.14); color: #ff9e66; }
                .cp-plat.blogspot { background: rgba(255,168,0,.14); color: #ffc966; }
                .cp-when { color: rgba(255,255,255,.4); font-size: 11.5px; }
                .cp-post h3 { margin: 0 0 4px; font-size: 15.5px; font-weight: 700; line-height: 1.45; }
                .cp-post h3 a { color: #eef2f8; text-decoration: none; }
                .cp-post h3 a:hover { color: #5ee3ac; }
                .cp-desc { margin: 0 0 7px; color: rgba(255,255,255,.7); font-size: 13px; line-height: 1.6; }
                .cp-meta { display: flex; gap: 12px; flex-wrap: wrap; color: rgba(255,255,255,.44); font-size: 12px; }
                .cp-meta b { color: rgba(255,255,255,.75); font-weight: 700; font-variant-numeric: tabular-nums; }
                .cp-go {
                    display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;
                    padding: 10px 16px; border-radius: 11px; font: inherit;
                    border: 1px solid rgba(22,196,127,.4); background: rgba(22,196,127,.1);
                    color: #5ee3ac; font-size: 12.5px; font-weight: 800; white-space: nowrap;
                }
                .cp-go:hover { background: rgba(22,196,127,.18); }
                .cp-go b { font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums; }
                .cp-go span { font-size: 11px; }
                .cp-post.visited .cp-go {
                    border-color: rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: rgba(255,255,255,.45);
                }
                @media (prefers-reduced-motion: reduce) { .cp-post { animation: none; opacity: 1; transform: none; } }

                .community-field::placeholder { color: rgba(226,232,240,0.64); opacity: 1; }
                .community-field:focus {
                    border-color: rgba(68,215,182,0.76) !important;
                    box-shadow: 0 0 0 3px rgba(68,215,182,0.14) !important;
                }
                .cp-scrim {
                    position: absolute; inset: 0; pointer-events: none; z-index: 0;
                    background:
                        linear-gradient(180deg, rgba(6,10,18,.88) 0%, rgba(6,10,18,.72) 42%, rgba(6,10,18,.86) 100%);
                }
                .cp-shell { position: relative; z-index: 1; }
                /* 막 위에서도 얇은 글씨가 흐려지지 않게 — 사진 대비가 큰 화면 대비. */
                .cp-shell h1, .cp-shell h2, .cp-shell h3 { text-shadow: 0 1px 12px rgba(0,0,0,.55); }
                .cp-shell p, .cp-shell span, .cp-shell b { text-shadow: 0 1px 8px rgba(0,0,0,.45); }
                .community-write-button:hover,
                .community-card:hover { transform: translateY(-2px); }
                @media (max-width: 960px) {
                    .community-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                }
                @media (max-width: 720px) {
                    .community-grid { grid-template-columns: 1fr !important; }
                    .community-modal-grid { grid-template-columns: 1fr !important; }
                }
            `}</style>
            {/*
              * 배경이 밝은 사진이라 흰 글씨가 그대로는 안 읽힌다(사장님 지적 2026-08-23).
              * 사진을 없애지 않고 **어두운 막**을 깔아 글자만 살린다 —
              * 위아래로 옅어지게 해서 사진이 완전히 죽지 않는다.
              */}
            <div className="cp-scrim" aria-hidden="true" />
            <section className="cp-shell" style={{ padding: '140px 20px 100px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 34, flexWrap: 'wrap' }}>
                    <div>
                        <span style={{ display: 'inline-flex', minHeight: 30, alignItems: 'center', padding: '6px 14px', background: 'rgba(68,215,182,0.10)', border: '1px solid rgba(68,215,182,0.28)', borderRadius: 8, color: '#44d7b6', fontSize: 12, fontWeight: 900, letterSpacing: 0, marginBottom: 16 }}>COMMUNITY</span>
                        <h1 style={{ fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 900, marginBottom: 12 }}>Leaders Pro 커뮤니티</h1>
                        {/*
                            * 설명을 판에 맞춘다(2026-08-23). 수익 인증과 활용 팁은
                            * [수익인증 및 후기] 로 옮겼는데 설명만 남아 있었다 —
                            * 없는 것을 있다고 적어 두면 안 된다.
                            */}
                        <p style={{ color: 'rgba(255,255,255,0.66)', fontSize: 16, lineHeight: 1.7, margin: 0, wordBreak: 'keep-all' }}>내가 쓴 글을 올리고, 남의 글에 들러 주는 판입니다. 들른 만큼 내 글이 위로 올라갑니다.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => refreshCommunity(true)}
                            style={{ minHeight: 42, padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#e5edf7', fontWeight: 800, cursor: 'pointer' }}
                        >
                            새로고침
                        </button>
                    </div>
                </div>

                {/*
                  * 탭을 없앴다(사장님 지시 2026-08-23: "커뮤니티는 활용팁도
                  * 없애고 내 글 홍보만 있으면 됩니다").
                  * 수익 인증은 [후기] 로 옮겼다 — 사는 사람이 보는 자리는 거기다.
                  * 판이 하나뿐이면 고를 것이 없으므로 고르개도 두지 않는다.
                  */}

                {loading && (
                    <div style={{ ...panelStyle, padding: 24, marginBottom: 24, color: 'rgba(255,255,255,0.70)' }}>
                        캐시를 확인하면서 최신 커뮤니티 데이터를 불러오는 중입니다.
                    </div>
                )}

                {/*
                  * '내 글 홍보' — 서로 들러 주는 판(사장님 설계 2026-08-21).
                  * 자기 판을 직접 그린다: 올리기·들르기·집계가 한 덩어리라
                  * 바깥에서 상태를 나눠 갖지 않는 편이 고치기 쉽다.
                  */}
                <PostsPanel />
            </section>

            {writer && (
                <CommunityWriteModal
                    kind={writer}
                    onClose={() => setWriter(null)}
                    onSubmitted={() => {
                        setWriter(null);
                        refreshCommunity(true);
                    }}
                />
            )}
        </div>
    );
}

function WriteButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="community-write-button"
            onClick={onClick}
            style={{
                minHeight: 42,
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid rgba(68,215,182,0.46)',
                background: '#16c47f',
                color: '#061018',
                fontWeight: 900,
                cursor: 'pointer',
                transition: 'transform .18s ease',
            }}
        >
            {label}
        </button>
    );
}

function MediaView({ item, height = 230 }: { item: CommunityMedia; height?: number }) {
    if (!item.media) return null;
    return item.mediaType === 'video' ? (
        <video src={item.media} controls playsInline preload="metadata" style={{ width: '100%', height, objectFit: 'contain', display: 'block', background: '#050812' }} />
    ) : (
        <img src={item.media} alt={item.mediaName || '커뮤니티 첨부 이미지'} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ width: '100%', height, objectFit: 'contain', display: 'block', background: '#050812' }} />
    );
}

function EmptyState({ title, desc, action, onWrite }: { title: string; desc: string; action: string; onWrite: () => void }) {
    return (
        <div style={{ ...panelStyle, padding: '44px 26px', textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 24 }}>{title}</h2>
            <p style={{ margin: '0 auto 22px', maxWidth: 560, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>{desc}</p>
            <WriteButton label={action} onClick={onWrite} />
        </div>
    );
}

function IncomePanel({ items, onWrite }: { items: CommunityIncomeProof[]; onWrite: () => void }) {
    if (items.length === 0) {
        return <EmptyState title="아직 공개된 수익인증이 없습니다" desc="초기 예시 자료는 표시하지 않습니다. 실제 이미지·영상과 글이 승인되면 이곳에 노출됩니다." action="수익인증 작성" onWrite={onWrite} />;
    }

    return (
        <div className="community-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
            {items.map((item, index) => (
                <article key={`${item.amount}-${index}`} className="community-card" style={{ ...panelStyle, overflow: 'hidden', transition: 'transform .18s ease' }}>
                    {item.media ? (
                        <MediaView item={item} />
                    ) : (
                        <div style={{ height: 180, background: 'linear-gradient(135deg, rgba(68,215,182,0.22), rgba(244,201,93,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 34, fontWeight: 900, color: '#f4c95d' }}>{item.amount}</span>
                        </div>
                    )}
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                            <div>
                                <b style={{ display: 'block', color: '#f4c95d', fontSize: 16, marginBottom: 6 }}>{item.source === 'site-proof' ? '실제 운영 성과' : '수익인증'}</b>
                                <h3 style={{ margin: 0, fontSize: 23, lineHeight: 1.2 }}>{item.amount}</h3>
                            </div>
                            {item.date && <span style={{ color: 'rgba(255,255,255,0.68)', fontSize: 16, whiteSpace: 'nowrap' }}>{item.date}</span>}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 1.72, margin: '0 0 14px', whiteSpace: 'pre-wrap' }}>{item.desc}</p>
                        <div style={{ marginBottom: 12 }}>
                            <span style={{ color: '#fff', fontSize: 16, fontWeight: 900 }}>{item.author}</span>
                        </div>
                        {item.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {item.tags.map((tag) => (
                                    <span key={tag} style={{ background: 'rgba(244,201,93,0.10)', color: '#f4c95d', fontSize: 15, padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(244,201,93,0.24)' }}>{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </article>
            ))}
        </div>
    );
}

function TipsPanel({ items, onWrite }: { items: Tip[]; onWrite: () => void }) {
    if (items.length === 0) {
        return <EmptyState title="아직 공개된 활용 팁이 없습니다" desc="실제 사용자가 이미지/영상과 함께 남긴 활용 팁만 공개됩니다." action="활용팁 작성" onWrite={onWrite} />;
    }

    return (
        <div className="community-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
            {items.map((tip, index) => (
                <article key={`${tip.title}-${index}`} className="community-card" style={{ ...panelStyle, overflow: 'hidden', transition: 'transform .18s ease' }}>
                    {tip.media && <MediaView item={tip} height={190} />}
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                            <span style={{ color: '#44d7b6', fontSize: 12, fontWeight: 900 }}>활용 팁</span>
                            {tip.timestamp && <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 11 }}>{new Date(tip.timestamp).toLocaleDateString('ko-KR')}</span>}
                        </div>
                        <h3 style={{ fontSize: 18, lineHeight: 1.42, margin: '0 0 10px' }}>{tip.title}</h3>
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.74)', lineHeight: 1.72, whiteSpace: 'pre-wrap', margin: '0 0 14px' }}>{tip.detail}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'rgba(255,255,255,0.48)', fontSize: 12 }}>
                            <span>{tip.author}</span>
                            <span>{tip.phone || tip.email}</span>
                        </div>
                    </div>
                </article>
            ))}
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'rgba(255,255,255,0.46)', fontSize: 13, marginTop: 20 }}>
                더 많은 정보는 <Link to="/reviews" style={{ color: '#44d7b6' }}>후기</Link> 또는 <a href="https://open.kakao.com/o/sPcaslwh" target="_blank" rel="noopener noreferrer" style={{ color: '#44d7b6' }}>카카오톡 채널</a>에서 확인하세요.
            </p>
        </div>
    );
}

function CommunityWriteModal({ kind, onClose, onSubmitted }: { kind: WriteKind; onClose: () => void; onSubmitted: () => void }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const isIncome = kind === 'income';
    const [form, setForm] = useState({
        author: '',
        email: '',
        phone: '',
        amount: '',
        date: '',
        title: '',
        detail: '',
        tags: '',
    });
    const [media, setMedia] = useState('');
    const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
    const [mediaName, setMediaName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

    const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            setMsg({ type: 'error', text: '이미지 또는 동영상 파일만 선택할 수 있습니다.' });
            return;
        }
        if (file.size > MAX_MEDIA_BYTES) {
            setMsg({ type: 'error', text: '파일은 18MB 이하로 선택해주세요.' });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setMedia(String(reader.result || ''));
            setMediaName(file.name);
            setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
            setMsg(null);
        };
        reader.onerror = () => setMsg({ type: 'error', text: '파일을 읽지 못했습니다. 다른 파일을 선택해주세요.' });
        reader.readAsDataURL(file);
    };

    const submit = async () => {
        if (!form.author.trim()) { setMsg({ type: 'error', text: '닉네임을 입력해주세요.' }); return; }
        if (!form.email.trim() || !isValidEmail(form.email)) { setMsg({ type: 'error', text: '정확한 이메일을 입력해주세요.' }); return; }
        if (!form.phone.trim() || !isValidPhone(form.phone)) { setMsg({ type: 'error', text: '정확한 휴대폰 번호를 입력해주세요.' }); return; }
        if (!media) { setMsg({ type: 'error', text: '이미지 또는 동영상을 선택해주세요.' }); return; }
        if (isIncome && !form.amount.trim()) { setMsg({ type: 'error', text: '수익 금액을 입력해주세요.' }); return; }
        if (!isIncome && !form.title.trim()) { setMsg({ type: 'error', text: '제목을 입력해주세요.' }); return; }
        if (!form.detail.trim()) { setMsg({ type: 'error', text: isIncome ? '수익인증 글을 작성해주세요.' : '활용 팁 글을 작성해주세요.' }); return; }

        setSubmitting(true);
        setMsg(null);
        try {
            const maskedDetail = maskContactText(form.detail.trim());
            const payload = isIncome
                ? {
                    action: 'income-submit',
                    author: form.author.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    publicEmail: maskEmail(form.email),
                    publicPhone: maskPhone(form.phone),
                    amount: form.amount.trim(),
                    date: form.date.trim(),
                    desc: maskedDetail,
                    tags: form.tags.trim(),
                    proofMedia: media,
                    image: media,
                    media,
                    mediaType,
                    mediaName,
                    timestamp: new Date().toISOString(),
                }
                : {
                    action: 'submit-tip',
                    author: form.author.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim(),
                    publicEmail: maskEmail(form.email),
                    publicPhone: maskPhone(form.phone),
                    title: form.title.trim(),
                    detail: maskedDetail,
                    proofMedia: media,
                    image: media,
                    media,
                    mediaType,
                    mediaName,
                    timestamp: new Date().toISOString(),
                };
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ type: 'success', text: '접수되었습니다. 검토 후 공개됩니다.' });
                window.setTimeout(onSubmitted, 500);
            } else {
                setMsg({ type: 'error', text: data.message || '등록 실패. 다시 시도해주세요.' });
            }
        } catch (error: any) {
            setMsg({ type: 'error', text: `오류: ${error?.message || '서버 연결 실패'}` });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={isIncome ? '수익인증 작성' : '활용 팁 작성'}
            onClick={() => { if (!submitting) onClose(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: 'rgba(2,6,12,0.78)', backdropFilter: 'blur(10px)' }}
        >
            <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(680px, 100%)', maxHeight: 'calc(100vh - 36px)', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(68,215,182,0.28)', background: '#101721', boxShadow: '0 30px 90px rgba(0,0,0,0.48)', color: '#fff' }}>
                <div style={{ padding: '26px 28px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>{isIncome ? '수익인증 작성' : '활용 팁 작성'}</h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6 }}>이메일과 휴대폰 번호는 검토용이며 공개 영역에서는 마스킹됩니다.</p>
                    </div>
                    <button type="button" onClick={onClose} style={{ width: 38, height: 38, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: '#0b111a', color: '#fff', fontSize: 20, cursor: 'pointer' }}>x</button>
                </div>

                <div style={{ padding: 28 }}>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} style={{ display: 'none' }} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', minHeight: 48, borderRadius: 8, border: '1px solid rgba(68,215,182,0.42)', background: 'rgba(68,215,182,0.10)', color: '#8ff5d4', fontWeight: 900, cursor: 'pointer', marginBottom: 12 }}>
                        {media ? '파일 다시 선택하기' : '이미지 또는 동영상 선택하기'}
                    </button>
                    {media && (
                        <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, background: '#080d14', overflow: 'hidden' }}>
                            {mediaType === 'video' ? (
                                <video src={media} controls playsInline style={{ width: '100%', maxHeight: 320, display: 'block' }} />
                            ) : (
                                <img src={media} alt="선택한 첨부 미리보기" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }} />
                            )}
                            <div style={{ padding: '9px 12px', color: 'rgba(255,255,255,0.58)', fontSize: 12 }}>{mediaName}</div>
                        </div>
                    )}

                    <div className="community-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <input className="community-field" value={form.author} maxLength={20} onChange={(event) => update('author', event.target.value)} placeholder="닉네임 필수" style={fieldStyle} />
                        <input className="community-field" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="이메일 필수" style={fieldStyle} />
                    </div>
                    <input className="community-field" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="휴대폰 번호 필수" style={{ ...fieldStyle, marginBottom: 12 }} />

                    {isIncome ? (
                        <>
                            <div className="community-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <input className="community-field" value={form.amount} maxLength={50} onChange={(event) => update('amount', event.target.value)} placeholder="수익 금액 예: 월 127만원" style={fieldStyle} />
                                <input className="community-field" value={form.date} maxLength={20} onChange={(event) => update('date', event.target.value)} placeholder="시점 예: 2026.07" style={fieldStyle} />
                            </div>
                            <textarea className="community-field" value={form.detail} maxLength={800} rows={5} onChange={(event) => update('detail', event.target.value)} placeholder="어떤 제품으로 어떻게 성과가 났는지 작성해주세요. 본문 속 연락처는 자동으로 가려집니다." style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.65, marginBottom: 12 }} />
                            <input className="community-field" value={form.tags} maxLength={200} onChange={(event) => update('tags', event.target.value)} placeholder="태그 선택, 콤마 구분" style={{ ...fieldStyle, marginBottom: 14 }} />
                        </>
                    ) : (
                        <>
                            <input className="community-field" value={form.title} maxLength={100} onChange={(event) => update('title', event.target.value)} placeholder="제목 필수" style={{ ...fieldStyle, marginBottom: 12 }} />
                            <textarea className="community-field" value={form.detail} maxLength={1500} rows={6} onChange={(event) => update('detail', event.target.value)} placeholder="활용 팁을 이미지/영상과 함께 자세히 작성해주세요. 본문 속 연락처는 자동으로 가려집니다." style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.65, marginBottom: 14 }} />
                        </>
                    )}

                    <button onClick={submit} disabled={submitting} style={{ width: '100%', minHeight: 50, borderRadius: 8, border: 'none', background: submitting ? '#233044' : '#16c47f', color: submitting ? 'rgba(255,255,255,0.5)' : '#061018', fontSize: 15, fontWeight: 900, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                        {submitting ? '등록 중...' : isIncome ? '수익인증 등록하기' : '활용팁 등록하기'}
                    </button>
                    {msg && (
                        <div style={{ marginTop: 14, padding: 13, borderRadius: 8, textAlign: 'center', fontSize: 13, background: msg.type === 'success' ? 'rgba(68,215,182,0.10)' : 'rgba(255,92,117,0.10)', border: `1px solid ${msg.type === 'success' ? 'rgba(68,215,182,0.34)' : 'rgba(255,92,117,0.28)'}`, color: msg.type === 'success' ? '#8ff5d4' : '#ff9aaa' }}>{msg.text}</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CommunityPage;
