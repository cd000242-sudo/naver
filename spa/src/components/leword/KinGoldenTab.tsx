import { useEffect, useMemo, useState } from 'react';
import { formatCount } from '../../lib/keywordApi';
import { TabIntro } from './LewordShared';

/**
 * 지식인 황금질문 — 좌측 메뉴의 독립 탭(사장님 설계 2026-08-20).
 *
 * 질문이 곧 키워드다. 많이 본 질문은 지금 카페·SNS·검색 등 다른 판에서도 같은
 * 질문이 터지고 있다는 실측 신호라, 답변에 링크 한둘을 얹으면 외부유입이
 * 연쇄된다. 세 레인 전부 실측이다:
 *   실시간 = 지식인 홈 '많이 본 Q&A' 30건 전부
 *   급상승 = 직전 수집 대비 조회수가 붙는 속도(두 실측의 차이)
 *   숨은   = 최신 질문인데 조회 많고 답변 적은 것 + 황금키워드 보드의 실측 질문
 */

type KinQ = {
    title: string;
    link: string;
    summary?: string;
    views: number | null;
    answers: number | null;
    rank?: number;
    viewsDelta?: number;
    perHour?: number;
    /** 보드에서 온 질문이면 근거 키워드가 붙는다 — 글감으로 바로 잇는다. */
    keyword?: string;
};

type KinGoldenData = {
    fetchedAt?: string;
    prevFetchedAt?: string | null;
    criteria?: { hidden?: string; rising?: string };
    realtime?: KinQ[];
    rising?: KinQ[];
    hidden?: KinQ[];
};

const LANES = [
    { id: 'realtime', label: '실시간 Q&A', hint: '지식인 홈 "많이 본 Q&A" 30건 전부 — 지금 사람들이 실제로 읽는 질문' },
    { id: 'rising', label: '급상승 Q&A', hint: '직전 수집 대비 조회수가 붙는 속도 순 — 두 번 실측한 차이만 싣는다' },
    { id: 'hidden', label: '숨은 Q&A', hint: '목록엔 안 떴지만 조회 많고 답변 적은 최신 질문 — 답변 선점 자리' },
] as const;

type LaneId = (typeof LANES)[number]['id'];

