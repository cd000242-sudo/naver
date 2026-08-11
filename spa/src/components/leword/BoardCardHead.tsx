import { EVIDENCE_ICON, SURFACE_TAG, TIER_BADGE } from './preemptionMeta';
import { preemptionIndex } from '../../lib/preemptionIndex';

/**
 * 보드 카드의 머리 — 배지·제목·근거.
 *
 * 표시 전용이라 목록 컴포넌트에서 떼어 냈다. 판정은 하나도 안 한다 —
 * 이미 실측으로 정해진 값을 읽어 색과 문구로 옮길 뿐이다.
 */

type Evidence = { code: string; text: string };

export type CardHeadRow = {
    keyword: string;
    topic: string;
    tier?: string;
    intentLabel?: string;
    trendLabel?: string;
    briefingRisk?: string | null;
    regulatoryLabel?: string;
    layoutBestFor?: string | null;
    earlyMover?: boolean;
    earlyMoverReasons?: string[];
    evidence: Evidence[];
    searchVolume: number | null;
    documentCount: number | null;
    serp?: {
        adCount?: number | null;
        exactTitleHits?: number | null;
        sampledTitles?: number | null;
    };
};

/**
 * 배지는 **셋만** 남긴다 — 사장님 지시(2026-08-11):
 * "카테고리 빼고 구매검토 빼줘, 저 3개는 깔끔하게:
 *  워드프레스 판 / 상위 3위권 빈자리 / 상승세."
 *
 * 카테고리는 위쪽 주제 서브탭이 이미 말한다(카드마다 반복하면 눈만 시끄럽다).
 * '구매 검토' 같은 의도 라벨은 거의 모든 행에 붙어 변별력이 없었다.
 * '지금이 선점 적기'·경고 배지도 뺐다 — 셋만 두라는 지시가 명시적이었다.
 * 경고에 해당하는 사실은 아래 근거 줄에 그대로 남아 있다.
 */
function BoardCardHead({ row, rank }: { row: CardHeadRow; rank?: number }) {
    const index = preemptionIndex({
        searchVolume: row.searchVolume,
        adCount: row.serp?.adCount,
        facingPosts: row.serp?.exactTitleHits,
        sampledTitles: row.serp?.sampledTitles,
    });
    return (
        <>
            <div className="lw-card-tags">
                {row.layoutBestFor && SURFACE_TAG[row.layoutBestFor] && (
                    <span className={`lw-surface-tag surface-${row.layoutBestFor}`}>
                        {SURFACE_TAG[row.layoutBestFor]}
                    </span>
                )}
                {row.tier && TIER_BADGE[row.tier] && (
                    <span className={`lw-tier-tag ${TIER_BADGE[row.tier].cls}`}>{TIER_BADGE[row.tier].text}</span>
                )}
                {row.trendLabel && row.trendLabel !== '판정불가' && (
                    <span className="lw-trend-tag">{row.trendLabel}</span>
                )}
            </div>

            {/*
              * 키워드 앞: 순위 + 등급.
              *
              * 전에는 '약함 0.0'(검색량 ÷ 문서수)이 붙었는데 이 보드에서는 전 행이
              * '약함' 으로 나와 아무것도 못 가른다 — SSS 기준이 비율 5배인데 실측
              * 45건의 최대가 0.476 이었다. 검색량은 한 달 치이고 문서수는 10년치
              * 누적이라 애초에 넘을 수 없는 눈금이다. 색도 약함(노랑)이 초황금(금색)과
              * 겹쳤다(사장님 지적).
              *
              * 그래서 눈금을 사장님 기준으로 다시 잡았다 — 광고 · 검색량 · 정면 글.
              * 판정은 preemptionIndex 가 단일 출처다(화면이 따로 판정하지 않는다).
              */}
            <h3 className="lw-card-keyword">
                {rank !== undefined && <span className="lw-rank">{rank}</span>}
                <span className={`lw-index lw-index-${index.tier}`} title={index.reasons.join(' · ')}>
                    {index.label}
                </span>
                {row.keyword}
            </h3>

            <ul className="lw-evidence">
                {(row.earlyMoverReasons || []).map((text) => (
                    <li key={text} className="lw-evidence-early"><span aria-hidden="true">↗</span>{text}</li>
                ))}
                {row.evidence.map((item) => (
                    <li key={item.code}>
                        <span aria-hidden="true">{EVIDENCE_ICON[item.code] || '·'}</span>{item.text}
                    </li>
                ))}
            </ul>
        </>
    );
}

export default BoardCardHead;
