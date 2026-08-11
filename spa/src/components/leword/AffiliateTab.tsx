import { useEffect, useState } from 'react';
import { formatCount } from '../../lib/keywordApi';
import { goldenIndex } from '../../lib/goldenIndex';
import { TabIntro } from './LewordShared';
import LicenseGate, { FREE_BOARD_ROWS, isUnlocked } from './LicenseGate';
import CoupangBoard from './CoupangBoard';
import {
    AFFILIATE_LANES, affiliateRows, brandToken, rowsForLane,
    type AffiliateRow, type LaneId,
} from './affiliateLanes';

/**
 * 제휴 황금키워드 — 플랫폼별 서브탭.
 *
 * 사장님 지적: "인기상품을 그냥 나열한 게 아니라, 지금 이 제품으로 글을 작성하면
 * 제휴수익이 날 확률이 높은 제품을 찾아서 나열해 달라는 뜻이야.
 * 이건 그냥 황금키워드 있는 걸 분류해서 가져온 것밖에 안 되잖아."
 *
 * 맞다. 그래서 **상품에서 출발**하도록 뒤집었다 —
 *   쿠팡: 골드박스(지금 쿠팡이 미는 상품)를 받아, 상품마다 그 검색어의
 *         월 검색량·문서수를 실제로 재고 찾는 사람 대비 쓴 글이 적은 순으로 세운다.
 *   나머지 둘: 목록이 로그인 뒤에 있어 못 가져온다(Web Unlocker 로도 확인했다).
 *         그 사실을 적고, 대신 상품 카드가 실제로 뜬 검색어 자리를 싣는다.
 */

function AffiliateTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [lane, setLane] = useState<LaneId>('coupang');
    const [rows, setRows] = useState<AffiliateRow[] | null>(null);
    const [copied, setCopied] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());

    // 쿠팡 말고 두 레인이 쓸 실측 키워드. 쿠팡 탭에서는 안 쓴다.
    useEffect(() => {
        let alive = true;
        fetch('/data/preemption-board.json', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no board'))))
            .then((data) => { if (alive) setRows(affiliateRows(Array.isArray(data?.rows) ? data.rows : [])); })
            .catch(() => { if (alive) setRows([]); });
        return () => { alive = false; };
    }, []);

    const active = AFFILIATE_LANES.find((item) => item.id === lane)!;
    const laneRows = rowsForLane(lane, rows || []).slice(0, unlocked ? undefined : FREE_BOARD_ROWS);

    const copy = (keyword: string) => {
        navigator.clipboard?.writeText(keyword);
        setCopied(keyword);
        window.setTimeout(() => setCopied(''), 1400);
    };

    return (
        <>
            <TabIntro
                title="제휴 황금키워드"
                desc="지금 팔리는 상품에서 출발합니다. 상품마다 그 검색어의 월 검색량과 블로그 문서수를 실제로 재서, 찾는 사람이 많고 쓴 글이 적은 순으로 세웁니다. 확률은 만들지 않습니다."
                source="쿠팡 파트너스 골드박스 · 네이버 검색광고 · 블로그 검색 API"
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

            <p className="lw-write-hint">{active.desc}</p>

            {!unlocked && <LicenseGate onUnlock={() => setUnlocked(true)} />}

            {/*
              * 사장님 지시(2026-08-12): "실시간 신호를 잡아서 지금 인기상품을 보여주고,
              * 여기서 분석해서 제휴수익을 낼 수 있게" — 선점 보드(주 2회 배치) 재활용 금지.
              * 쿠팡 레인은 실시간 공급(베스트셀러·골드박스)을 그 자리에서 분석하는
              * CoupangBoard 가 통째로 맡는다. 아래 키워드 목록은 나머지 두 레인용이다.
              */}
            {lane === 'coupang' && (
                <>
                    <p className="lw-write-hint">
                        <strong>실시간 인기상품 분석</strong> — 쿠팡 베스트셀러(지금 팔리는 순위)와
                        골드박스 특가를 받아, 상품마다 검색량·문서수를 그 자리에서 재고
                        글로 쓸 가치 순으로 세웁니다.
                    </p>
                    <CoupangBoard onAnalyze={onAnalyze} />
                </>
            )}

            {lane !== 'coupang' && (
                <>
                    <div className="lw-note lw-note-limit">
                        <strong>{active.status}</strong>
                        <p>
                            대신 검색결과에 상품 카드가 실제로 뜬 자리를 싣습니다 — 파는 물건이 있다는 실측입니다.
                            <a href={active.consoleUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>콘솔 열기 →</a>
                        </p>
                    </div>

                    <ol className="lw-lane-list lw-lane-list-wide">
                        {laneRows.map((row, index) => {
                            const goldIndex = goldenIndex(row.searchVolume, row.documentCount);
                            return (
                                <li key={row.keyword} className="lw-lane-card">
                                    <div className="lw-lane-rank">{index + 1}</div>
                                    <div className="lw-lane-body">
                                        <div className="lw-lane-tags">
                                            <span className="lw-topic-tag">{row.topic}</span>
                                            {goldIndex && (
                                                <span className={`lw-gold-mini lw-gold-${goldIndex.tier}`}>
                                                    {goldIndex.label} {goldIndex.ratio!.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                        <h3>{row.keyword}</h3>
                                        {lane === 'brandconnect' && brandToken(row) && (
                                            <p className="lw-lane-product">브랜드 «{brandToken(row)}»</p>
                                        )}
                                        <div className="lw-lane-metrics">
                                            <span>검색량 <strong>{formatCount(row.searchVolume)}</strong></span>
                                            <span>문서수 <strong>{formatCount(row.documentCount)}</strong></span>
                                        </div>
                                        <div className="lw-lane-actions">
                                            <button type="button" onClick={() => copy(row.keyword)}>
                                                {copied === row.keyword ? '복사됨' : '복사'}
                                            </button>
                                            <button type="button" onClick={() => onAnalyze(row.keyword)}>분석</button>
                                            {active.search && (
                                                <a href={active.search(row.keyword)} target="_blank" rel="noreferrer">쿠팡에서 찾기</a>
                                            )}
                                            <a href={active.consoleUrl} target="_blank" rel="noreferrer">캠페인 확인</a>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>

                    {laneRows.length === 0 && (
                        <p className="lw-lane-empty">이번 회차에 이 판에 맞는 자리가 없습니다.</p>
                    )}
                </>
            )}
        </>
    );
}

export default AffiliateTab;
