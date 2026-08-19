import { useEffect, useMemo, useState } from 'react';
import { fetchKinQuestion, formatCount } from '../../lib/keywordApi';
import { bridgeKinAnswer } from '../../lib/bridge';
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
    /** 질문 작성일(숨은 레인) — "최신"이 조건이므로 화면에 그대로 적는다. */
    askedAt?: string;
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

/**
 * 링크 장부 — 지식인은 링크 비율이 높으면 계정이 죽는다(사장님 실전 지식:
 * 답변 10개 중 1개만). "복사"를 게시로 간주해 이 브라우저에 기록하고,
 * 최근 9개 안에 링크 답변이 있으면 체크박스를 잠근다.
 */
const LEDGER_KEY = 'leaderspro.leword.kinAnswerLedger.v1';
const BLOG_URL_KEY = 'leaderspro.leword.kinBlogUrl.v1';

type LedgerEntry = { at: string; withLink: boolean };

function loadLedger(): LedgerEntry[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
    } catch {
        return [];
    }
}

function KinGoldenTab({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<KinGoldenData | null>(null);
    const [boardHidden, setBoardHidden] = useState<KinQ[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [lane, setLane] = useState<LaneId>('realtime');
    const [copied, setCopied] = useState('');

    /* ── 답변 작업대(사장님 확정 2026-08-20: 생성은 AI, 게시는 하나씩 직접) ── */
    const [work, setWork] = useState<KinQ | null>(null);
    const [workBody, setWorkBody] = useState<{ loading: boolean; text: string }>({ loading: false, text: '' });
    const [draft, setDraft] = useState('');
    const [generating, setGenerating] = useState(false);
    const [genNote, setGenNote] = useState('');
    const [withLink, setWithLink] = useState(false);
    const [blogUrl, setBlogUrl] = useState(() => localStorage.getItem(BLOG_URL_KEY) || '');
    const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadLedger());
    const [draftCopied, setDraftCopied] = useState(false);

    const linksInLast9 = ledger.slice(0, 9).filter((entry) => entry.withLink).length;
    const linkAllowed = linksInLast9 === 0;

    const openWork = (q: KinQ) => {
        setWork(q);
        setDraft('');
        setGenNote('');
        setWithLink(false);
        setDraftCopied(false);
        setWorkBody({ loading: true, text: '' });
        fetchKinQuestion(q.link).then((res) => {
            // 전문을 못 받으면 요약이라도 — 없는 본문을 지어내지 않는다.
            setWorkBody({ loading: false, text: (res.ok && res.data?.body) || q.summary || '' });
        });
    };

    const generate = async () => {
        if (!work || generating) return;
        setGenerating(true);
        setGenNote('');
        const result = await bridgeKinAnswer({
            title: work.title,
            body: workBody.text,
            withLink: withLink && linkAllowed,
            blogUrl: blogUrl.trim(),
        });
        setGenerating(false);
        if (!result) {
            setGenNote('LEWORD 앱이 꺼져 있습니다 — 앱을 켜면 내 구독으로 생성됩니다.');
            return;
        }
        setDraft(result.answer);
    };

    const copyDraft = () => {
        if (!draft.trim()) return;
        navigator.clipboard?.writeText(draft);
        setDraftCopied(true);
        window.setTimeout(() => setDraftCopied(false), 1600);
        // 복사 = 게시로 간주해 장부에 적는다 — 10:1 규칙의 눈금이다.
        const next = [{ at: new Date().toISOString(), withLink: withLink && linkAllowed }, ...ledger].slice(0, 50);
        setLedger(next);
        try { localStorage.setItem(LEDGER_KEY, JSON.stringify(next)); } catch { /* 계속 */ }
    };

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
                                    {q.askedAt && <> · {q.askedAt.slice(5)} 질문</>}
                                    {typeof q.perHour === 'number' && <> · <em className="lw-kg-up">시간당 +{formatCount(q.perHour)}</em></>}
                                    {q.keyword && (
                                        <> · 키워드 {onAnalyze
                                            ? <button type="button" className="lw-kg-kw" onClick={() => onAnalyze(q.keyword!)}>{q.keyword}</button>
                                            : q.keyword}</>
                                    )}
                                </small>
                            </div>
                            <span className="lw-kg-row-actions">
                                <button type="button" className="lw-kg-answer" onClick={() => openWork(q)}>답변 달기</button>
                                <button
                                    type="button"
                                    className="lw-kg-copy"
                                    onClick={() => {
                                        navigator.clipboard?.writeText(q.title);
                                        setCopied(q.link);
                                        window.setTimeout(() => setCopied(''), 1400);
                                    }}
                                >{copied === q.link ? '복사됨' : '질문 복사'}</button>
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            {/* 답변 작업대 — 질문 전문 + AI 초안 + 10:1 링크 장부. 게시는 사용자가 직접. */}
            {work && (
                <div className="lw-plan-backdrop" role="presentation" onClick={() => setWork(null)}>
                    <div
                        className="lw-plan-modal lw-kg-work"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${work.title} 답변 작업대`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="lw-plan-head">
                            <div>
                                <h3>{work.title}</h3>
                                <small className="lw-kg-work-meta">
                                    {typeof work.views === 'number' ? `조회 ${formatCount(work.views)}` : ''}
                                    {typeof work.answers === 'number' ? ` · 답변 ${work.answers}` : ''}
                                    {work.askedAt ? ` · ${work.askedAt.slice(5)} 질문` : ''}
                                </small>
                            </div>
                            <button type="button" className="lw-plan-close" onClick={() => setWork(null)} aria-label="닫기">✕</button>
                        </header>

                        <div className="lw-plan-body">
                            <section>
                                <strong>질문 전문</strong>
                                {workBody.loading
                                    ? <p className="lw-kg-work-body">질문 본문을 불러오는 중…</p>
                                    : <p className="lw-kg-work-body">{workBody.text || '본문 없이 제목만 있는 질문입니다.'}</p>}
                            </section>

                            <section>
                                <strong>답변 초안 — 깔끔·담백·정확, AI 티 0</strong>
                                <textarea
                                    className="lw-kg-draft"
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    placeholder="'AI 답변 생성'을 누르면 내 구독으로 초안이 만들어집니다. 고쳐 쓰셔도 됩니다."
                                    rows={8}
                                />
                                {genNote && <p className="lw-kg-work-note">{genNote} <a href="/download">⬇ 앱 받기</a></p>}
                                <div className="lw-kg-work-actions">
                                    <button type="button" className="lw-kg-generate" onClick={generate} disabled={generating}>
                                        {generating ? '생성 중… (내 구독)' : draft ? '다시 생성' : 'AI 답변 생성'}
                                    </button>
                                    <button type="button" onClick={copyDraft} disabled={!draft.trim()}>
                                        {draftCopied ? '복사됨 — 지식인에 붙여넣으세요' : '복사 → 지식인에 붙여넣기'}
                                    </button>
                                    <a href={work.link} target="_blank" rel="noreferrer" className="lw-kg-open">질문 열기</a>
                                    <label className={`lw-kg-linkbox${linkAllowed ? '' : ' off'}`} title={linkAllowed ? '' : '최근 9개 안에 링크 답변이 있습니다 — 링크 없이 더 달아야 합니다'}>
                                        <input
                                            type="checkbox"
                                            checked={withLink && linkAllowed}
                                            disabled={!linkAllowed}
                                            onChange={(event) => setWithLink(event.target.checked)}
                                        />
                                        내 글 링크 추가
                                    </label>
                                </div>
                                {withLink && linkAllowed && (
                                    <input
                                        type="text"
                                        className="lw-kg-bloginput"
                                        value={blogUrl}
                                        onChange={(event) => {
                                            setBlogUrl(event.target.value);
                                            try { localStorage.setItem(BLOG_URL_KEY, event.target.value); } catch { /* 계속 */ }
                                        }}
                                        placeholder="자동화로 발행한 글 주소 (답변 끝에 사람 말투로 붙습니다)"
                                    />
                                )}
                            </section>

                            <section className="lw-kg-ledger">
                                <strong>계정 보호 장부</strong>
                                <p>
                                    최근 답변 {Math.min(ledger.length, 10)}개 중 링크 <b>{ledger.slice(0, 10).filter((e) => e.withLink).length}개</b>
                                    {linkAllowed
                                        ? ' — 이번 답변에 링크를 넣을 수 있습니다'
                                        : ' — 링크 없이 더 달아야 다음 링크 차례입니다 (10개 중 1개 규칙)'}
                                </p>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default KinGoldenTab;
