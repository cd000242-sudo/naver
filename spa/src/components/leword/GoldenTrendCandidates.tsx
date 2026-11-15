import type { PreemptionRow } from './PreemptionCard';
import LicenseGate from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { moneyAmountText } from './moneyBid';
import { formatCount } from '../../lib/keywordApi';
import { goldenMeasurementLabel, goldenTrendLabel } from '../../lib/goldenFocusModel';

export type GoldenTrendCandidate = PreemptionRow & {
    facingPosts?: number | null;
    sampledTitles?: number | null;
    sourceUrl?: string | null;
};

function safeSourceUrl(value?: string | null): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch { return null; }
}

/** Rising demand is a reason to investigate, never proof of a low-competition opportunity. */
export default function GoldenTrendCandidates({ rows, unlocked, onUnlock, onAnalyze, now }: {
    rows: GoldenTrendCandidate[];
    unlocked: boolean;
    onUnlock: () => void;
    onAnalyze: (keyword: string) => void;
    now: number;
}) {
    if (rows.length === 0) return null;
    return <details aria-label="경제·지원금 트렌드 후보" style={{ margin: '20px 0', padding: 20, border: '1px solid var(--lw-line)', borderRadius: 18, background: 'var(--lw-surface)' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--lw-text)', lineHeight: 1.8 }}>
            <strong>↗ 경제·지원금 트렌드 후보</strong>{' '}
            <strong style={{ color: 'var(--lw-text)' }}>{rows.length}개</strong>
            <span style={{ marginLeft: 12, color: 'var(--lw-text-secondary)', fontSize: 13 }}>후보 보기</span>
        </summary>
        <p style={{ margin: '8px 0', color: 'var(--lw-text-secondary)' }}>검색 수요 상승 · 황금키워드 통과 여부 별도</p>
        <p className="lw-write-hint">최근 수요가 늘어난 주제입니다. 경쟁이 높은 후보도 포함되므로 대상·신청 조건·지역을 좁혀 작성할 틈을 확인하세요.</p>
        {!unlocked ? <>
            <p className="lw-write-hint">후보의 키워드와 실측 지표는 이용권 또는 API 키 연결 후 확인할 수 있습니다.</p>
            <LicenseGate onUnlock={onUnlock} remaining={rows.length} />
        </> : <div style={{ display: 'grid', gap: 12 }}>
            {rows.map((row) => {
                const sourceUrl = safeSourceUrl(row.sourceUrl);
                const exact = row.facingPosts ?? row.serp?.exactTitleHits;
                const sampled = row.sampledTitles ?? row.serp?.sampledTitles;
                const competitionKnown = typeof exact === 'number' && Number.isFinite(exact) && exact >= 0
                    && typeof sampled === 'number' && Number.isFinite(sampled) && sampled > 0 && exact <= sampled;
                return <article key={row.keyword} style={{ padding: 16, border: '1px solid var(--lw-line)', borderRadius: 14, background: 'var(--lw-surface)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: 'var(--lw-positive)', fontSize: 13 }}>
                        <span>{row.topic}</span><span>{goldenTrendLabel(row, now)}</span>
                        <span>{goldenMeasurementLabel(row, now)}</span>
                    </div>
                    <h4 style={{ margin: '8px 0', color: 'var(--lw-text)', fontSize: 17 }}>{row.keyword}</h4>
                    <p style={{ margin: '8px 0', color: 'var(--lw-text)', lineHeight: 1.8 }}>
                        월 검색량 <strong>{formatCount(row.searchVolume)}</strong> · 문서수 <strong>{formatCount(row.documentCount)}</strong>
                        <br />{row.money ? moneyAmountText(row.money) : '네이버 광고 입찰가 미측정'}
                    </p>
                    <p style={{ margin: '8px 0', color: 'var(--lw-accent-ink)', fontSize: 13 }}>
                        {competitionKnown ? `상위 ${sampled}개 중 정면 대응 ${exact}개 · 경쟁 확인 필요` : '상위 제목 경쟁 미확인 · 작성 전 검색결과 확인 필요'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                        <button type="button" className="lw-more-btn" onClick={() => onAnalyze(row.keyword)}>키워드 상세 분석</button>
                        <a href={naverSearchUrl(row.keyword)} target="_blank" rel="noreferrer" style={{ color: 'var(--lw-accent-ink)' }}>네이버 검색결과</a>
                        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--lw-text)' }}>관련 출처</a>}
                    </div>
                </article>;
            })}
        </div>}
    </details>;
}
