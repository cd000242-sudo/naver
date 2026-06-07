import { useEffect, useState } from 'react';

/**
 * 다운로드 — payment-page/download.html 마이그.
 * - GitHub Releases latest API 동적 fetch (Leword)
 * - 비밀번호 인증 (1645)
 * - GAS lead-submit (이메일 캡쳐)
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';
const DOWNLOAD_PW = '1645';

const PRODUCTS = {
    naver: {
        name: 'Better Life Naver',
        version: '네이버 블로그 자동화 · Windows 64-bit',
        image: '/images/feature-auto-publish.png',
        defaultUrl: 'https://github.com/cd000242-sudo/naver/releases/download/v2.10.334/Better-Life-Naver-Setup-2.10.334.exe',
        githubRepo: undefined as string | undefined,
        accent: '#FFD700',
        borderColor: 'rgba(255,215,0,0.25)',
    },
    leword: {
        name: 'Leword',
        version: 'AI 키워드 인텔리전스 · 올인원 구매자용 · 최신 자동 반영',
        image: '/images/leword/hero-banner.png',
        defaultUrl: 'https://github.com/cd000242-sudo/leword-app/releases/latest',
        githubRepo: 'cd000242-sudo/leword-app',
        accent: '#A78BFA',
        borderColor: 'rgba(124,58,237,0.25)',
    },
};

type ProductKey = keyof typeof PRODUCTS;
type ClientPlatform = 'mac' | 'windows';

function getClientPlatform(): ClientPlatform {
    if (typeof navigator !== 'undefined' && /mac/i.test(`${navigator.platform} ${navigator.userAgent}`)) {
        return 'mac';
    }
    return 'windows';
}

function scoreReleaseAsset(asset: any, platform: ClientPlatform): number {
    const name = String(asset?.name || '').toLowerCase();
    if (!asset?.browser_download_url || !name.includes('leword') || name.endsWith('.blockmap')) return 0;
    if (platform === 'mac') {
        if (/\.dmg$/i.test(name) && name.includes('universal')) return 110;
        if (/\.dmg$/i.test(name)) return 100;
        if (/\.zip$/i.test(name) && /(mac|darwin|universal|arm64|x64)/.test(name)) return name.includes('universal') ? 95 : 90;
        return 0;
    }
    if (/\.exe$/i.test(name) && /setup/.test(name)) return 100;
    if (/\.exe$/i.test(name) && /portable/.test(name)) return 90;
    if (/\.exe$/i.test(name)) return 80;
    if (/\.zip$/i.test(name) && /(setup|portable|win|windows)/.test(name)) return 70;
    return 0;
}

function selectReleaseAsset(assets: any[], platform: ClientPlatform): any | null {
    return (assets || []).reduce((best: { asset: any | null; score: number }, asset: any) => {
        const score = scoreReleaseAsset(asset, platform);
        return score > best.score ? { asset, score } : best;
    }, { asset: null, score: 0 }).asset;
}

async function fetchLatestDownload(repo: string): Promise<{ url: string; version: string; filename: string }> {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const asset = selectReleaseAsset(data.assets || [], getClientPlatform());
    if (!asset) throw new Error('No compatible LEWORD asset found');
    return { url: asset.browser_download_url, version: data.tag_name, filename: asset.name };
}

function DownloadPage() {
    useEffect(() => {
        const prev = document.title;
        document.title = '다운로드 — Leaders Pro';
        return () => { document.title = prev; };
    }, []);

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <section style={{ padding: '140px 20px 100px', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <span style={{ display: 'inline-block', padding: '6px 16px', background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.25)', borderRadius: 50, color: '#FFD700', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 16 }}>DOWNLOAD</span>
                    <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, marginBottom: 12 }}>프로그램 다운로드</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>비밀번호를 입력하면 최신 버전을 다운로드할 수 있습니다.</p>
                    <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 13, marginTop: 8 }}>무료 체험은 Better Life Naver만 제공됩니다. LEWORD는 올인원 라이선스 보유자용입니다.</p>
                </div>

                <LeadCapture />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginTop: 32 }}>
                    <DownloadCard productKey="naver" />
                    <DownloadCard productKey="leword" />
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
                    style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #c9a84c, #d4a012)', color: '#1a1a2e', border: 'none', borderRadius: 8, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14 }}
                >{btnLabel}</button>
            </div>
            {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.color }}>{msg.text}</div>}
        </div>
    );
}

// ─── Download card ───
function DownloadCard({ productKey }: { productKey: ProductKey }) {
    const product = PRODUCTS[productKey];
    const [pw, setPw] = useState('');
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [loading, setLoading] = useState(false);
    const [version, setVersion] = useState<string | null>(null);

    // GitHub repo가 있으면 최신 버전 라벨 로드
    useEffect(() => {
        if (!product.githubRepo) return;
        (async () => {
            try {
                const { version: v } = await fetchLatestDownload(product.githubRepo!);
                setVersion(v);
            } catch { /* ignore */ }
        })();
    }, [product.githubRepo]);

    const tryDownload = async () => {
        if (pw.trim() !== DOWNLOAD_PW) {
            setError(true);
            setShake(true);
            window.setTimeout(() => { setError(false); setShake(false); }, 2000);
            return;
        }
        setError(false);

        // GitHub repo 매핑 제품 → latest API
        if (product.githubRepo) {
            setLoading(true);
            try {
                const { url, version: v, filename } = await fetchLatestDownload(product.githubRepo);
                console.log(`[DOWNLOAD] ${product.name} ${v} → ${filename}`);
                window.location.href = url;
                setPw('');
            } catch (e) {
                console.error('[DOWNLOAD] latest API 실패:', e);
                window.open(product.defaultUrl, '_blank', 'noopener');
                setPw('');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!product.defaultUrl) {
            alert(`${product.name} 다운로드 파일이 아직 준비되지 않았습니다.\n관리자에게 문의해주세요.`);
            return;
        }
        window.open(product.defaultUrl, '_blank', 'noopener');
        setPw('');
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
                <img
                    src={product.image}
                    alt={product.name}
                    loading="lazy"
                    style={{
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
                {version && <span style={{ marginLeft: 8, fontSize: '0.7em', color: product.accent, fontWeight: 600 }}>{version}</span>}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 18 }}>{product.version}</p>
            <div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') tryDownload(); }}
                        placeholder="비밀번호 입력"
                        style={{
                            flex: 1, padding: '12px 14px',
                            background: 'rgba(0,0,0,0.3)',
                            border: `1px solid ${error ? '#ff3b5c' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                            animation: shake ? 'shakeDl 0.4s' : 'none',
                        }}
                    />
                    <button
                        onClick={tryDownload}
                        disabled={loading}
                        style={{ padding: '12px 18px', background: `linear-gradient(135deg, ${product.accent}, ${product.accent}cc)`, color: '#000', border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="다운로드"
                    >
                        {loading ? (
                            <span style={{ fontSize: 16 }}>⏳</span>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        )}
                    </button>
                </div>
                {error && <p style={{ marginTop: 8, color: '#ff3b5c', fontSize: 12, fontWeight: 600 }}>비밀번호가 올바르지 않습니다.</p>}
            </div>
            <style>{`@keyframes shakeDl{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
        </div>
    );
}

export default DownloadPage;
