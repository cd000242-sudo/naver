import type { RealtimeSource, RealtimeSourceId } from '../../lib/realtimeSources.mjs';

const agoText = (at: number | null | undefined, nowMs: number): string => {
    if (!at || !Number.isFinite(at)) return '시각 미확인';
    const minutes = Math.floor(Math.max(0, nowMs - at) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
};

type Props = {
    measuredKeys?: Set<string>;
    onPick?: (keyword: string) => void;
    sources: RealtimeSource[];
    selected: RealtimeSourceId;
    onSelect: (id: RealtimeSourceId) => void;
    loading: boolean;
    failed: boolean;
    nowMs: number;
};

/** Parent fetches once for the list, source comparison and on-demand measurement. */
export default function RealtimeStrip({ measuredKeys, onPick, sources, selected, onSelect, loading, failed, nowMs }: Props) {
    const source = sources.find(item => item.id === selected)!;
    return (
        <section className="lw-realtime-strip" aria-label="출처별 실시간 검색어">
            <div className="lw-realtime-head">
                <strong>지금 실시간</strong>
                <span className="lw-realtime-meta">출처별 순위 · 5분마다 다시 받음</span>
            </div>
            <div className="lw-segment lw-segment-wrap" role="group" aria-label="실시간 검색어 출처" style={{ marginBottom: 12 }}>
                {sources.map(item => (
                    <button key={item.id} type="button" aria-pressed={selected === item.id} className={selected === item.id ? 'on' : ''} onClick={() => onSelect(item.id)}>
                        {item.label} <em>{item.items.length}</em>
                    </button>
                ))}
            </div>
            <p className="lw-realtime-meta" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
                {source.detail} · {source.sourceAt ? `소스 기준 ${agoText(source.sourceAt, nowMs)}` : '원문 갱신 시각 미제공'}
                {source.checkedAt ? ` · 수집 ${agoText(source.checkedAt, nowMs)}` : ''}
            </p>
            {failed && <p className="lw-note" role="status">{source.label} 최신 목록을 받지 못했습니다.{source.items.length > 0 ? ' 마지막으로 받은 목록입니다.' : ' 잠시 후 다시 확인해 주세요.'}</p>}
            {source.items.length === 0 ? (
                !failed && <p className="lw-note" role="status">{loading ? `${source.label} 목록을 불러오는 중입니다…` : `${source.label}에서 제공된 목록이 없습니다.`}</p>
            ) : (
                <ol className="lw-realtime-items" aria-label={`${source.label} 실시간 검색어 순위`}>
                    {source.items.map(item => {
                        const measured = measuredKeys?.has(item.keyword.replace(/\s+/g, '').toLowerCase());
                        const delta = item.rankDelta;
                        const Row = onPick ? 'button' : 'div';
                        return (
                            <li key={`${item.rank}-${item.keyword}`}>
                                <Row type={onPick ? 'button' : undefined} className={`lw-realtime-item${measured ? ' measured' : ''}`}
                                    title={`${source.label} ${item.rank}위${item.firstSeenAt ? ` · 우리가 처음 본 때 ${agoText(item.firstSeenAt, nowMs)}` : ''}${item.prevRank ? ` · 직전 ${item.prevRank}위` : ''}`}
                                    onClick={() => onPick?.(item.keyword)}>
                                    <span className="lw-realtime-rank">{item.rank}</span>
                                    <span className="lw-realtime-word">{item.keyword}</span>
                                    <span className="lw-realtime-badges">
                                        {delta != null && delta > 0 && <span className="lw-realtime-delta up">▲{delta}</span>}
                                        {delta != null && delta < 0 && <span className="lw-realtime-delta down">▼{Math.abs(delta)}</span>}
                                        {item.prevRank == null && item.firstSeenAt != null && <span className="lw-realtime-new">처음 관측 · {agoText(item.firstSeenAt, nowMs)}</span>}
                                        {item.approxTraffic && <span className="lw-realtime-meta">원문 검색량 {item.approxTraffic}</span>}
                                        {measured && <span className="lw-realtime-measured">판정 있음</span>}
                                    </span>
                                </Row>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
