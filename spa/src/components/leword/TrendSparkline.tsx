import { useRef, useState } from 'react';

/**
 * 최근 30일 검색 추이 스파크라인 — 데이터랩 상대값 실측을 그대로 그린다.
 * "그래프가 보여야 이 키워드로 글을 써도 될지 알 수 있다"(사장님 2026-08-19).
 * 점수·예측을 만들지 않는다 — 실측 선 하나와 실측 라벨뿐이다.
 * 마우스를 올리면 그 날의 실측값이 보인다(사장님 지시 2026-08-19).
 */

function buildCoords(series: number[], width: number, height: number, pad: number): Array<[number, number]> {
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const span = Math.max(max - min, 1);
    const stepX = (width - pad * 2) / Math.max(series.length - 1, 1);
    return series.map((value, index) => [
        pad + index * stepX,
        height - pad - ((value - min) / span) * (height - pad * 2),
    ]);
}

function TrendSparkline({ series, label, height = 56, monthlyVolume = null }: {
    series: number[];
    /** 실측 유형 라벨(에버그린·시즌성…) — 있으면 같이 보여 준다. */
    label?: string;
    height?: number;
    /**
     * 검색광고 월 검색량(실측). 주면 상대값을 **하루 몇 회**로 바꿔 읽어 준다
     * (사장님 지적 2026-08-22 "상대값이면 초보자들은 뭔지 모르잖아").
     *
     * 계산은 단순 나눗셈이다: 그날 상대값 ÷ 30일 상대값 합 × 월 검색량.
     * 데이터랩 상대값은 검색량에 비례하도록 만들어진 값이라 이 환산이 성립한다.
     * 월 검색량이 없으면 예전처럼 상대값만 보여 준다 — 지어내지 않는다.
     */
    monthlyVolume?: number | null;
}) {
    const [hover, setHover] = useState(-1);
    const svgRef = useRef<SVGSVGElement>(null);
    if (!Array.isArray(series) || series.length < 2) return null;
    const width = 240;
    const pad = 4;
    const coords = buildCoords(series, width, height, pad);
    const points = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = series[series.length - 1];
    const peak = Math.max(...series);
    /*
     * 상대값 → 그날 검색 횟수. 월 검색량을 상대값 비중대로 나눈 단순 산술이다.
     * 월 검색량이 없거나 상대값 합이 0이면 null — 그때는 상대값을 그대로 쓴다.
     */
    const sum = series.reduce((total, value) => total + value, 0);
    const dailyOf = (index: number): number | null => {
        if (!monthlyVolume || sum <= 0) return null;
        return Math.round((series[index] / sum) * monthlyVolume);
    };
    const rising = series.length >= 7
        && series.slice(-7).reduce((a, b) => a + b, 0) > series.slice(0, 7).reduce((a, b) => a + b, 0);

    const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const ratio = (event.clientX - rect.left) / rect.width;
        const index = Math.round(ratio * (series.length - 1));
        setHover(Math.max(0, Math.min(series.length - 1, index)));
    };
    const daysAgo = series.length - 1 - hover;

    return (
        <div className="lw-spark" title="네이버 데이터랩 최근 30일 상대 검색 추이(실측)">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="최근 30일 검색 추이"
                onMouseMove={onMove}
                onMouseLeave={() => setHover(-1)}
            >
                <polyline
                    points={points}
                    fill="none"
                    stroke={rising ? '#2ecc71' : '#7c9cff'}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                {hover >= 0 && (
                    <circle
                        cx={coords[hover][0]}
                        cy={coords[hover][1]}
                        r="3.5"
                        fill={rising ? '#2ecc71' : '#7c9cff'}
                    />
                )}
            </svg>
            <div className="lw-spark-foot">
                {hover >= 0 ? (
                    // 호버 중에는 그 날의 실측값이 라벨을 대신한다 — 자리가 좁아 같이는 못 선다.
                    <span className="lw-spark-hover">
                        {daysAgo === 0 ? '오늘' : `${daysAgo}일 전`}
                        {' · '}
                        {dailyOf(hover) !== null
                            ? `약 ${dailyOf(hover)!.toLocaleString('ko-KR')}회`
                            : `상대값 ${series[hover]}`}
                    </span>
                ) : (
                    <>
                        <span>{monthlyVolume ? `최근 30일 · 월 ${monthlyVolume.toLocaleString('ko-KR')}회` : '최근 30일'}</span>
                        {label ? <em>{label}</em> : null}
                        <span className={last >= peak * 0.8 ? 'lw-spark-hot' : ''}>
                            {last >= peak * 0.8 ? '지금 정점권' : `정점 대비 ${Math.round((last / Math.max(peak, 1)) * 100)}%`}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

export default TrendSparkline;
