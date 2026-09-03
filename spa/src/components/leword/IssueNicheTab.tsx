import { useEffect, useMemo, useState } from 'react';
import { formatCount } from '../../lib/keywordApi';
import { TopicFilter } from './BoardFilters';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { TabIntro } from './LewordShared';
import { naverSearchUrl } from './preemptionMeta';

/**
 * 실검 틈새키워드 — 좌측 메뉴의 독립 탭(사장님 설계 2026-09-02).
 *
 * 황금키워드보드와 같은 방식이다: 사장님 CI 가 하루 3회(07·13·19시 KST)
 * 실시간 이슈를 돌려 정적 JSON 을 발행하고, 여기서는 읽기만 한다.
 * 방문자마다 돌리지 않으므로 키도, 서버 AI 도 없다.
 *
 * 두 범주는 섞지 않는다(사장님 결정 A):
 *   틈새     = 데이터랩에 최근 7일 수요가 실측되고 문서수 ≤ 3,000 — 지금 쓰면 자리가 있다
 *   선점 후보 = 문서수 ≤ 300 인데 수요는 아직 안 잡힘 — 터지면 먼저 있는 글이 먹는다
 * 수치는 전부 실측이다. 추정 검색량은 발행기가 null 로 내보내고, 화면은 '—' 로 적는다.
 */

type Verdict = 'niche' | 'preemption';
type Lane = 'realtime' | 'tech' | 'policy';

type IssueRow = {
    keyword: string;
    issue: string;
    lane: Lane;
    issueType: string;
    isDerived: boolean;
    verdict: Verdict;
    documentCount: number | null;
    documentCountMeasured: boolean;
    searchVolume: number | null;
    hasLiveDemand: boolean;
    demandStatus: string;
    demandRatio: number | null;
    issueStatus: string;
    isHot: boolean;
    frontalDocCount: number | null;
    freshFrontalCount: number | null;
    reasons: string[];
    measuredAt: string;
    carried?: boolean;
};

type IssueBoard = {
    publishedAt?: string;
    schedule?: string;
    measured?: { issues?: number; candidates?: number; niche?: number; preemption?: number };
    freeSample?: { day: string; keywords: string[] };
    rows: IssueRow[];
};

const BOARD_URL = '/data/issue-niche-board.json';

/*
 * 비로그인 무료 건수 — 황금키워드보드(FREE_BOARD_ROWS 5)와 다르게 **3건**이다
 * (사장님 사양 2026-09-03 "틈새키워드도 하루 3개만"). 발행기 DEFAULT_FREE_ROWS 와
 * 같은 수다. 발행본 표본이 이보다 길어도(옛 5건 표본이 그날 안엔 남는다) 화면이
 * 앞 3건으로 자른다 — 어느 쪽이 먼저 배포되든 3건 넘게 열리지 않는다.
 */
const FREE_ISSUE_ROWS = 3;

/** 발행본이 하루 동안 고정한 무료 이름. 잘라서 쓴다(위 주석). */
function freeNamesOf(board: IssueBoard | null | undefined): string[] {
    return (board?.freeSample?.keywords || []).slice(0, FREE_ISSUE_ROWS);
}

const VERDICTS: { id: Verdict; label: string; hint: string }[] = [
    { id: 'niche', label: '틈새', hint: '데이터랩에 최근 7일 수요가 실측됐고 문서수 3,000 이하 — 지금 쓰면 자리가 있다' },
    { id: 'preemption', label: '선점 후보', hint: '문서수 300 이하인데 수요는 아직 안 잡힘 — 이슈가 커지면 먼저 있는 글이 먹는다' },
];

const LANE_LABEL: Record<Lane, string> = { realtime: '실검', tech: 'IT·AI', policy: '정책' };

const fmtTime = (iso?: string) => (iso
    ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '');

/** 이월 행에 "언제 잰 값인지"를 붙인다 — 실시간 이슈는 하루면 자리가 닫힌다. */
function agoLabel(iso: string, nowMs: number): string {
    const ms = nowMs - (Date.parse(iso) || nowMs);
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 1) return '방금 잼';
    if (hours < 24) return `${hours}시간 전 잼`;
    return `${Math.floor(hours / 24)}일 전 잼`;
}

