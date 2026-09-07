export type RecommendationStatus = 'ready' | 'research' | 'excluded';
export default function RecommendationFilter({ value, onChange, counts }: {
    value: RecommendationStatus;
    onChange: (value: RecommendationStatus) => void;
    counts: Record<RecommendationStatus, number>;
}) {
    return <>
        <div className="lw-segment lw-segment-wrap" role="group" aria-label="추천 근거 상태">
            {([
                ['ready', '근거 통과 작성 후보'], ['research', '추가 조사'], ['excluded', '추천 제외 · 보관'],
            ] as const).map(([id, label]) => <button key={id} type="button" className={value === id ? 'on' : ''}
                aria-pressed={value === id} onClick={() => onChange(id)}>{label} <em>{counts[id]}</em></button>)}
        </div>
        <p className="lw-write-hint">추천은 상품 일치·동일 검색어 수요·경쟁 자료·48시간 이내 확인을 통과한 후보입니다. 검색량÷문서수나 제목 일치만으로 상위 노출을 보장하지 않습니다. 초기 선별 기준이며 판매 실적으로 검증된 성공 확률은 아닙니다.</p>
        {counts[value] === 0 && <p role="status" className="lw-note">{value === 'ready'
            ? '현재 모든 근거를 통과한 작성 후보가 없습니다. 추가 조사에서 미확인 사유와 기존 상품·링크를 확인할 수 있습니다.'
            : '이 상태의 상품이 없습니다.'}</p>}
    </>;
}
