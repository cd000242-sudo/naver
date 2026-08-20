import { useEffect, useState } from 'react';
import { TabIntro } from './LewordShared';
import LicenseGate, { isUnlocked } from './LicenseGate';
import AffiliateTitles from './AffiliateTitles';
import CoupangBoard from './CoupangBoard';
import { AFFILIATE_LANES, type LaneId } from './affiliateLanes';
import { loadUserKeys } from '../../lib/userKeys';

/**
 * 제휴 황금키워드 — 플랫폼별 서브탭.
 *
 * 사장님 지시(2026-08-12): "실시간 신호를 잡아서 지금 인기상품을 보여주고,
 * 여기서 분석해서 제휴수익을 낼 수 있게" — 선점 보드(주 2회 배치) 재활용 금지.
 *
 * 그래서 세 레인 모두 같은 실시간 상품 풀(쿠팡 베스트셀러·골드박스 실측)을 쓴다.
 * 토스·브랜드커넥트는 캠페인 목록이 로그인 뒤에 있어 자동으로 못 가져온다
 * (2026-08-10 Web Unlocker 로도 확인) — 그 사실을 적고, 같은 상품·브랜드를
 * 각 콘솔에서 찾아 캠페인을 걸도록 레인별 동선만 다르게 단다.
 */

/** 로컬 세션 수집기가 발행한 스냅샷. 계약은 scripts/affiliate-campaigns.js 가 만든다. */
type CampaignItem = {
    name: string;
    brand: string;
    image: string;
    url: string;
    reward: string;
    /** 판매가(원). 수집기가 이미 싣고 있었는데 화면이 버리고 있었다 — 2026-08-19 표시. */
    price?: number | null;
    /** 상품명에서 뽑은 검색어 — 쿠팡 레인과 같은 규칙. */
    keyword?: string;
    /** 니즈 검색어 — 사람들이 실제로 치는 검색어(실측 최고 수요). 성과의 진짜 입구다. */
    needKeyword?: string | null;
    needVolume?: number | null;
    /** 니즈 검색어의 블로그 문서수와 검색량 대비 비율. 못 쟀으면 null. */
    needDocs?: number | null;
    needRatio?: number | null;
    /** 건당 수익(원) = 가격 × 수수료율 단순 산술. 요율이 없는 레인은 null. */
    perSaleWon?: number | null;
    /** 브랜드커넥트 상품 ID — 내 스페이스 ID와 합쳐야 링크발급 화면이 열린다. */
    productId?: string;
    searchVolume?: number | null;
    documentCount?: number | null;
    /** 블로그 검색 상위 10 정면 대응 실측. 쿠팡 레인과 같은 판정. */
    serpTop?: { sampled: number; exact: number; partial: number } | null;
};

type CampaignSnapshot = {
    collectedAt: string;
    sites: Record<string, { label: string; items: CampaignItem[] }>;
};

/**
 * 노출 판정 — 니즈 검색어로 1페이지에 갈 수 있나.
 *
 * 사장님 지적(2026-08-20): "노출이 돼야 뭐가 팔리든 말든 하니까."
 * 예전엔 니즈 **검색량**만 보고 줄을 세웠다. 그래서 실측 결과
 * 드리미 로봇청소기(검색 24,700 / 문서 44,383)가 1등이었다 — 검색량보다
 * 글이 1.8배 많아 지수 낮은 사람은 근처도 못 가는 자리다.
 * 이제 비율이 순서를 정하고, 화면도 그걸 그대로 말한다.
 */
function exposureVerdict(ratio: number | null | undefined) {
    if (typeof ratio !== 'number') return null;
    if (ratio >= 2) return { label: `노출 잘 됨 · 글이 ${ratio}배 부족`, color: '#2ecc71', bg: 'rgba(46,204,113,.14)' };
    if (ratio >= 1) return { label: `해볼 만함 · 검색≈글 (${ratio}배)`, color: '#f5a623', bg: 'rgba(245,166,35,.14)' };
    return { label: `노출 어려움 · 글이 ${Math.round(10 / Math.max(ratio, 0.1)) / 10}배 많음`, color: '#ff6b6b', bg: 'rgba(255,107,107,.14)' };
}