function KinGoldenTab({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<KinGoldenData | null>(null);
    const [boardHidden, setBoardHidden] = useState<KinQ[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [lane, setLane] = useState<LaneId>('realtime');
    const [copied, setCopied] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetch('/data/kin-golden.json')
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((json) => { if (!cancelled) { setData(json); setStatus('ready'); } })
            .catch(() => { if (!cancelled) setStatus('error'); });
        /*
         * 황금키워드 보드가 이미 실측해 둔 질문(키워드별 최신·조회순)도 숨은
         * 레인의 재료다 — 근거 키워드가 붙어 있어 글감으로 바로 이어진다.
         */
        fetch('/data/preemption-board.json')
            .then((res) => (res.ok ? res.json() : null))
            .then((board) => {
                if (cancelled || !board || !Array.isArray(board.rows)) return;
                const rows = board.rows as Array<{
                    keyword: string;
                    kinTop?: Array<{ title: string; link: string; views?: number | null; answers?: number | null }> | null;
                }>;
                setBoardHidden(rows
                    .flatMap((row) => (row.kinTop || []).map((q) => ({
                        title: q.title, link: q.link,
                        views: typeof q.views === 'number' ? q.views : null,
                        answers: typeof q.answers === 'number' ? q.answers : null,
                        keyword: row.keyword,
                    })))
                    .filter((q) => typeof q.views === 'number' && q.views >= 300 && typeof q.answers === 'number' && q.answers <= 2));
            })
            .catch(() => { /* 보드 없음 = 크롤 실측만 */ });
        return () => { cancelled = true; };
    }, []);

    const docIdOf = (link: string) => (link.match(/docId=(\d+)/) || [])[1] || link;

    const laneItems = useMemo<KinQ[]>(() => {
        if (!data) return [];
        if (lane === 'realtime') return data.realtime || [];
        if (lane === 'rising') return data.rising || [];
        const seen = new Set<string>();
        return [...(data.hidden || []), ...boardHidden]
            .filter((q) => {
                const id = docIdOf(q.link);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    }, [data, boardHidden, lane]);

    const fetchedLabel = data?.fetchedAt
        ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(data.fetchedAt))
        : '';

    return (
        <>
            <TabIntro
                title="지식인 황금질문"
                desc="질문이 곧 키워드입니다. 많이 본 질문은 지금 카페·SNS·검색에서도 같은 질문이 터지고 있다는 실측 신호라, 답변에 글 링크를 얹으면 외부유입이 연쇄됩니다. 조회수·답변수는 전부 질문 페이지 실측입니다."
                source={`지식인 실측 수집${fetchedLabel ? ` · ${fetchedLabel} 수집` : ''} · 15분마다 갱신`}
            />

            <div className="lw-segment lw-segment-wrap" role="group" aria-label="질문 레인">
                {LANES.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={lane === item.id ? 'on' : ''}
                        onClick={() => setLane(item.id)}
                    >{item.label} <em>{item.id === 'realtime' ? (data?.realtime || []).length
                        : item.id === 'rising' ? (data?.rising || []).length
                            : laneItems.length && lane === 'hidden' ? laneItems.length : ((data?.hidden || []).length + boardHidden.length)}</em></button>
                ))}
            </div>
            <p className="lw-write-hint">{LANES.find((item) => item.id === lane)?.hint}</p>

            {status === 'loading' && <div className="lw-note">질문 실측을 불러오는 중입니다…</div>}
            {status === 'error' && (
                <div className="lw-note lw-note-error">
                    <strong>아직 수집 전입니다</strong>
                    <p>15분 주기 수집이 한 번 돌면 여기에 채워집니다.</p>
                </div>
            )}

            {status === 'ready' && lane === 'rising' && laneItems.length === 0 && (
                <div className="lw-note">
                    급상승은 두 번의 실측 차이로만 잽니다. 직전 스냅샷이 쌓이면(다음 수집부터) 여기 채워집니다.
                    {data?.criteria?.rising ? ` 기준: ${data.criteria.rising}` : ''}
                </div>
            )}
            {status === 'ready' && lane === 'hidden' && laneItems.length === 0 && (
                <div className="lw-note">이번 실측에서 기준(조회 많음 · 답변 적음)을 만족한 숨은 질문이 없습니다.</div>
            )}

            {status === 'ready' && laneItems.length > 0 && (
                <ol className="lw-kg-list">
                    {laneItems.map((q, index) => (
                        <li key={q.link}>
                            <span className="lw-kg-rank">{q.rank ?? index + 1}</span>
                            <div className="lw-kg-body">
                                <a href={q.link} target="_blank" rel="noreferrer">{q.title}</a>
                                {q.summary && <p>{q.summary}</p>}
                                <small>
                                    {typeof q.views === 'number' && <b>조회 {formatCount(q.views)}</b>}
                                    {typeof q.answers === 'number' && <> · 답변 {q.answers}</>}
                                    {typeof q.perHour === 'number' && <> · <em className="lw-kg-up">시간당 +{formatCount(q.perHour)}</em></>}
                                    {q.keyword && (
                                        <> · 키워드 {onAnalyze
                                            ? <button type="button" className="lw-kg-kw" onClick={() => onAnalyze(q.keyword!)}>{q.keyword}</button>
                                            : q.keyword}</>
                                    )}
                                </small>
                            </div>
                            <button
                                type="button"
                                className="lw-kg-copy"
                                onClick={() => {
                                    navigator.clipboard?.writeText(q.title);
                                    setCopied(q.link);
                                    window.setTimeout(() => setCopied(''), 1400);
                                }}
                            >{copied === q.link ? '복사됨' : '질문 복사'}</button>
                        </li>
                    ))}
                </ol>
            )}
        </>
    );
}

export default KinGoldenTab;
