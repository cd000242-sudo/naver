import { useEffect, useRef, useState } from 'react';
import SplitWords from '../components/motion/SplitWords';
import ZoomableImage from '../components/ZoomableImage';
import downloadCatalog from '../data/download-catalog.json';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';
import { light, lightRadius, motion, type as typeScale } from '../styles/tokens';
import { DOWNLOAD_PASSWORD } from '../lib/purchaseGuide.mjs';

/**
 * 다운로드 — payment-page/download.html 마이그.
 * - GitHub Releases latest API 동적 fetch (Leword)
 * - 비밀번호 인증 (1645)
 * - GAS lead-submit (이메일 캡쳐)
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
// 구매 완료 화면 · 주문 조회 · 메일과 같은 값(purchaseGuide.DOWNLOAD_PASSWORD, 2026-10-07).
const DOWNLOAD_PW = DOWNLOAD_PASSWORD;

type DownloadChoice = {
    key: 'windows' | 'android' | 'mac-arm' | 'mac-intel';
    label: string;
    detail: string;
    url: string;
};

type ProductConfig = {
    name: string;
    version: string;
    image: string;
    accent: string;
    borderColor: string;
    downloads: DownloadChoice[];
};

/**
 * 기본 카탈로그는 JSON 한 곳에만 둔다.
 * scripts/status/probe-purchase.mjs 가 같은 파일을 읽어 링크 생존을 검사한다.
 * 여기에 값을 다시 적으면 화면과 검사가 조용히 갈라진다.
 */
const PRODUCTS = downloadCatalog as unknown as Record<'naver' | 'leword' | 'orbit', ProductConfig>;

/*
 * 관리자 [다운로드] 안내 문구에 끝난 사실("LEWORD는 올인원 라이선스 보유자용" 등)이 저장돼 있으면 쓰지 않는다
 * (2026-10-07 — 각 제품은 단품으로 산다). 새 문구를 저장하면 그대로 나온다.
 */
const RETIRED_COPY = /올인원 라이선스|보유자용|영구제만|3개월|올인원 구매 후/;
const DEFAULT_NOTE = 'Better Life Naver · Leadernam Orbit은 30일 동안 하루 3편까지 무료로 체험할 수 있습니다. LEWORD는 웹에서 바로 쓰고, PC 앱은 여기서 받습니다.';

type ProductKey = keyof typeof PRODUCTS;

function applyDownloadOverrides(productKey: ProductKey, siteContent: SiteContent | null): ProductConfig {
    const product = PRODUCTS[productKey];
    const patch = siteContent?.downloads?.[productKey];
    if (!patch) return product;
    const downloadPatches = patch?.downloads || {};
    return {
        ...product,
        name: patch?.name || product.name,
        version: patch?.version || product.version,
        image: patch?.image || product.image,
        accent: patch?.accent || product.accent,
        borderColor: patch?.accent ? `${patch.accent}45` : product.borderColor,
        downloads: product.downloads.map((item) => {
            const configured = downloadPatches[item.key] || {};
            return {
                ...item,
                ...configured,
                url: configured.url?.trim() || item.url,
            };
        }),
    };
}

function getPreferredDownload(downloads: DownloadChoice[]): DownloadChoice {
    if (typeof navigator !== 'undefined' && /mac/i.test(`${navigator.platform} ${navigator.userAgent}`)) {
        return downloads.find((item) => item.key === 'mac-arm') || downloads[0];
    }
    return downloads.find((item) => item.key === 'windows') || downloads[0];
}

