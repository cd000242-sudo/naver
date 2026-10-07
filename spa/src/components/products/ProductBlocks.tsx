/**
 * 제품 페이지 공용 부품 — 시안 1(고수보다 한 수 위, 비교로 증명)을 네 페이지가 같이 쓴다.
 * 가격 · 후기는 상점 · 후기 페이지와 같은 출처에서 읽는다(화면마다 숫자를 따로 적지 않는다).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchSiteContent, EDGE_URL } from '../../lib/siteOps';
import { applyStoreOverrides, isTaxIncludedPrice, productCardAmount, TERMS, won, type Product } from '../../lib/productCatalog';
import { normalizeReview, type Testimonial } from '../../pages/ReviewsPage';
import { ArrowRight, ArrowUp, Chevron, DevicesIcon, IncomeIcon, Plus, ReviewIcon } from './ProductIcons';
import type { VsSample } from './useAdsenseVs';

export type Cta = { to: string; label: string };

export function HeroActions({ primary, secondary }: { primary: Cta; secondary?: Cta }) {
    return (
        <div className="pp-actions">
            <Link to={primary.to} className="pp-btn pp-btn-gold">{primary.label}<ArrowRight /></Link>
            {secondary && <Link to={secondary.to} className="pp-btn pp-btn-line">{secondary.label}<ArrowRight /></Link>}
        </div>
    );
}

/**
 * 비교 판 — 왼쪽(흐리게) · 가운데 VS · 오른쪽(밝게) + 줄마다 나은 점. 네 페이지 공용.
 * chip 은 판 위 가운데 숫자 띠(실측 · 사실만), foot 은 출처 한 줄.
 * paired=false — 두 열의 줄이 서로 짝이 아닐 때(실제 카드의 고수 글 · 우리 제목은 1:1 대응이 아니다). 줄 높이 맞춤을 풀어 짝처럼 보이지 않게 한다.
 */
