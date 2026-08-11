import { useEffect, useState } from 'react';
import { TabIntro } from './LewordShared';
import LicenseGate, { isUnlocked } from './LicenseGate';
import CoupangBoard from './CoupangBoard';
import { AFFILIATE_LANES, type LaneId } from './affiliateLanes';

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
type CampaignSnapshot = {
    collectedAt: string;
    sites: Record<string, { label: string; items: { name: string; brand: string; image: string; url: string; reward: string }[] }>;
};

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
                        {campaigns.items.map((item, index) => (
                            <li key={item.url || item.name} className="lw-product">
                                <span className="lw-product-rank">{index + 1}</span>
                                {item.image
                                    ? <img src={item.image} alt="" loading="lazy" />
                                    : <span />}
                                <div className="lw-product-body">
                                    <div className="lw-product-tags">
                                        {item.brand && <span className="lw-goldbox">{item.brand}</span>}
                                        {item.reward && <span className="lw-discount">{item.reward}</span>}
                                    </div>
                                    <a className="lw-product-name" href={item.url || active.consoleUrl} target="_blank" rel="noreferrer">{item.name}</a>
                                </div>
                                <div className="lw-product-actions">
                                    <button type="button" className="lw-act lw-act-blue" onClick={() => onAnalyze(item.brand || item.name)}>LEWORD 키워드분석</button>
                                    <a
                                        className="lw-act lw-act-green"
                                        href={`https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(item.brand || item.name)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >네이버 검색분석</a>
                                    <a className="lw-act lw-act-gold" href={item.url || active.consoleUrl} target="_blank" rel="noreferrer">
                                        캠페인 열기
                                    </a>
                                </div>
                            </li>
                        ))}
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
