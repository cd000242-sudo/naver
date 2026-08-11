import { useState } from 'react';
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

function AffiliateTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [lane, setLane] = useState<LaneId>('coupang');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());

    const active = AFFILIATE_LANES.find((item) => item.id === lane)!;

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

            {lane !== 'coupang' && (
                <div className="lw-note lw-note-limit">
                    <strong>{active.status}</strong>
                    <p>
                        대신 실시간 인기 상품 풀을 같은 판정(정면 실측)으로 보여줍니다 —
                        콘솔에서 같은 상품·브랜드를 찾아 캠페인을 거세요.
                        <a href={active.consoleUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>콘솔 열기 →</a>
                    </p>
                </div>
            )}

            <CoupangBoard onAnalyze={onAnalyze} lane={lane} />
        </>
    );
}

export default AffiliateTab;
