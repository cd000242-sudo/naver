import { EVIDENCE_ICON, SURFACE_TAG, TIER_BADGE } from './preemptionMeta';
import { goldenIndex } from '../../lib/goldenIndex';

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
};

function BoardCardHead({ row }: { row: CardHeadRow }) {
    const index = goldenIndex(row.searchVolume, row.documentCount);
    return (
        <>
            <div className="lw-card-tags">
                <span className="lw-topic-tag">{row.topic}</span>
                {row.earlyMover && <span className="lw-early-tag">지금이 선점 적기</span>}
                {row.layoutBestFor && SURFACE_TAG[row.layoutBestFor] && (
                    <span className={`lw-surface-tag surface-${row.layoutBestFor}`}>
                        {SURFACE_TAG[row.layoutBestFor]}
                    </span>
                )}
                {row.tier && TIER_BADGE[row.tier] && (
                    <span className={`lw-tier-tag ${TIER_BADGE[row.tier].cls}`}>{TIER_BADGE[row.tier].text}</span>
                )}
                {/* 구매 검토형이 블로그에 제일 값어치가 크다(리서치 §3). */}
                {row.intentLabel && row.intentLabel !== '분류 안 됨' && (
                    <span className="lw-intent-tag">{row.intentLabel}</span>
                )}
                {row.trendLabel && row.trendLabel !== '판정불가' && (
                    <span className="lw-trend-tag">{row.trendLabel}</span>
                )}
                {/* 자리가 비어 있어도 AI 가 답을 대신하면 클릭이 안 온다. */}
                {row.briefingRisk === 'high' && <span className="lw-warn-tag">AI 답변 잠식</span>}
                {row.regulatoryLabel && <span className="lw-warn-tag">{row.regulatoryLabel}</span>}
            </div>

            {index
                ? (
                    <h3 className={`lw-card-gold lw-gold-${index.tier}`}>
                        <span className="lw-gold-mini">{index.label} {index.ratio!.toFixed(1)}</span>
                        {row.keyword}
                    </h3>
                )
                : <h3>{row.keyword}</h3>}

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