export type VsRow = { text: string; edge?: string };
export function VsPanel({ label, chip, theirsTitle, oursTitle, theirs, ours, foot, paired = true }: {
    label: string; chip?: ReactNode; theirsTitle: string; oursTitle: string; theirs: string[]; ours: VsRow[]; foot?: string; paired?: boolean;
}) {
    return (
        <div className="pp-vs" aria-label={label}>
            {chip && <div className="pp-vs-chip pp-num">{chip}</div>}
            <div className={`pp-vs-cols${paired ? '' : ' unpaired'}`}>
                <div className="pp-vs-col theirs">
                    <h3>{theirsTitle}</h3>
                    <ul className="pp-vs-list" role="list">
                        {theirs.map((text) => <li key={text} className="pp-vs-row">{text}</li>)}
                    </ul>
                </div>
                <div className="pp-vs-mid" aria-hidden><span className="pp-vs-badge">VS</span></div>
                <div className="pp-vs-col ours">
                    <h3>{oursTitle}</h3>
                    <ul className="pp-vs-list" role="list">
                        {ours.map((row) => (
                            <li key={row.text} className="pp-vs-row">
                                {row.text}
                                {row.edge && <span className="pp-vs-edge"><ArrowUp /><span>{keepQuoted(row.edge)}</span></span>}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            {foot && <p className="pp-vs-foot">{foot}</p>}
        </div>
    );
}

/** 따옴표로 묶인 말('서류·준비물')은 줄바꿈으로 쪼개지 않는다. */
function keepQuoted(text: string): ReactNode[] {
    return text.split(/('[^']+')/).map((part, i) => (/^'[^']+'$/.test(part) ? <span key={i} className="pp-nw">{part}</span> : part));
}

/** LEWORD 첫 화면 — 애드센스 고수 판의 실제 카드를 비교 판에 싣는다. */
export function AdsenseVsPanel({ sample }: { sample: VsSample }) {
    return (
        <VsPanel
            label={`대표 검색어 ${sample.query} — 고수 블로그 제목과 LEWORD 제목 비교`}
            chip={<>
                <span>{sample.query}</span><i aria-hidden />
                <span>검색량 <b>{won(sample.searchVolume)}</b></span>
                {sample.documentCount != null && <><i aria-hidden /><span>문서수 <b>{won(sample.documentCount)}</b></span></>}
                <i aria-hidden /><span>실측</span>
            </>}
            theirsTitle={sample.sourceCount > sample.theirs.length ? `고수 글 ${sample.sourceCount}편 중 ${sample.theirs.length}편` : '고수 블로그 제목'}
            oursTitle="LEWORD 제목"
            theirs={sample.theirs}
            ours={sample.ours}
            paired={false}
            foot={`애드센스 고수 벤치마크 실제 카드 · ${sample.asOf} 기준`}
        />
    );
}

export type ProofItem = { to: string; title: string; desc: string; icon: 'review' | 'income' | 'devices' };
const PROOF_ICON = { review: ReviewIcon, income: IncomeIcon, devices: DevicesIcon };

export function ProofStrip({ items }: { items: ProofItem[] }) {
    return (
        <nav className="pp-proof" aria-label="증거 바로가기">
            {items.map((item) => {
                const Icon = PROOF_ICON[item.icon];
                return (
                    <Link key={item.title} to={item.to}>
                        <span className={`pp-proof-icon${item.icon === 'devices' ? ' mint' : ''}`}><Icon /></span>
                        <span><strong>{item.title}</strong><span>{item.desc}</span></span>
                        <Chevron className="pp-chev" />
                    </Link>
                );
            })}
        </nav>
    );
}

/** 기능 띠 — 글 한쪽 · 실제 화면 한쪽. 같은 크기 카드 나열 대신 번갈아 놓는다. */
export function FeatureBand({ title, body, tabs, shot, flip, children }: {
    title: string; body: string; tabs?: string[]; flip?: boolean; children?: ReactNode;
    /** mobileSrc — 폰(≤720px)에서 쓸 확대 잘라낸 화면. 전체 화면을 폰 폭으로 줄이면 글씨가 무늬가 된다. */
    shot: { src: string; alt: string; caption: string; mobileSrc?: string };
}) {
    return (
        <div className={`pp-band${flip ? ' flip' : ''}`}>
            <div className="pp-band-copy">
                <h3>{title}</h3>
                <p>{body}</p>
                {tabs && <ul className="pp-tabs" role="list">{tabs.map((tab) => <li key={tab}>{tab}</li>)}</ul>}
                {children}
            </div>
            <figure className="pp-shot">
                <picture>
                    {shot.mobileSrc && <source media="(max-width: 720px)" srcSet={shot.mobileSrc} />}
                    <img src={shot.src} alt={shot.alt} loading="lazy" decoding="async" />
                </picture>
                <figcaption>{shot.caption}</figcaption>
            </figure>
        </div>
    );
}

/** 상점과 같은 값 — 카탈로그 기본값 위에 관리자 [상점 제품] 저장값을 얹는다. */
export function useProduct(id: string): Product | null {
    const [catalog, setCatalog] = useState<Product[]>(() => applyStoreOverrides(null));
    useEffect(() => {
        let cancelled = false;
        fetchSiteContent().then((content) => {
            if (!cancelled && content?.store?.products) setCatalog(applyStoreOverrides(content.store.products));
        }).catch(() => { /* 기본값 그대로 */ });
        return () => { cancelled = true; };
    }, []);
    return useMemo(() => catalog.find((item) => item.id === id && item.status === 'on') || null, [catalog, id]);
}

/** 기간별 값 — 팔지 않는 기간(값 0)은 칸을 만들지 않는다. 부가세는 칸마다 밝힌다. */
export function PriceBlock({ product, cta }: { product: Product; cta: Cta }) {
    const cells = TERMS.map((term) => ({ term, price: product.prices[term.id] || 0 })).filter((cell) => cell.price > 0);
    return (
        <>
            <div className="pp-price pp-num">
                {cells.map(({ term, price }) => {
                    const taxIncluded = isTaxIncludedPrice(product, term.id);
                    const unit = term.id === 'monthly' ? '원 / 월' : term.id === 'yearly' ? '원 / 1년' : '원 / 영구';
                    return (
                        <div key={term.id}>
                            <small>{term.label}</small>
                            <strong>{won(price)}<span>{unit}</span></strong>
                            <p>{taxIncluded
                                ? `부가세 포함${term.id === 'monthly' && product.id === 'leword' ? ' · 30일마다 자동결제' : ''}`
                                : `부가세 별도 · 카드 결제 ${won(productCardAmount(product, term.id, price))}원`}</p>
                        </div>
                    );
                })}
            </div>
            <div className="pp-price-cta">
                <Link to={cta.to} className="pp-btn pp-btn-gold">{cta.label}<ArrowRight /></Link>
                <Link to="/bank-order" className="pp-btn pp-btn-line">계좌이체로 사기<ArrowRight /></Link>
            </div>
        </>
    );
}

export type PriceLadder = { name: string; low: number; high: number; ours?: boolean; note: string };

/** 단계 요금 막대 — 낮은 단계부터 높은 단계까지를 한 줄로. 우리 값은 한 점. */
export function CompareBars({ rows, source }: { rows: PriceLadder[]; source: string }) {
    const max = Math.max(...rows.map((row) => row.high));
    return (
        <>
            <div className="pp-compare pp-num" role="list">
                {rows.map((row) => {
                    const left = (row.low / max) * 100;
                    const width = Math.max(((row.high - row.low) / max) * 100, 1.6);
                    return (
                        <div key={row.name} className={`pp-bar${row.ours ? ' ours' : ''}`} role="listitem">
                            <span className="pp-bar-name">{row.name}<small>{row.note}</small></span>
                            <span className="pp-bar-track" aria-hidden><span className="pp-bar-fill" style={{ marginLeft: `${left}%`, width: `${width}%` }} /></span>
                            <span className="pp-bar-price">{row.low === row.high ? `${won(row.low)}원` : `${won(row.low)}~${won(row.high)}원`}</span>
                        </div>
                    );
                })}
            </div>
            <p className="pp-source">{source}</p>
        </>
    );
}

/**
 * 실제 구매 후기 — 후기 페이지와 같은 창구 · 같은 가림 처리. 제품 말이 들어간 것만, 최신 3건.
 * exclude — 지금 사실과 다른 기대를 주는 후기(옛 무료판 · 영구제 · 그 제품이 하지 않는 일)를 뺀다. 문장은 고치지 않는다.
 */
export function ReviewQuotes({ match, exclude, title }: { match: RegExp; exclude?: RegExp; title: string }) {
    const [quotes, setQuotes] = useState<Testimonial[]>([]);
    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        fetch(`${EDGE_URL}?action=get-reviews`, { cache: 'no-store', signal: controller.signal })
            .then((res) => res.json())
            .then((data) => {
                const list = (Array.isArray(data?.reviews) ? data.reviews : []).map(normalizeReview).filter(Boolean) as Testimonial[];
                const picked = list
                    .filter((item) => item.text.length >= 40 && match.test(item.text) && !(exclude && exclude.test(item.text)))
                    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
                    .slice(0, 3);
                setQuotes(picked);
            })
            .catch(() => setQuotes([]))
            .finally(() => window.clearTimeout(timer));
        return () => { controller.abort(); window.clearTimeout(timer); };
    }, [match, exclude]);

    // 이 제품 후기가 없으면 칸째 비운다(감싼 .pp-section 은 CSS :has 로 접힌다) — 증거 띠에 이미 '구매 후기' 링크가 있다. 다른 제품 후기를 섞지 않는다.
    if (quotes.length === 0) return null;
    return (
        <>
            <h2 className="pp-h2">{title}</h2>
            <div className="pp-quotes" style={{ ['--pp-qcols' as string]: quotes.length }}>
                {quotes.map((item) => (
                    <blockquote key={`${item.author}-${item.timestamp}`}>
                        <p>{item.text}</p>
                        <cite>{item.author}{item.timestamp ? ` · ${String(item.timestamp).slice(0, 10)}` : ''}</cite>
                    </blockquote>
                ))}
            </div>
            <Link to="/reviews" className="pp-more">구매 후기 전체 보기<ArrowRight /></Link>
        </>
    );
}

export function FaqList({ items }: { items: Array<[string, string]> }) {
    return (
        <div className="pp-faq">
            {items.map(([q, a]) => (
                <details key={q}>
                    <summary>{q}<Plus /></summary>
                    <p>{a}</p>
                </details>
            ))}
        </div>
    );
}

export function CloseBand({ title, primary, secondary }: { title: string; primary: Cta; secondary?: Cta }) {
    return (
        <section className="pp-close">
            <h2 className="pp-h2">{title}</h2>
            <HeroActions primary={primary} secondary={secondary} />
        </section>
    );
}
