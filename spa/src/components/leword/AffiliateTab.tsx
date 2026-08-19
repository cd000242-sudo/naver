import { useEffect, useState } from 'react';
import { TabIntro } from './LewordShared';
import LicenseGate, { isUnlocked } from './LicenseGate';
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

    /** 링크를 발급받는 화면. 계정 연결이 돼 있으면 그 상품으로 바로, 아니면 콘솔 홈으로. */
    const issueUrl = (item: CampaignItem) => {
        if (lane === 'brandconnect') {
            return spaceId && item.productId
                ? `https://brandconnect.naver.com/${spaceId}/affiliate/products/${item.productId}`
                : 'https://brandconnect.naver.com/';
        }
        // 토스는 쉐어링크 콘솔에서 발급한다 — 상품 주소가 있으면 그 상품으로 보낸다.
        return item.url || 'https://sharelink.toss.im/home';
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
                                        </div>
                                        <a className="lw-product-name" href={item.url || active.consoleUrl} target="_blank" rel="noreferrer">{item.name}</a>
                                        <div className="lw-product-metrics">
                                            {typeof item.price === 'number' && item.price > 0 && (
                                                <span className="lw-product-price"><strong>{item.price.toLocaleString('ko-KR')}원</strong></span>
                                            )}
                                            {item.needKeyword && item.needVolume ? (
                                                <span className="lw-product-need" title="사람들이 실제로 치는 검색어와 월 검색량(실측). 이 검색어로 글을 써서 상품을 답으로 소개하는 것이 성과의 입구입니다.">
                                                    니즈 <strong>{item.needKeyword}</strong> 월 <strong>{item.needVolume.toLocaleString('ko-KR')}</strong>
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
                                        <a
                                            className="lw-act lw-act-gold"
                                            href={issueUrl(item)}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={() => { if (!spaceId && lane === 'brandconnect') navigator.clipboard?.writeText(item.name); }}
                                        >
                                            상품 확인 및 링크발급
                                            <span className="lw-act-sub">
                                                {lane === 'brandconnect' && !spaceId
                                                    ? '상품명 복사됨 — 콘솔에서 검색'
                                                    : (item.reward || '내 계정으로 열립니다')}
                                            </span>
                                        </a>
                                    </div>
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
