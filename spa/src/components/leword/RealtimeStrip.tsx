import { useEffect, useState } from 'react';
import { fetchRealtimeIssues } from '../../lib/keywordApi';

/**
 * 지금 실시간 검색어 — 실검 틈새 탭 맨 위의 살아 있는 줄.
 *
 * 왜 있나(사장님 지적 2026-09-04 "판다랭크는 5분 전 1분 전 이런식으로 바로바로
 * 업데이트되는데 내껀 한시간전"): 아래 카드들은 CI 가 하루 3회 발행하는 **실측 판정**
 * 이라 최대 8시간 낡는다. 목록만 받아 오는 일은 HTTP 1회라 싸서, Worker 크론이
 * 5분마다 채워 둔 것을 여기서 읽는다.
 *
 * 두 시각을 구분해 적는다 — 지어낼 수 없기 때문이다.
 *   소스 기준   signal.bz 가 순위를 뜬 시각. 우리가 손댈 수 없는 신선도 상한이다.
 *   처음 본 때   우리 크론이 그 키워드를 목록에서 처음 본 시각. "몇 분 전 진입"은 이것이다.
 * 트렌드가 실제로 시작된 시각은 어느 소스도 주지 않는다. 그래서 안 적는다.
 */

const agoText = (ms: number | null | undefined): string => {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
};

type Payload = NonNullable<Awaited<ReturnType<typeof fetchRealtimeIssues>>['data']>;

type Props = {
    /** 아래 실측 판에 이미 올라온 키워드 — 겹치는 것은 "판정 있음"으로 표시한다. */
    measuredKeys?: Set<string>;
    onPick?: (keyword: string) => void;
    /*
     * 부모(IssueNicheTab)가 이미 받아 둔 실시간 목록. 카드가 "지금 실검에 살아있나"를
     * 대조하는 데 같은 데이터를 쓰므로, 두 번 받지 않게 위에서 내려 준다.
     * 없으면(다른 화면에서 쓰면) 예전처럼 자체로 받는다 — 하위호환.
     */
    data?: Payload | null;
};

export default function RealtimeStrip({ measuredKeys, onPick, data: injected }: Props) {
    const [selfData, setSelfData] = useState<Payload | null>(null);
    const [failed, setFailed] = useState(false);
    // 화면에 떠 있는 동안 나이가 굳지 않게 1분마다 다시 그린다(재요청은 5분마다).
    const [tick, setTick] = useState(0);
    const data = injected !== undefined ? injected : selfData;

    useEffect(() => {
        // 부모가 데이터를 내려 주면 자체 로드는 하지 않는다(중복 요청 방지).
        if (injected !== undefined) {
            const repaintOnly = setInterval(() => setTick((n) => n + 1), 60 * 1000);
            return () => clearInterval(repaintOnly);
        }
        let alive = true;
        const load = () => {
            fetchRealtimeIssues()
                .then((result) => {
                    if (!alive) return;
                    // 실패는 조용히 접는다 — 이 줄이 없다고 아래 실측 판이 못 볼 이유가 없다.
                    if (!result.ok || !result.data) { setFailed(true); return; }
                    setSelfData(result.data);
                    setFailed(false);
                })
                .catch(() => { if (alive) setFailed(true); });
        };
        load();
        const reload = setInterval(load, 5 * 60 * 1000);
        const repaint = setInterval(() => setTick((n) => n + 1), 60 * 1000);
        return () => { alive = false; clearInterval(reload); clearInterval(repaint); };
    }, [injected]);

    const items = data?.items || [];
    /*
     * 나이는 **그릴 때마다 지금 시각으로 다시 센다**. 서버가 준 ...AgeMs 를 그대로 쓰면
     * 탭을 열어 둔 채 10분이 지나도 "3분 전"에 굳는다 — 사장님이 지적하신 바로 그 증상이다.
     * tick(1분)이 이 계산을 다시 돌린다.
     */
    const ageFrom = (at: number | null | undefined) => {
        void tick;
        return at ? Date.now() - at : null;
    };

    if (failed || !data || items.length === 0) return null;

    const sourceAge = ageFrom(data.sourceBatchAt);

    return (
        <div className="lw-realtime-strip">
            <div className="lw-realtime-head">
                <strong>지금 실시간</strong>
                <span className="lw-realtime-meta">
                    소스 기준 {agoText(sourceAge)} · 5분마다 다시 받음
                </span>
            </div>
            <div className="lw-realtime-items">
                {items.map((item) => {
                    const measured = measuredKeys?.has(item.keyword.replace(/\s+/g, '').toLowerCase());
                    const up = item.rankDelta != null && item.rankDelta > 0;
                    const down = item.rankDelta != null && item.rankDelta < 0;
                    return (
                        <button
                            key={item.keyword}
                            type="button"
                            className={`lw-realtime-item${measured ? ' measured' : ''}`}
                            title={`${item.rank}위 · 우리가 처음 본 때 ${agoText(ageFrom(item.firstSeenAt))}${item.prevRank ? ` · 직전 ${item.prevRank}위` : ''}`}
                            onClick={() => onPick?.(item.keyword)}
                        >
                            <span className="lw-realtime-rank">{item.rank}</span>
                            <span className="lw-realtime-word">{item.keyword}</span>
                            {up && <span className="lw-realtime-delta up">▲{item.rankDelta}</span>}
                            {down && <span className="lw-realtime-delta down">▼{Math.abs(item.rankDelta as number)}</span>}
                            {item.prevRank == null && <span className="lw-realtime-new">새로 진입 · {agoText(ageFrom(item.firstSeenAt))}</span>}
                            {measured && <span className="lw-realtime-measured">판정 있음</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
