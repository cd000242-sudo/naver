import { WRITE_LANES } from './preemptionMeta';

/**
 * 보드 위쪽 거르개 두 줄 — 어느 판에 쓸 글인가, 어느 주제인가.
 *
 * 판을 가르는 근거는 검색결과 **배치 순서 실측**이다. 인기글이 위면 네이버 판,
 * 웹사이트가 위면 SEO 판이다. 사장님이 그린 쓰임새가 이거다 —
 * "오늘 네이버 홈판엔 뭘 적을까, 워드프레스엔 뭘 적을까."
 *
 * 행이 없는 판은 아예 안 보여 준다. 눌러도 빈 화면인 버튼을 두지 않는다.
 */

type Counts = { laneCount: (laneId: string) => number; total: number };

export function WriteLaneFilter({
    value, onChange, counts,
}: { value: string; onChange: (next: string) => void; counts: Counts }) {
    const hint = WRITE_LANES.find((lane) => lane.id === value)?.hint;
    return (
        <>
            <div className="lw-segment lw-segment-wrap lw-write-lanes" role="group" aria-label="어느 판에 쓸 글인가">
                {WRITE_LANES.map((lane) => {
                    const count = lane.id === 'all' ? counts.total : counts.laneCount(lane.id);
                    if (count === 0 && lane.id !== 'all') return null;
                    return (
                        <button
                            key={lane.id}
                            type="button"
                            className={value === lane.id ? 'on' : ''}
                            onClick={() => onChange(lane.id)}
                        >{lane.label} <em>{count}</em></button>
                    );
                })}
            </div>
            {hint && <p className="lw-write-hint">{hint}</p>}
        </>
    );
}

/*
 * 카테고리는 **서브탭**이다 — 사장님 지시(2026-08-11): "서브탭으로 카테고리별로
 * 보여주고". 칩(둥근 버튼)이었던 것을 밑줄 강조 탭으로 바꾼다.
 *
 * tablist 로 두는 이유는 모양 때문만이 아니다. 화면 낭독기가 "탭 3/29" 처럼
 * 읽어 주고 좌우 화살표로 넘어간다 — 칩은 그냥 버튼 29개로 읽힌다.
 */
export function TopicFilter({
    value, onChange, topics, total,
}: {
    value: string;
    onChange: (next: string) => void;
    topics: [string, number][];
    total: number;
}) {
    return (
        <div className="lw-topic-tabs" role="tablist" aria-label="블로그 주제">
            <button
                type="button"
                role="tab"
                aria-selected={value === '전체'}
                className={value === '전체' ? 'on' : ''}
                onClick={() => onChange('전체')}
            >전체 <em>{total}</em></button>
            {topics.map(([label, count]) => (
                <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={value === label}
                    className={value === label ? 'on' : ''}
                    onClick={() => onChange(label)}
                >{label} <em>{count}</em></button>
            ))}
        </div>
    );
}
