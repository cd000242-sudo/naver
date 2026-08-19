/**
 * 최근 30일 검색 추이 스파크라인 — 데이터랩 상대값 실측을 그대로 그린다.
 * "그래프가 보여야 이 키워드로 글을 써도 될지 알 수 있다"(사장님 2026-08-19).
 * 점수·예측을 만들지 않는다 — 실측 선 하나와 실측 라벨뿐이다.
 */

function buildPoints(series: number[], width: number, height: number, pad: number): string {
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const span = Math.max(max - min, 1);
    const stepX = (width - pad * 2) / Math.max(series.length - 1, 1);
    return series
        .map((value, index) => {
            const x = pad + index * stepX;
            const y = height - pad - ((value - min) / span) * (height - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
}

function TrendSparkline({ series, label, height = 56 }: {
    series: number[];
    /** 실측 유형 라벨(에버그린·시즌성…) — 있으면 같이 보여 준다. */
    label?: string;
    height?: number;
}) {
    if (!Array.isArray(series) || series.length < 2) return null;
    const width = 240;
    const pad = 4;
    const points = buildPoints(series, width, height, pad);
    const last = series[series.length - 1];
    const peak = Math.max(...series);
    const rising = series.length >= 7
        && series.slice(-7).reduce((a, b) => a + b, 0) > series.slice(0, 7).reduce((a, b) => a + b, 0);

    return (
        <div className="lw-spark" title="네이버 데이터랩 최근 30일 상대 검색 추이(실측)">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="최근 30일 검색 추이">
                <polyline
                    points={points}
                    fill="none"
                    stroke={rising ? '#2ecc71' : '#7c9cff'}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            </svg>
            <div className="lw-spark-foot">
                <span>최근 30일</span>
                {label ? <em>{label}</em> : null}
                <span className={last >= peak * 0.8 ? 'lw-spark-hot' : ''}>
                    {last >= peak * 0.8 ? '지금 정점권' : `정점 대비 ${Math.round((last / Math.max(peak, 1)) * 100)}%`}
                </span>
            </div>
        </div>
    );
}

export default TrendSparkline;
