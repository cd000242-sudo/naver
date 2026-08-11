import { EVIDENCE_ICON, SURFACE_TAG, TIER_BADGE } from './preemptionMeta';

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

/**
 * 배지는 셋만 남긴다 — 사장님 지시(2026-08-11): "카테고리 빼고 구매검토 빼줘,
 * 저 3개는 깔끔하게: 워드프레스 판 / 상위 3위권 빈자리 / 상승세."
 *
 * 카테고리는 위쪽 주제 필터가 이미 말한다(카드마다 반복하면 눈만 시끄럽다).
 * '구매 검토' 같은 의도 라벨은 거의 모든 행에 붙어 변별력이 없었다.
 *
 * 경고 배지(AI 답변 잠식·규제)는 남긴다 — 안 보이면 손해 보는 쪽이라 성격이 다르다.
 */
function BoardCardHead({ row, rank }: { row: CardHeadRow; rank?: number }) {
    return (
        <>
            <div className="lw-card-tags">
                {row.earlyMover && <span className="lw-early-tag">지금이 선점 적기</span>}
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
                {/* 자리가 비어 있어도 AI 가 답을 대신하면 클릭이 안 온다. */}
                {row.briefingRisk === 'high' && <span className="lw-warn-tag">AI 답변 잠식</span>}
                {row.regulatoryLabel && <span className="lw-warn-tag">{row.regulatoryLabel}</span>}
            </div>

            {/*
              * 키워드 앞에 붙던 '약함 0.0' 을 **순위**로 바꿨다.
              *
              * 그 값은 황금지수(검색량 ÷ 문서수)였는데, 이 보드에서는 전 행이 '약함'
              * 으로 나와 아무것도 못 가른다. SSS 기준이 비율 5배인데 실측 45건의
              * 최대가 0.476 이었다 — 검색량은 한 달 치이고 문서수는 10년치 누적이라
              * 애초에 넘을 수 없는 눈금이다. 색도 약함(노랑)이 초황금(금색)과 겹쳤다.
              *
              * 대신 사장님이 정한 줄 세우기(광고 많고 · 검색량 높고 · 문서수 낮은 순)
              * 에서의 자리를 적는다. 지어낸 점수가 아니라 목록에서의 위치다.
              */}
            <h3 className="lw-card-keyword">
                {rank !== undefined && <span className="lw-rank">{rank}</span>}
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