function DownloadPage() {
    const [siteContent, setSiteContent] = useState<SiteContent | null>(null);

    useEffect(() => {
        const prev = document.title;
        document.title = '다운로드 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    useEffect(() => {
        fetchSiteContent().then(setSiteContent);
    }, []);

    // ?product=leword — 구매 완료 화면 · 메일의 [설치 파일 받기]가 산 제품을 짚어 준다(2026-10-07).
    const [picked] = useState(() => { try { const searchParams = new URLSearchParams(window.location.search); return searchParams.get('product') || ''; } catch { return ''; } });
    const page = siteContent?.downloads?.page || {};
    // Light theme (2026-11): the admin photo background (theme.downloadBgImage) is no longer drawn.
    // An admin eyebrow is shown as a plain line; the old default 'DOWNLOAD' label is dropped.
    const eyebrow = String(page.eyebrow || '').trim();
    const showEyebrow = eyebrow !== '' && eyebrow.toUpperCase() !== 'DOWNLOAD';

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <style>{`
                .dl-shell { padding: 120px 24px 96px; }
                .dl-title { font-size: ${typeScale.h1}px; }
                .dl-lead-field::placeholder, .dl-pw-field::placeholder { color: ${light.textMuted}; }
                @media (max-width: 640px) {
                    .dl-shell { padding: 96px 16px 64px; }
                    .dl-title { font-size: ${typeScale.h1Mobile}px; }
                }
            `}</style>
            <section className="dl-shell" style={{ maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ marginBottom: 32 }}>
                    {showEyebrow && <p style={{ margin: '0 0 8px', color: light.textMuted, fontSize: typeScale.meta }}>{eyebrow}</p>}
                    <h1 className="dl-title" style={{ lineHeight: 1.2, fontWeight: 700, letterSpacing: 0, margin: '0 0 12px', color: light.text }}><SplitWords text={page.title || '프로그램 다운로드'} /></h1>
                    <p style={{ color: light.textSecondary, fontSize: typeScale.body, lineHeight: 1.7, margin: 0 }}>{page.desc || '비밀번호를 입력하면 최신 버전을 다운로드할 수 있습니다.'}</p>
                    <p style={{ color: light.textSecondary, fontSize: typeScale.small, lineHeight: 1.7, margin: '8px 0 0', maxWidth: 760, wordBreak: 'keep-all' }}>{page.note && !RETIRED_COPY.test(page.note) ? page.note : DEFAULT_NOTE}</p>
                </div>

                <LeadCapture />

                <div className="download-product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, margin: '32px 0 0' }}>
                    <DownloadCard productKey="naver" siteContent={siteContent} picked={picked === 'naver'} />
                    <DownloadCard productKey="leword" siteContent={siteContent} picked={picked === 'leword'} />
                    <DownloadCard productKey="orbit" siteContent={siteContent} picked={picked === 'orbit'} />
                </div>
            </section>
        </div>
    );
}

// ─── Lead email capture ───
function LeadCapture() {
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState<{ text: string; color: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [btnLabel, setBtnLabel] = useState('받아보기');

    const submit = async () => {
        const e = email.trim();
        if (!e || !e.includes('@')) { setMsg({ text: '올바른 이메일을 입력해주세요.', color: light.negative }); return; }
        setSubmitting(true); setBtnLabel('등록 중...');
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'lead-submit', email: e, source: 'download', timestamp: new Date().toISOString() }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ text: data.updated ? '이메일 정보가 갱신되었습니다.' : '등록되었습니다. 곧 소식 전해드릴게요.', color: light.positive });
                setEmail('');
                setBtnLabel('완료');
                window.setTimeout(() => { setSubmitting(false); setBtnLabel('받아보기'); }, 2500);
            } else {
                setMsg({ text: data.message || '등록 실패', color: light.negative });
                setSubmitting(false); setBtnLabel('받아보기');
            }
        } catch (err: any) {
            setMsg({ text: '오류: ' + (err?.message || ''), color: light.negative });
            setSubmitting(false); setBtnLabel('받아보기');
        }
    };

    return (
        <div style={{ padding: '20px 24px', background: light.surface, border: `1px solid ${light.line}`, borderRadius: lightRadius.card }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1.4, minWidth: 240 }}>
                    <strong style={{ display: 'block', color: light.text, fontSize: typeScale.body, fontWeight: 600, marginBottom: 4 }}>신제품·업데이트·꿀팁 받아보기 (선택)</strong>
                    <span style={{ display: 'block', fontSize: typeScale.small, lineHeight: 1.6, color: light.textSecondary }}>이메일을 남기시면 새 기능 출시·할인 등을 알려드립니다.</span>
                </div>
                <input
                    className="dl-lead-field"
                    type="email"
                    aria-label="이메일 주소"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{ flex: 1, minWidth: 200, minHeight: 48, padding: '12px 16px', border: `1px solid ${light.lineStrong}`, borderRadius: lightRadius.control, background: light.surface, fontSize: typeScale.body, color: light.text }}
                />
                <button
                    onClick={submit}
                    disabled={submitting}
                    style={{ minHeight: 48, padding: '12px 24px', background: light.btn, color: light.onBtn, border: 'none', borderRadius: lightRadius.control, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: typeScale.body }}
                >{btnLabel}</button>
            </div>
            {msg && <div style={{ marginTop: 12, fontSize: typeScale.small, color: msg.color }}>{msg.text}</div>}
        </div>
    );
}

