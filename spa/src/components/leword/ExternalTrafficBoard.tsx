import { useMemo, useState } from 'react';
import { preemptionIndex, TIER_ORDER } from '../../lib/preemptionIndex';

/**
 * 2군 — **네이버 자리는 늦었지만 외부 유입으로는 쓸 수 있는 밭.**
 *
 * 사장님 지적(2026-08-11): "외부 유입 글로 쓸 수도 있는데…?"
 *
 * 맞다. 여기 있는 것은 대부분 "이미 누가 정면으로 썼다" 이지 "수요가 없다" 가 아니다.
 * 실측: '시나공 cbt' 는 **월 검색량 7,610** 인데 상위 10개 중 4개가 이미 정면으로
 * 다뤄서 1군에서 빠졌다. 네이버 블로그로는 늦었어도 구글·워드프레스로는 충분하다.
 *
 * 이 목록은 발행 데이터(reference)에 계속 있었는데 **읽는 화면이 없어 통째로 묻혀
 * 있었다.** 80건이 매 회차 그렇게 버려지고 있었다.
 *
 * 1군과 한 칸에 섞지 않는다 — 섞으면 "이것도 황금, 저것도 황금"이 되어 보드의
 * 값어치가 사라진다. 접어 두고, 펼치면 나온다.
 */

export type ReferenceRow = {
    keyword: string;
    topic: string;
    searchVolume: number | null;
    documentCount?: number | null;
    /** 상단 파워링크 광고 건수. 옛 회차 데이터에는 없다. */
    adCount?: number | null;
    /** 상위 몇 개가 이미 정면으로 다뤘는가. */
    facingPosts?: number | null;
    sampledTitles?: number | null;
    note: string;
    trendLabel?: string;
    recencySummary?: string;
};

const fmt = (value: number | null | undefined) =>
    (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '—');

function ExternalTrafficBoard({
    rows, onAnalyze, searchUrl,
}: {
    rows: ReferenceRow[];
    onAnalyze?: (keyword: string) => void;
    searchUrl: (keyword: string) => string;
}) {
    const [open, setOpen] = useState(false);

    /*
     * 줄 세우기는 1군과 같다 — 검색량이 높고 문서수가 낮은 순(검색량 ÷ 문서수).
     * 그다음이 광고. 칸마다 다른 논리로 세우면 같은 보드가 둘로 보인다.
     * 둘 중 하나라도 못 쟀으면 줄 세울 근거가 없으므로 맨 뒤다.
     */
    const sorted = useMemo(() => {
        // 1군과 같은 기준이다 — 황금 등급으로 묶고 그 안에서 광고 많은 순.
        // 칸마다 다른 논리로 세우면 같은 보드가 둘로 보인다.
        const of = (row: ReferenceRow) => preemptionIndex({
            searchVolume: row.searchVolume, documentCount: row.documentCount,
        });
        return [...rows].sort((a, b) => {
            const rank = (row: ReferenceRow) => TIER_ORDER[of(row).tier];
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            const ads = (row: ReferenceRow) => (typeof row.adCount === 'number' ? row.adCount : null);
            if (ads(a) !== null && ads(b) !== null && ads(a) !== ads(b)) return (ads(b) as number) - (ads(a) as number);
            if ((of(a).worth ?? -1) !== (of(b).worth ?? -1)) return (of(b).worth ?? -1) - (of(a).worth ?? -1);
            return (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        });
    }, [rows]);

    if (sorted.length === 0) return null;

    return (
        <section className="lw-external">
            <button
                type="button"
                className="lw-external-head"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
            >
                <span className="lw-external-title">외부 유입용 {sorted.length}건</span>
                <span className="lw-external-desc">
                    네이버 상위는 이미 찼지만 검색하는 사람은 있는 자리입니다 — 구글·워드프레스로 쓰세요
                </span>
                <span className="lw-external-toggle">{open ? '접기' : '펼치기'}</span>
            </button>

            {open && (
                <div className="lw-board-list lw-external-list">
                    {sorted.map((row) => (
                        <article key={`${row.topic}-${row.keyword}`} className="lw-card lw-card-pre">
                            <div>
                                <div className="lw-card-tags">
                                    <span className="lw-ext-tag">외부 유입</span>
                                    {row.trendLabel && row.trendLabel !== '판정불가' && (
                                        <span className="lw-trend-tag">{row.trendLabel}</span>
                                    )}
                                </div>
                                <h3 className="lw-card-keyword">{row.keyword}</h3>
                                <ul className="lw-evidence">
                                    {/* 이유는 검색결과에서 센 사실 그대로다. */}
                                    <li><span aria-hidden="true">◎</span>{row.note}</li>
                                    {row.recencySummary && (
                                        <li><span aria-hidden="true">▲</span>{row.recencySummary}</li>
                                    )}
                                </ul>
                            </div>

                            <div className="lw-card-metrics">
                                <div><span>검색량</span><strong>{fmt(row.searchVolume)}</strong></div>
                                <div><span>문서수</span><strong>{fmt(row.documentCount)}</strong></div>
                                <div className={typeof row.adCount === 'number' && row.adCount >= 5 ? 'money' : ''}>
                                    <span>광고수</span>
                                    <strong>{typeof row.adCount === 'number' ? `${row.adCount}개` : '—'}</strong>
                                </div>
                                <div>
                                    <span>정면 글</span>
                                    <strong>
                                        {typeof row.facingPosts === 'number' ? `${row.facingPosts}건` : '—'}
                                    </strong>
                                </div>
                            </div>

                            <div className="lw-card-actions">
                                <a href={searchUrl(row.keyword)} target="_blank" rel="noreferrer">
                                    네이버 검색결과<small>누가 썼는지 확인</small>
                                </a>
                                {onAnalyze && (
                                    <button type="button" onClick={() => onAnalyze(row.keyword)}>
                                        LEWORD 키워드 분석
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

export default ExternalTrafficBoard;