/** 정면 실측 → 카드 배지. 쿠팡 레인과 같은 기준이라야 같은 뜻으로 읽힌다. */
function verdictBadge(item: CampaignItem) {
    const top = item.serpTop;
    if (!top || !top.sampled) return null;
    if (top.exact <= 2) return { label: `자리 있음 · 정면 ${top.exact}개 — 고르세요`, color: '#2ecc71', bg: 'rgba(46,204,113,.14)' };
    if (top.exact <= 5) return { label: `경합 · 정면 ${top.exact}개`, color: '#f5a623', bg: 'rgba(245,166,35,.14)' };
    return { label: `포화 · 정면 ${top.exact}개`, color: '#ff6b6b', bg: 'rgba(255,107,107,.14)' };
}

function AffiliateTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [lane, setLane] = useState<LaneId>('coupang');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
    /** 방금 복사한 상품 — 눌렀는데 아무 반응이 없으면 됐는지 알 수가 없다. */
    const [copied, setCopied] = useState('');

    /*
     * 토스·브랜드커넥트는 공개 API 가 없어 캠페인 목록이 로그인 뒤에 있다.
     * 로컬 세션 수집기가 주기적으로 떠서 스냅샷을 발행하고, 화면은 그 파일만 읽는다.
     * 파일이 아직 없으면(수집 전) 조용히 없는 대로 둔다 — 가짜를 만들지 않는다.
     */
    useEffect(() => {
        let alive = true;
        fetch('/data/affiliate-campaigns.json', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => { if (alive && data?.sites) setSnapshot(data as CampaignSnapshot); })
            .catch(() => { /* 없으면 없는 대로 */ });
        return () => { alive = false; };
    }, []);

    const active = AFFILIATE_LANES.find((item) => item.id === lane)!;
    /*
     * 브랜드커넥트 상품 화면은 **내 스페이스 ID**가 주소에 있어야 열린다(실측:
     * 없으면 "삭제되었거나 존재하지 않는 페이지"). 내 API 키 탭에 넣어 두면
     * 사장님 계정의 그 상품 화면으로 바로 가서 로그인된 채 링크를 발급받는다.
     * 없으면 콘솔 홈으로 보내고 상품명을 복사해 준다 — 검색해서 찾으면 된다.
     */
    const spaceId = String(loadUserKeys().brandconnectSpaceId || '').trim();

    /**
     * 이미 발급된 제휴링크인가.
     *
     * 브랜드커넥트 API 의 shortenUrl 은 **이미 제휴링크다**(실측 2026-08-20:
     * naver.me/FlB3RnSN → brandconnect.naver.com/affiliates/{id}?channelProductNo=…).
     * 그동안 이걸 두고 콘솔 주소를 손으로 조립해 "링크발급 하러 가기" 를 시켰다.
     * 그 주소는 SPA 라 어떤 경로든 200 을 주는 탓에 틀린 걸 눈치채지 못했다.
     * 발급받으러 갈 필요가 없다 — 링크는 이미 손에 있다.
     */
    const readyLink = (item: CampaignItem) => {
        const url = String(item.url || '');
        return /naver\.me\/|brandconnect\.naver\.com\/affiliates\//.test(url) ? url : '';
    };

    /** 발급된 링크가 없을 때 갈 곳. 상품 딥링크는 만들지 않는다 — 확인할 수 없는 주소다. */
    const consoleUrl = () => {
        if (lane === 'brandconnect') {
            return spaceId
                ? `https://brandconnect.naver.com/${spaceId}/affiliate/products`
                : 'https://brandconnect.naver.com/';
        }
        // 토스는 쉐어링크 콘솔에서 발급한다.
        return 'https://sharelink.toss.im/home';
    };

    const campaigns = lane === 'coupang' ? null : (snapshot?.sites?.[lane] ?? null);
    const collectedLabel = snapshot?.collectedAt
        ? new Date(snapshot.collectedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <>
            <TabIntro
                title="제휴 황금키워드"
                desc="지금 팔리는 상품에서 출발합니다. 상품마다 그 검색어의 월 검색량과 블로그 문서수를 실제로 재서, 찾는 사람이 많고 쓴 글이 적은 순으로 세웁니다. 확률은 만들지 않습니다."
                source="쿠팡 파트너스 베스트셀러·골드박스 · 네이버 검색광고 · 블로그 검색 API"
            />

            <div className="lw-segment lw-segment-wrap" role="tablist" aria-label="제휴 플랫폼">
                {AFFILIATE_LANES.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={lane === item.id}
                        className={lane === item.id ? 'on' : ''}
                        onClick={() => setLane(item.id)}
                    >{item.label}</button>
                ))}
            </div>

            {!unlocked && <LicenseGate onUnlock={() => setUnlocked(true)} />}

            {lane !== 'coupang' && campaigns && campaigns.items.length > 0 && (
                <>
                    <p className="lw-write-hint">
                        <strong>{active.label} 캠페인</strong> — 콘솔에서 받아온 실제 목록입니다.
                        {collectedLabel && <span style={{ opacity: .7 }}> · {collectedLabel} 수집</span>}
                    </p>
                    <ol className="lw-product-list">
                        {campaigns.items.map((item, index) => {
                            // 분석·검색은 니즈 검색어가 우선 — 상품명 검색어는 수요가 없다(실측 0~140).
                            const query = item.needKeyword || item.keyword || item.name;
                            const badge = verdictBadge(item);
                            return (
                                <li key={item.url || item.name} className="lw-product">
                                    <span className="lw-product-rank">{index + 1}</span>
                                    {item.image
                                        ? <img src={item.image} alt="" loading="lazy" />
                                        : <span />}
                                    <div className="lw-product-body">
                                        <div className="lw-product-tags">
                                            {badge && (
                                                <span style={{
                                                    color: badge.color, background: badge.bg,
                                                    border: `1px solid ${badge.color}44`, borderRadius: 999,
                                                    padding: '2px 10px', fontWeight: 700, fontSize: 12,
                                                }}>{badge.label}</span>
                                            )}
                                            {item.reward && <span className="lw-discount">{item.reward}</span>}
                                            {item.brand && <span className="lw-goldbox">{item.brand}</span>}
                                            {/*
                                              * 링크가 이미 있는지를 눈에 보이게 한다(사장님 실측 2026-08-20:
                                              * "제휴링크 복사 누르니까 그냥 브랜드커넥트로 들어가는데?").
                                              * shortenUrl 은 **이미 발급받은 상품에만** 온다 — 7건 중 2건뿐이었다.
                                              * 버튼만 바뀌면 왜 다른지 알 수가 없어 고장으로 읽힌다.
                                              */}
                                            {readyLink(item)
                                                ? <span className="lw-linktag on">링크 발급됨</span>
                                                : <span className="lw-linktag">발급 필요</span>}
                                        </div>
                                        <a className="lw-product-name" href={item.url || active.consoleUrl} target="_blank" rel="noreferrer">{item.name}</a>
                                        <div className="lw-product-metrics">
                                            {typeof item.price === 'number' && item.price > 0 && (
                                                <span className="lw-product-price"><strong>{item.price.toLocaleString('ko-KR')}원</strong></span>
                                            )}
                                            {exposureVerdict(item.needRatio) && (
                                                <span
                                                    className="lw-metric lw-metric-verdict"
                                                    style={{
                                                        color: exposureVerdict(item.needRatio)?.color,
                                                        background: exposureVerdict(item.needRatio)?.bg,
                                                    }}
                                                >{exposureVerdict(item.needRatio)?.label}</span>
                                            )}
                                            {item.needKeyword && item.needVolume ? (
                                                <span className="lw-product-need" title="사람들이 실제로 치는 검색어와 월 검색량(실측). 이 검색어로 글을 써서 상품을 답으로 소개하는 것이 성과의 입구입니다.">
                                                    니즈 <strong>{item.needKeyword}</strong> 월 <strong>{item.needVolume.toLocaleString('ko-KR')}</strong>
                                                    {typeof item.needDocs === 'number' && (
                                                        <> · 문서 <strong>{item.needDocs.toLocaleString('ko-KR')}</strong></>
                                                    )}
                                                </span>
                                            ) : null}
                                            {typeof item.perSaleWon === 'number' && item.perSaleWon > 0 && (
                                                <span className="lw-product-persale" title="판매가 × 수수료율 단순 계산">건당 <strong>{item.perSaleWon.toLocaleString('ko-KR')}원</strong></span>
                                            )}
                                            <span>검색어 <strong>{query}</strong></span>
                                            <span>월 검색량 <strong>{item.searchVolume == null ? '—' : item.searchVolume.toLocaleString('ko-KR')}</strong></span>
                                            <span>문서수 <strong>{item.documentCount == null ? '—' : item.documentCount.toLocaleString('ko-KR')}</strong></span>
                                            {item.serpTop && item.serpTop.sampled > 0 && (
                                                <span title={`블로그 검색 상위 ${item.serpTop.sampled}개 제목 중 '${query}'를 그대로 다룬 글 ${item.serpTop.exact}개`}>
                                                    상위{item.serpTop.sampled} 정면 <strong>{item.serpTop.exact}개</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="lw-product-actions">
                                        <button type="button" className="lw-act lw-act-blue" onClick={() => onAnalyze(query)}>LEWORD 키워드분석</button>
                                        <a
                                            className="lw-act lw-act-green"
                                            href={`https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                        >네이버 검색분석</a>
                                        {readyLink(item) ? (
                                            <button
                                                type="button"
                                                className="lw-act lw-act-gold"
                                                onClick={() => {
                                                    navigator.clipboard?.writeText(readyLink(item));
                                                    setCopied(item.productId || item.name);
                                                    window.setTimeout(() => setCopied(''), 2200);
                                                }}
                                            >
                                                {copied === (item.productId || item.name) ? '복사했습니다' : '제휴링크 복사'}
                                                <span className="lw-act-sub">
                                                    {item.reward || '이미 발급된 링크입니다'}
                                                </span>
                                            </button>
                                        ) : (
                                            <a
                                                className="lw-act lw-act-gold"
                                                href={consoleUrl()}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={() => { if (lane === 'brandconnect') navigator.clipboard?.writeText(item.name); }}
                                            >
                                                콘솔에서 발급받기
                                                <span className="lw-act-sub">상품명 복사됨 — 검색창에 붙여넣기</span>
                                            </a>
                                        )}
                                    </div>
                                    <AffiliateTitles keyword={query} product={item.name} onAnalyze={onAnalyze} />
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}

            {lane !== 'coupang' && !(campaigns && campaigns.items.length > 0) && (
                <div className="lw-note lw-note-limit">
                    <strong>{active.status}</strong>
                    <p>
                        캠페인 목록을 아직 못 받아왔습니다. 그동안은 실시간 인기 상품 풀을 같은 판정으로 보여줍니다 —
                        콘솔에서 같은 상품·브랜드를 찾아 캠페인을 거세요.
                        <a href={active.consoleUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>콘솔 열기 →</a>
                    </p>
                </div>
            )}

            {(lane === 'coupang' || !(campaigns && campaigns.items.length > 0)) && (
                <CoupangBoard onAnalyze={onAnalyze} lane={lane} />
            )}
        </>
    );
}

export default AffiliateTab;