// ─── Download card ───
function DownloadCard({ productKey, siteContent, picked = false }: { productKey: ProductKey; siteContent: SiteContent | null; picked?: boolean }) {
    const product = applyDownloadOverrides(productKey, siteContent);
    const cardRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => { if (picked) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [picked]);
    const [pw, setPw] = useState('');
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [loading, setLoading] = useState(false);
    const [urlMissing, setUrlMissing] = useState(false);
    // [2026-11-07] Password stays required, but it is shown on request so users need not ask the owner.
    const [showPw, setShowPw] = useState(false);
    const [downloadKey, setDownloadKey] = useState(() => getPreferredDownload(product.downloads).key);
    const selectedDownload = product.downloads.find((item) => item.key === downloadKey) || product.downloads[0];

    /**
     * 비밀번호가 맞을 때만 링크를 넘긴다.
     *
     * window.open 으로 열던 것을 실제 <a href> 로 바꿨다. 이유가 둘이다:
     *  1. window.open 은 브라우저 팝업 차단에 막히면 아무 일도 안 일어난다.
     *     사용자 눈에는 "버튼을 눌렀는데 반응이 없다" 로 보인다. 실제로
     *     새벽 구매자가 다운로드를 못 받는 일이 있었다.
     *  2. 링크면 우클릭 복사·새 탭 열기가 되고, 실패해도 주소가 눈에 보인다.
     */
    const unlocked = pw.trim() === DOWNLOAD_PW;
    const href = String(selectedDownload?.url || '').trim();

    const onDownloadClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!unlocked) {
            event.preventDefault();
            setError(true);
            setShake(true);
            window.setTimeout(() => { setError(false); setShake(false); }, 2000);
            return;
        }
        if (!href) {
            // 주소가 비어 있으면 빈 탭만 열려 "아무 일도 안 일어난 것" 처럼 보인다.
            // 관리자 설정(GAS)이 비었을 때 실제로 이렇게 됐다. 조용히 실패시키지 않는다.
            event.preventDefault();
            setUrlMissing(true);
            return;
        }
        setError(false);
        setUrlMissing(false);
        setLoading(true);
        // 비밀번호를 여기서 지우면 안 된다. unlocked 가 false 로 바뀌면서
        // 같은 렌더에서 href 가 사라져 브라우저가 이동을 취소한다.
        // (버튼을 눌러도 아무 일이 없던 원인 중 하나였다.)
        window.setTimeout(() => setLoading(false), 700);
    };

    return (
        <div
            ref={cardRef}
            style={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: light.surface,
                // Selection is the only place a card gets a gold line.
                border: `1px solid ${picked ? light.accent : light.line}`,
                boxShadow: picked ? `0 0 0 1px ${light.accent}` : light.shadowSm,
                borderRadius: lightRadius.card,
            }}
        >
            {picked && (
                <div style={{ padding: '12px 24px', background: light.accentSoft, borderBottom: `1px solid ${light.accentLine}`, color: light.accentInk, fontSize: typeScale.small, fontWeight: 600, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    구매하신 제품입니다. 아래 칸에 비밀번호({DOWNLOAD_PASSWORD})를 넣고 받으세요
                </div>
            )}
            <div style={{
                width: '100%',
                aspectRatio: '1 / 1',  // Leword(정사각, 더 큰 쪽) 기준 통일
                overflow: 'hidden',
                borderBottom: `1px solid ${light.line}`,
                background: light.raised,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <ZoomableImage
                    className="download-card-zoom"
                    src={product.image}
                    alt={product.name}
                    title={product.name}
                    loading="lazy"
                    imgStyle={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'contain',  // 자르지 않고 전체 보이게, 큰 쪽 기준 작은 이미지 키움
                        objectPosition: 'center',
                    }}
                />
            </div>
            <div style={{ padding: 24 }}>
                <h2 style={{ fontSize: typeScale.h3, lineHeight: 1.3, fontWeight: 600, letterSpacing: 0, margin: '0 0 4px', color: light.text }}>
                    {product.name}
                </h2>
                <p style={{ color: light.textSecondary, fontSize: typeScale.small, lineHeight: 1.6, margin: '0 0 16px', fontVariantNumeric: 'tabular-nums' }}>{product.version}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8, marginBottom: 16 }}>
                    {product.downloads.map((item) => {
                        const active = item.key === selectedDownload.key;
                        return (
                            <button
                                key={item.key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setDownloadKey(item.key)}
                                style={{
                                    minHeight: 56,
                                    padding: '8px 12px',
                                    borderRadius: lightRadius.control,
                                    border: `1px solid ${active ? light.accent : light.line}`,
                                    background: active ? light.accentSoft : light.surface,
                                    color: active ? light.text : light.textSecondary,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: `background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease}`,
                                }}
                            >
                                <span style={{ display: 'block', fontSize: typeScale.small, fontWeight: 600, lineHeight: 1.4 }}>{item.label}</span>
                                <span style={{ display: 'block', marginTop: 4, fontSize: typeScale.meta, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>{item.detail}</span>
                            </button>
                        );
                    })}
                </div>
                <div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="dl-pw-field"
                            type="password"
                            aria-label="다운로드 비밀번호"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            onKeyDown={(e) => {
                                // 엔터로도 받을 수 있게 한다. 링크를 직접 눌러 브라우저가
                                // 다운로드를 시작하게 해야 팝업 차단에 안 걸린다.
                                if (e.key !== 'Enter') return;
                                const anchor = e.currentTarget.parentElement?.querySelector('a');
                                if (anchor) (anchor as HTMLAnchorElement).click();
                            }}
                            placeholder="비밀번호 입력"
                            style={{
                                flex: 1, minWidth: 0, minHeight: 48, padding: '12px 16px',
                                background: light.surface,
                                border: `1px solid ${error ? light.negative : light.lineStrong}`,
                                borderRadius: lightRadius.control, color: light.text, fontSize: typeScale.body,
                                animation: shake ? 'shakeDl 0.4s' : 'none',
                            }}
                        />
                        {/* The primary action of this page: the one gold fill. */}
                        <a
                            href={unlocked && href ? href : undefined}
                            onClick={onDownloadClick}
                            target="_blank"
                            rel="noreferrer"
                            style={{ minHeight: 48, padding: '12px 20px', gap: 8, background: light.accent, color: light.onAccent, border: 'none', borderRadius: lightRadius.control, fontSize: typeScale.body, fontWeight: 600, whiteSpace: 'nowrap', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                            title={selectedDownload.label + ' 다운로드'}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            {loading ? '여는 중' : '받기'}
                        </a>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-expanded={showPw}
                        style={{ marginTop: 8, minHeight: 48, padding: '12px 16px', width: '100%', background: light.surface, border: `1px solid ${light.lineStrong}`, borderRadius: lightRadius.control, color: light.text, fontSize: typeScale.body, fontWeight: 500, cursor: 'pointer' }}
                    >
                        {showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                    </button>
                    {showPw && (
                        <p style={{ margin: '12px 0 0', fontSize: typeScale.body, lineHeight: 1.6, color: light.text }}>
                            다운로드 비밀번호: <strong style={{ color: light.text, background: light.accentSoft, padding: '2px 8px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>{DOWNLOAD_PW}</strong>
                            <span style={{ display: 'block', marginTop: 4, fontSize: typeScale.small, color: light.textSecondary }}>위 칸에 넣고 받으세요</span>
                        </p>
                    )}
                    {error && <p role="alert" style={{ margin: '8px 0 0', color: light.negative, fontSize: typeScale.small, fontWeight: 500 }}>비밀번호가 올바르지 않습니다.</p>}
                    {urlMissing && <p role="alert" style={{ margin: '8px 0 0', color: light.negative, fontSize: typeScale.small, fontWeight: 500, lineHeight: 1.6 }}>이 버전의 다운로드 주소가 설정되지 않았습니다. 다른 항목을 선택하거나 1:1 문의로 알려주세요.</p>}
                </div>
            </div>
            <style>{`@keyframes shakeDl{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
        </div>
    );
}

export default DownloadPage;
