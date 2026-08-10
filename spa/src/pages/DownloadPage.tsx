import { useEffect, useState } from 'react';
import ZoomableImage from '../components/ZoomableImage';
import downloadCatalog from '../data/download-catalog.json';
import { fetchSiteContent, type SiteContent } from '../lib/siteOps';
import { gradient, onGold, radius } from '../styles/tokens';

/**
 * 다운로드 — payment-page/download.html 마이그.
 * - GitHub Releases latest API 동적 fetch (Leword)
 * - 비밀번호 인증 (1645)
 * - GAS lead-submit (이메일 캡쳐)
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const DOWNLOAD_PW = '1645';

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

    const page = siteContent?.downloads?.page || {};
    const downloadBgImage = siteContent?.theme?.downloadBgImage;

    return (
        <div style={{
            position: 'relative',
            zIndex: 1,
            ...(downloadBgImage ? {
                backgroundImage: `linear-gradient(rgba(5,8,12,0.36), rgba(5,8,12,0.62)), url(${downloadBgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
                backgroundAttachment: 'fixed',
            } : {}),
        }}>
            <style>{`
                @media (min-width: 1180px) and (max-width: 1520px) {
                    .download-product-grid {
                        max-width: 1040px;
                        margin-left: 0 !important;
                        margin-right: auto !important;
                    }
                }
                .download-card-zoom img {
                    transition: transform .24s ease, filter .24s ease;
                }
                .download-card-zoom:hover img,
                .download-card-zoom:focus-visible img {
                    transform: scale(1.025);
                    filter: brightness(1.08);
                }
            `}</style>
            <section style={{ padding: '140px 20px 100px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 50, color: '#FFD700', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>{page.eyebrow || 'DOWNLOAD'}</span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>{page.title || '프로그램 다운로드'}</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>{page.desc || '비밀번호를 입력하면 최신 버전을 다운로드할 수 있습니다.'}</p>
                    <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 13, marginTop: 8 }}>{page.note || '무료 체험은 Better Life Naver만 제공됩니다. LEWORD는 올인원 라이선스 보유자용입니다.'}</p>
                </div>

                <LeadCapture />

                <div className="download-product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, margin: '32px auto 0' }}>
                    <DownloadCard productKey="naver" siteContent={siteContent} />
                    <DownloadCard productKey="leword" siteContent={siteContent} />
                    <DownloadCard productKey="orbit" siteContent={siteContent} />
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
        if (!e || !e.includes('@')) { setMsg({ text: '올바른 이메일을 입력해주세요.', color: '#ff3b5c' }); return; }
        setSubmitting(true); setBtnLabel('등록 중...');
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'lead-submit', email: e, source: 'download', timestamp: new Date().toISOString() }),
            });
            const data = await res.json();
            if (data.success) {
                setMsg({ text: data.updated ? '✅ 이메일 정보가 갱신되었습니다.' : '✅ 등록되었습니다. 곧 소식 전해드릴게요.', color: '#44d7b6' });
                setEmail('');
                setBtnLabel('✓ 완료');
                window.setTimeout(() => { setSubmitting(false); setBtnLabel('받아보기'); }, 2500);
            } else {
                setMsg({ text: data.message || '등록 실패', color: '#ff3b5c' });
                setSubmitting(false); setBtnLabel('받아보기');
            }
        } catch (err: any) {
            setMsg({ text: '오류: ' + (err?.message || ''), color: '#ff3b5c' });
            setSubmitting(false); setBtnLabel('받아보기');
        }
    };

    return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px', background: 'rgba(255,255,255,0.95)', borderRadius: 14, boxShadow: '0 6px 22px rgba(0,0,0,0.14)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <strong style={{ display: 'block', color: '#14304d', fontSize: 15, marginBottom: 4 }}>📧 신제품·업데이트·꿀팁 받아보기 (선택)</strong>
                    <span style={{ fontSize: 12, color: '#5b6b7a' }}>이메일을 남기시면 새 기능 출시·할인 등을 알려드립니다.</span>
                </div>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{ flex: 1.2, minWidth: 180, padding: '10px 14px', border: '1px solid rgba(20,48,77,0.15)', borderRadius: 8, fontSize: 14, color: '#14304d' }}
                />
                <button
                    onClick={submit}
                    disabled={submitting}
                    style={{ padding: '10px 20px', background: gradient.goldBright, color: onGold.black, border: 'none', borderRadius: radius.sm, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14 }}
                >{btnLabel}</button>
            </div>
            {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.color }}>{msg.text}</div>}
        </div>
    );
}

// ─── Download card ───
function DownloadCard({ productKey, siteContent }: { productKey: ProductKey; siteContent: SiteContent | null }) {
    const product = applyDownloadOverrides(productKey, siteContent);
    const [pw, setPw] = useState('');
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [loading, setLoading] = useState(false);
    const [urlMissing, setUrlMissing] = useState(false);
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
        <div style={{ background: 'rgba(18,18,26,0.6)', backdropFilter: 'blur(20px)', border: `1px solid ${product.borderColor}`, borderRadius: 20, padding: 24, transition: 'transform 0.3s' }}>
            <div style={{
                width: '100%',
                aspectRatio: '1 / 1',  // Leword(정사각, 더 큰 쪽) 기준 통일
                borderRadius: 16,
                overflow: 'hidden',
                marginBottom: 18,
                border: productKey === 'leword' ? `1px solid ${product.borderColor}` : 'none',
                background: '#0a0a0f',
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
            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
                {product.name}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 14 }}>{product.version}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 8, marginBottom: 14 }}>
                {product.downloads.map((item) => {
                    const active = item.key === selectedDownload.key;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setDownloadKey(item.key)}
                            style={{
                                minHeight: 58,
                                padding: '9px 10px',
                                borderRadius: 10,
                                border: active ? '1px solid ' + product.accent : '1px solid rgba(255,255,255,0.12)',
                                background: active ? product.accent : 'rgba(255,255,255,0.06)',
                                color: active ? '#050816' : 'rgba(255,255,255,0.78)',
                                cursor: 'pointer',
                                fontWeight: 800,
                                textAlign: 'left',
                                boxShadow: active ? '0 10px 24px rgba(0,0,0,0.22)' : 'none',
                            }}
                        >
                            <span style={{ display: 'block', fontSize: 13, lineHeight: 1.2 }}>{item.label}</span>
                            <span style={{ display: 'block', marginTop: 4, fontSize: 10, lineHeight: 1.2, opacity: 0.78 }}>{item.detail}</span>
                        </button>
                    );
                })}
            </div>
            <div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="password"
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
                            flex: 1, padding: '12px 14px',
                            background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${error ? '#ff3b5c' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                            animation: shake ? 'shakeDl 0.4s' : 'none',
                        }}
                    />
                    <a
                        href={unlocked && href ? href : undefined}
                        onClick={onDownloadClick}
                        target="_blank"
                        rel="noreferrer"
                        style={{ padding: '12px 18px', background: `linear-gradient(135deg, ${product.accent}, ${product.accent}cc)`, color: '#000', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                        title={selectedDownload.label + ' 다운로드'}
                    >
                        {loading ? (
                            <span style={{ fontSize: 16 }}>⏳</span>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        )}
                    </a>
                </div>
                {error && <p style={{ marginTop: 8, color: '#ff3b5c', fontSize: 12, fontWeight: 600 }}>비밀번호가 올바르지 않습니다.</p>}
                {urlMissing && <p style={{ marginTop: 8, color: '#ff3b5c', fontSize: 12, fontWeight: 600 }}>이 버전의 다운로드 주소가 설정되지 않았습니다. 다른 항목을 선택하거나 1:1 문의로 알려주세요.</p>}
            </div>
            <style>{`@keyframes shakeDl{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
        </div>
    );
}

export default DownloadPage;
