import { useEffect, useRef } from 'react';

/**
 * 수요 그래프 — 네이버 데이터랩 24개월 실측 시계열을 그대로 그린다.
 *
 * 전에는 '그래프보기'가 데이터랩으로 링크만 보냈는데, 그 주소는 키워드를
 * 채워주지 못해 빈 검색 폼이 떴다(사장님 지적 2026-08-19 "그래프 아직 안 고쳤네").
 * 배치가 어차피 재던 시계열을 보드에 실어, 여기서 직접 그린다 — 추정이 아니라
 * 실측이고, 값의 뜻(상대치, 최대=100)을 화면에 그대로 적는다.
 *
 * 디자인 규칙(design-taste-frontend·impeccable 검사 기준):
 * 글자 11px 미만 금지 · 색 글로우 금지 · 중립 격자 · 정점 하나만 강조.
 */

export type DemandPoint = { period: string; ratio: number };

/**
 * 그릴 시계열을 고른다 — 24개월 실측(demandSeries)이 있으면 그것, 없으면
 * 카드에 이미 그려진 30일 실측(trend.series)으로 폴백한다. 어느 쪽인지는
 * caption 으로 화면에 정직하게 적는다. 30일 배열에는 월 라벨이 없으므로
 * "N일 전" 라벨을 계산한다 — 실측 순서 그대로이고 지어낸 값이 아니다.
 */
export function pickChartSeries(row: {
    demandSeries?: DemandPoint[] | null;
    trend?: { series: number[] } | null;
}): { points: DemandPoint[]; caption: string } | null {
    const monthly = (row.demandSeries || []).filter((pt) => Number.isFinite(pt.ratio));
    if (monthly.length >= 2) {
        return { points: monthly, caption: `최근 ${monthly.length}개월 상대 검색량` };
    }
    const daily = (row.trend?.series || []).filter((value) => Number.isFinite(value));
    if (daily.length >= 2) {
        return {
            points: daily.map((ratio, index) => ({
                period: index === daily.length - 1 ? '오늘' : `${daily.length - 1 - index}일 전`,
                ratio,
            })),
            caption: `최근 ${daily.length}일 상대 검색량`,
        };
    }
    return null;
}

const W = 720;
const H = 240;
const PAD = { top: 18, right: 16, bottom: 30, left: 40 };

/** '2025-09-01' → '25.9' — 축 라벨은 짧아야 겹치지 않는다. */
function shortPeriod(period: string): string {
    const m = String(period).match(/^(\d{2})(\d{2})-(\d{2})/);
    if (m) return `${m[2]}.${Number(m[3])}`;
    // 월 형식이 아니면(30일 폴백의 'N일 전'/'오늘') 그대로 쓴다.
    return /일 전|오늘/.test(period) ? period : String(period).slice(0, 7);
}

function DemandChartModal({ keyword, series, caption, asOf, onClose }: {
    keyword: string;
    series: DemandPoint[];
    caption: string;
    asOf?: string | null;
    onClose: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    const points = (series || []).filter((pt) => Number.isFinite(pt.ratio));
    if (points.length < 2) return null;

    const max = Math.max(...points.map((pt) => pt.ratio), 1);
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (index: number) => PAD.left + (index / (points.length - 1)) * plotW;
    const y = (ratio: number) => PAD.top + (1 - ratio / max) * plotH;

    const line = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pt.ratio).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${PAD.left},${(PAD.top + plotH).toFixed(1)} Z`;

    const peakIndex = points.reduce((best, pt, i) => (pt.ratio > points[best].ratio ? i : best), 0);
    const last = points[points.length - 1];

    // 격자선은 25% 간격 — 눈금 값(상대치)도 함께 적는다. 숫자 없는 격자는 장식이다.
    const gridLevels = [0.25, 0.5, 0.75, 1];

    return (
        <div className="lw-chart-backdrop" role="presentation" onClick={onClose}>
            <div
                className="lw-chart-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${keyword} 검색 수요 그래프`}
                onClick={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <h3>{keyword}</h3>
                        <p>
                            네이버 데이터랩 실측 · {caption} (정점=100)
                            {asOf ? ` · ${asOf} 기준` : ''}
                        </p>
                    </div>
                    <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기">✕</button>
                </header>

                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${keyword} 월별 검색 추이`}>
                    {gridLevels.map((level) => (
                        <g key={level}>
                            <line
                                x1={PAD.left} x2={W - PAD.right}
                                y1={y(max * level)} y2={y(max * level)}
                                stroke="rgba(255,255,255,0.09)" strokeWidth="1"
                            />
                            <text x={PAD.left - 8} y={y(max * level) + 4} textAnchor="end" className="lw-chart-tick">
                                {Math.round(max * level)}
                            </text>
                        </g>
                    ))}

                    <path d={area} fill="rgba(0,224,198,0.10)" />
                    <path d={line} fill="none" stroke="#00e0c6" strokeWidth="2" strokeLinejoin="round" />

                    {/* 정점 — 이야기의 핵심 한 점만 강조한다. */}
                    <circle cx={x(peakIndex)} cy={y(points[peakIndex].ratio)} r="4" fill="#00e0c6" />
                    <text
                        x={x(peakIndex)}
                        y={y(points[peakIndex].ratio) - 10}
                        textAnchor={peakIndex > points.length * 0.8 ? 'end' : 'middle'}
                        className="lw-chart-peak"
                    >정점 {shortPeriod(points[peakIndex].period)}</text>

                    {/* 마지막 달 — "지금이 어디쯤인가" */}
                    <circle cx={x(points.length - 1)} cy={y(last.ratio)} r="3.5" fill="#ffffff" />

                    <text x={PAD.left} y={H - 8} textAnchor="start" className="lw-chart-tick">
                        {shortPeriod(points[0].period)}
                    </text>
                    <text x={W - PAD.right} y={H - 8} textAnchor="end" className="lw-chart-tick">
                        {shortPeriod(last.period)}
                    </text>
                </svg>

                <footer>
                    지금 수요는 정점의 {Math.round((last.ratio / points[peakIndex].ratio) * 100)}% 수준입니다.
                </footer>
            </div>
        </div>
    );
}

export default DemandChartModal;