function IssueNicheTab({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [board, setBoard] = useState<IssueBoard | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [verdict, setVerdict] = useState<Verdict>('niche');
    const [lane, setLane] = useState('전체');
    const [copied, setCopied] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [nowMs] = useState(() => Date.now());

    useEffect(() => {
        let alive = true;
        let lastStamp = '';
        const load = () => {
            fetch(BOARD_URL, { cache: 'no-store' })
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error('no board'))))
                .then((data) => {
                    if (!alive) return;
                    // 같은 판이면 화면을 안 건드린다 — 스크롤이 튀지 않게.
                    const stamp = String(data?.publishedAt || '');
                    if (stamp && stamp === lastStamp) return;
                    lastStamp = stamp;
                    const rows: IssueRow[] = Array.isArray(data?.rows) ? data.rows : [];
                    setBoard({ ...data, rows });
                    setStatus(rows.length > 0 ? 'ready' : 'empty');
                })
                .catch(() => { if (alive && !lastStamp) setStatus('error'); });
        };
        load();
        // 하루 3회 회차 + 탭에 돌아온 순간 다시 읽는다 — 황금키워드보드와 같다.
        const interval = window.setInterval(load, 10 * 60_000);
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            alive = false;
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    const verdictRows = useMemo(() => (board?.rows || []).filter((row) => row.verdict === verdict), [board, verdict]);

    /** 실제로 행이 있는 공급원만 칩으로 낸다. */
    const lanes = useMemo<[string, number][]>(() => {
        const counts = new Map<string, number>();
        for (const row of verdictRows) {
            const label = LANE_LABEL[row.lane] || row.lane;
            counts.set(label, (counts.get(label) || 0) + 1);
        }
        return [...counts.entries()];
    }, [verdictRows]);

    const rows = useMemo(() => {
        const list = lane === '전체' ? verdictRows : verdictRows.filter((row) => (LANE_LABEL[row.lane] || row.lane) === lane);
        if (unlocked) return list;
        // 무료 3건은 발행본이 하루 동안 고정한 이름이다 — 위로 올려 블러 사이에 흩어지지 않게 한다.
        const freeNames = freeNamesOf(board);
        if (freeNames.length === 0) return list;
        return [...list.filter((row) => freeNames.includes(row.keyword)), ...list.filter((row) => !freeNames.includes(row.keyword))];
    }, [verdictRows, lane, unlocked, board]);

    const copy = (keyword: string) => {
        navigator.clipboard?.writeText(keyword);
        setCopied(keyword);
        window.setTimeout(() => setCopied(''), 1400);
    };

    const publishedLabel = fmtTime(board?.publishedAt);
    const measured = board?.measured;

    return (
        <>
            <TabIntro
                title="실검 틈새키워드"
                desc="실시간 검색어·IT 이슈를 카테고리 세부 키워드로 쪼개고, 데이터랩 최근 7일 수요와 블로그 문서수를 실측해 지금 쓰면 자리가 있는 것만 싣습니다. 검색량·문서수·수요는 전부 실측이고, 추정치는 '—' 로 비워 둡니다."
                source={`실시간 이슈 실측 회차${publishedLabel ? ` · ${publishedLabel} 발행` : ''} · ${board?.schedule || '매일 07·13·19시(KST) 갱신'}`}
            />

            <div className="lw-segment lw-segment-wrap" role="group" aria-label="판정">
                {VERDICTS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={verdict === item.id ? 'on' : ''}
                        onClick={() => { setVerdict(item.id); setLane('전체'); }}
                    >{item.label} <em>{(board?.rows || []).filter((row) => row.verdict === item.id).length}</em></button>
                ))}
            </div>
            <p className="lw-write-hint">
                {VERDICTS.find((item) => item.id === verdict)?.hint}
                {measured && typeof measured.candidates === 'number' && measured.candidates > 0 && (
                    <> · 이번 회차 이슈 {measured.issues ?? '—'}개 → 후보 {measured.candidates}개 실측 → 틈새 {measured.niche ?? 0} · 선점 후보 {measured.preemption ?? 0}</>
                )}
            </p>

            {status === 'loading' && <div className="lw-note">실측 보드를 불러오는 중입니다…</div>}
            {status === 'error' && (
                <div className="lw-note lw-note-error">
                    <strong>보드를 불러오지 못했습니다</strong>
                    <p>첫 회차가 아직 발행되지 않았거나 네트워크 문제입니다. 잠시 후 다시 열어 주세요.</p>
                </div>
            )}
            {status === 'empty' && (
                <div className="lw-note">이번 회차에는 기준(실측 수요 · 문서수 3,000 이하)을 만족한 키워드가 없습니다. 다음 회차는 {board?.schedule || '07·13·19시(KST)'} 입니다.</div>
            )}

            {status === 'ready' && board && (
                <>
                    {lanes.length > 1 && (
                        <TopicFilter value={lane} onChange={setLane} topics={lanes} total={verdictRows.length} />
                    )}

                    {rows.length === 0 && (
                        <div className="lw-note">이번 회차의 {VERDICTS.find((item) => item.id === verdict)?.label} 판정은 0건입니다. 다른 범주를 열어 보세요.</div>
                    )}

                    {!unlocked && rows.length > FREE_ISSUE_ROWS && (
                        <LicenseGate
                            onUnlock={() => setUnlocked(true)}
                            remaining={rows.length - FREE_ISSUE_ROWS}
                            freeRows={FREE_ISSUE_ROWS}
                            boardLabel="실검 틈새키워드"
                        />
                    )}

                    <div className="lw-board-list">
                        {rows.map((row, index) => {
                            const freeNames = freeNamesOf(board);
                            const locked = unlocked
                                ? false
                                : (freeNames.length > 0 ? !freeNames.includes(row.keyword) : index >= FREE_ISSUE_ROWS);
                            return (
                                <article key={`${row.issue}-${row.keyword}`} className={`lw-card lw-card-pre${locked ? ' locked' : ''}`}>
                                    <div className="lw-card-head">
                                        <div className="lw-card-tags">
                                            <span className="lw-trend-tag">이슈 · {row.issue}</span>
                                            {row.hasLiveDemand && <span className="lw-tier-tag tier-a">실측 수요 ▲</span>}
                                            {row.demandStatus === 'rising' && <span className="lw-intent-tag">최근 7일 상승</span>}
                                            {row.isHot && <span className="lw-warn-tag">급상승 이슈</span>}
                                            {row.lane !== 'realtime' && <span className="lw-trend-tag">{LANE_LABEL[row.lane]}</span>}
                                            {row.carried && <span className="lw-trend-tag" title={row.measuredAt}>{agoLabel(row.measuredAt, nowMs)}</span>}
                                        </div>
                                        <h3 className="lw-card-keyword">
                                            <span className="lw-rank">{index + 1}</span>
                                            {row.keyword}
                                            <button
                                                type="button"
                                                className="lw-copy-mini"
                                                title="키워드 복사"
                                                aria-label={`${row.keyword} 복사`}
                                                onClick={() => copy(row.keyword)}
                                            >{copied === row.keyword ? '복사됨' : '⧉'}</button>
                                        </h3>
                                        <ul className="lw-evidence">
                                            {row.reasons.map((text) => (
                                                <li key={text}><span aria-hidden="true">·</span>{text}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* 못 잰 값은 '—' 다. 0 으로 채우면 안 본 것이 '없음'이 된다. */}
                                    <div className="lw-card-metrics">
                                        <div><span>문서수</span><strong>{formatCount(row.documentCount)}</strong></div>
                                        <div><span>정면 글</span><strong>{typeof row.frontalDocCount === 'number' ? `${row.frontalDocCount}건` : '—'}</strong></div>
                                        <div><span>최근 정면</span><strong>{typeof row.freshFrontalCount === 'number' ? `${row.freshFrontalCount}건` : '—'}</strong></div>
                                        <div><span>검색량</span><strong>{formatCount(row.searchVolume)}</strong></div>
                                    </div>

                                    <div className="lw-card-actions">
                                        <a href={naverSearchUrl(row.keyword)} target="_blank" rel="noreferrer">
                                            네이버 검색결과<small>자리 확인</small>
                                        </a>
                                        <a
                                            href={`https://datalab.naver.com/keyword/trendSearch.naver?keyword=${encodeURIComponent(row.keyword)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                        >데이터랩 그래프</a>
                                        <button type="button" onClick={() => onAnalyze?.(row.keyword)}>
                                            LEWORD 키워드 분석
                                        </button>
                                    </div>

                                    {locked && (
                                        <div className="lw-lock" aria-hidden="true">
                                            <span>🔒</span>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </>
            )}
        </>
    );
}

export default IssueNicheTab;
