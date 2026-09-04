import { useEffect, useMemo, useState } from 'react';
import { TopicFilter } from './BoardFilters';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { TabIntro } from './LewordShared';
import { naverSearchUrl } from './preemptionMeta';
import DemandChartModal, { pickChartSeries } from './DemandChartModal';
import PreemptionCard from './PreemptionCard';
import PreemptionPlan from './PreemptionPlan';
import IssueFlowBrief from './IssueFlowBrief';
import RealtimeStrip from './RealtimeStrip';
import { useMindmap } from './useMindmap';
import {
    compactKey, fetchIssueBoard, rowsOfIssue,
    type IssueBoard, type IssueBoardRow, type IssueBrief, type IssueLane, type IssueVerdict,
} from '../../lib/issueFlow';

/**
 * 실검 틈새키워드 — 좌측 메뉴의 독립 탭(사장님 설계 2026-09-02).
 *
 * 황금키워드보드와 같은 방식이다: 사장님 CI 가 하루 3회(07·13·19시 KST)
 * 실시간 이슈를 돌려 정적 JSON 을 발행하고, 여기서는 읽기만 한다.
 * 방문자마다 돌리지 않으므로 키도, 서버 AI 도 없다.
 *
 * 카드는 황금키워드 카드 그 자체다(사장님 지시 2026-09-03: "황금키워드랑 똑같이
 * 버튼이랑 연관키워드 등등 그래프도 똑같이 전부"). 회차가 황금 보강기(enrich-board)를
 * 그대로 돌려 제목·서브·실측 풀·지식인·30일 추세를 붙이고, 화면은 PreemptionCard 를
 * 같이 쓴다. 지표 줄만 다르다 — 이슈 행은 SERP 를 안 쟀으니 광고수·빈자리 대신 정면 글.
 *
 * 두 범주는 섞지 않는다(사장님 결정 A, 정의 강화 2026-09-03 "황금키워드만 적으면
 * 상위노출이 될 수도 있지만 더욱 확률 높고 트래픽을 몰고 올 수 있는 키워드가 틈새키워드"):
 *   틈새     = 세 실측을 다 통과한 행만 — 트래픽(검색광고 검색량 300+, 상승 중이면 100+)
 *              · 수요(데이터랩 최근 7일 + 문서수 ≤ 3,000) · 자리(블로그탭 상위 10 에 정면글 0건)
 *   선점 후보 = 자리는 비었는데 트래픽 증거가 아직 없음 — 문서수 ≤ 300 에 수요 미포착
 *              (no-demand), 또는 수요·자리는 잡혔는데 검색량이 없음(demand-no-volume)
 *   대기     = 트래픽·수요는 통과했는데 자리를 아직 못 잼(회차당 12건 상한) — 싣지 않고 건수만
 * 세 번째 판 '이슈 흐름'은 이슈 단위의 추론 계층이다 — 왜 뜨나·몰린 말·다음 물결.
 * 수치는 전부 실측이다. 추정 검색량은 발행기가 null 로 내보내고, 화면은 '—' 로 적는다.
 */

type View = IssueVerdict | 'flow';

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

const VIEWS: { id: View; label: string; hint: string }[] = [
    { id: 'niche', label: '틈새', hint: '세 실측을 다 통과한 것만 — 검색량 300+(상승 중이면 100+) · 데이터랩 최근 7일 수요와 문서수 3,000 이하 · 블로그탭 상위 10에 정면글 0건. 황금보다 좁고, 쓰면 트래픽이 온다' },
    { id: 'preemption', label: '선점 후보', hint: '자리는 비었는데 트래픽 증거는 아직 없음 — 문서수 300 이하에 수요 미포착이거나, 수요는 잡혔는데 검색량이 없음. 이슈가 커지면 먼저 있는 글이 먹는다' },
    { id: 'flow', label: '이슈 흐름', hint: '이슈마다 왜 뜨나(헤드라인 검증) · 사람들이 이미 치는 말(실측) · 다음에 몰릴 검색어(에이전트 추론) — 선점할 말을 고르는 판' },
];

const LANE_LABEL: Record<IssueLane, string> = { realtime: '실검', tech: 'IT·AI', policy: '정책' };

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

/** 이슈 흐름 앵커 id — 카드의 '이슈 ·' 태그가 여기로 뛴다. */
const flowAnchor = (issue: string) => `issue-flow-${compactKey(issue).replace(/[^\w가-힣]/g, '')}`;

function IssueNicheTab({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [board, setBoard] = useState<IssueBoard | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [view, setView] = useState<View>('niche');
    const [lane, setLane] = useState('전체');
    const [copied, setCopied] = useState('');
    const [openPlan, setOpenPlan] = useState('');
    const [chartKeyword, setChartKeyword] = useState('');
    const [jumpTo, setJumpTo] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [nowMs] = useState(() => Date.now());
    const { mindmap, openMindmap } = useMindmap();

    useEffect(() => {
        let alive = true;
        let lastStamp = '';
        const load = () => {
            fetchIssueBoard().then((data) => {
                if (!alive) return;
                if (!data) { if (!lastStamp) setStatus('error'); return; }
                // 같은 판이면 화면을 안 건드린다 — 스크롤이 튀지 않게.
                const stamp = String(data.publishedAt || '');
                if (stamp && stamp === lastStamp) return;
                lastStamp = stamp;
                setBoard(data);
                setStatus(data.rows.length > 0 || data.issues.length > 0 ? 'ready' : 'empty');
            });
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

    // 카드 태그 → 이슈 흐름으로 뛴다. 판이 바뀌어 그려진 뒤에 스크롤해야 한다.
    useEffect(() => {
        if (!jumpTo || view !== 'flow') return;
        const el = document.getElementById(jumpTo);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setJumpTo('');
    }, [jumpTo, view]);

    const verdictRows = useMemo(
        () => (view === 'flow' ? [] : (board?.rows || []).filter((row) => row.verdict === view)),
        [board, view],
    );

    /** 이슈 흐름 판의 재료 — 왜·몰린 말·다음 물결 중 하나라도 있는 이슈만. */
    const briefs = useMemo<IssueBrief[]>(
        () => (board?.issues || []).filter((issue) => issue.why || issue.concentrated.length > 0 || issue.nextWave.length > 0),
        [board],
    );
    /** 흐름 판이 실제로 있는 이슈 — 이월 행의 이슈가 이번 회차 묶음에서 빠졌으면 뛸 곳이 없다. */
    const briefKeys = useMemo(() => new Set(briefs.map((issue) => compactKey(issue.issue))), [briefs]);

    /** 실제로 행(또는 이슈)이 있는 공급원만 칩으로 낸다. */
    const lanes = useMemo<[string, number][]>(() => {
        const counts = new Map<string, number>();
        const items: Array<{ lane: IssueLane }> = view === 'flow' ? briefs : verdictRows;
        for (const item of items) {
            const label = LANE_LABEL[item.lane] || item.lane;
            counts.set(label, (counts.get(label) || 0) + 1);
        }
        return [...counts.entries()];
    }, [verdictRows, briefs, view]);

    const inLane = (item: { lane: IssueLane }) => lane === '전체' || (LANE_LABEL[item.lane] || item.lane) === lane;

    const rows = useMemo(() => {
        const list = verdictRows.filter(inLane);
        if (unlocked) return list;
        // 무료 3건은 발행본이 하루 동안 고정한 이름이다 — 위로 올려 블러 사이에 흩어지지 않게 한다.
        const freeNames = freeNamesOf(board);
        if (freeNames.length === 0) return list;
        return [...list.filter((row) => freeNames.includes(row.keyword)), ...list.filter((row) => !freeNames.includes(row.keyword))];
    }, [verdictRows, lane, unlocked, board]);

    const flowItems = useMemo(() => briefs.filter(inLane), [briefs, lane]);

    // 무료 3건 키워드가 속한 이슈는 다음 물결까지 연다 — 카드 3건을 그냥 보여 주면서
    // 그 이슈의 흐름만 잠그면 '왜 이 카드인가'가 안 보인다. 나머지 이슈는 잠근다.
    const freeIssueKeys = useMemo(() => {
        const freeNames = new Set(freeNamesOf(board));
        return new Set((board?.rows || []).filter((row) => freeNames.has(row.keyword)).map((row) => compactKey(row.issue)));
    }, [board]);
    const isFlowLocked = (issue: IssueBrief) => !unlocked && !freeIssueKeys.has(compactKey(issue.issue));
    const lockedWaveCount = flowItems.reduce((sum, issue) => sum + (isFlowLocked(issue) ? issue.nextWave.length : 0), 0);

    const planRow = useMemo(() => rows.find((row) => row.keyword === openPlan) || null, [rows, openPlan]);

    /** 실시간 줄에서 "판정 있음"을 가르려고 쓴다 — 발행본에 이미 있는 키워드. */
    const measuredKeySet = useMemo(
        () => new Set((board?.rows || []).map((row) => compactKey(row.keyword))),
        [board],
    );
    const publishedLabel = fmtTime(board?.publishedAt);
    const measured = board?.measured;
    const current = VIEWS.find((item) => item.id === view);

    /** 카드 머리 배지 — 이슈명(흐름 판이 있으면 뛴다)·자리 실측·실측 수요·상승·급상승·레인·이월. */
    const headTags = (row: IssueBoardRow) => (
        <>
            <span className="lw-trend-tag">
                {briefKeys.has(compactKey(row.issue)) ? (
                    <button
                        type="button"
                        className="lw-issue-jump"
                        title="이 이슈의 흐름(왜 뜨나 · 다음 물결) 보기"
                        onClick={() => { setView('flow'); setJumpTo(flowAnchor(row.issue)); }}
                    >이슈 · {row.issue} ›</button>
                ) : (
                    <>이슈 · {row.issue}</>
                )}
            </span>
            {/*
              * 자리 실측 배지 — 블로그탭 상위 10 을 실제로 받아 정면글이 0건이었다는 뜻.
              * 이게 틈새를 황금과 가르는 세 번째 게이트다. 툴팁에 잰 시각과 상위 제목을 단다.
              */}
            {row.serp?.verdict === 'WINNABLE' && (
                <span
                    className="lw-tier-tag tier-d"
                    title={`블로그탭 상위 ${row.serp.sampledTitles}개 중 정면글 ${row.serp.exactTitleHits}건 · 부분 ${row.serp.partialTitleHits}건 (${fmtTime(row.serp.measuredAt)} 잼)`}
                >상위 10 정면글 0건 — 자리 있음</span>
            )}
            {row.preemptionKind === 'demand-no-volume' && (
                <span className="lw-intent-tag" title="데이터랩 수요와 자리는 잡혔지만 검색광고 검색량이 없다 — 트래픽은 아직 증명 안 됨">수요 잡힘 · 검색량 미확인</span>
            )}
            {row.hasLiveDemand && <span className="lw-tier-tag tier-a">실측 수요 ▲</span>}
            {row.demandStatus === 'rising' && <span className="lw-intent-tag">최근 7일 상승</span>}
            {row.isHot && <span className="lw-warn-tag">급상승 이슈</span>}
            {row.lane !== 'realtime' && <span className="lw-trend-tag">{LANE_LABEL[row.lane]}</span>}
            {row.carried && <span className="lw-trend-tag" title={row.measuredAt}>{agoLabel(row.measuredAt, nowMs)}</span>}
        </>
    );

    return (
        <>
            <TabIntro
                title="실검 틈새키워드"
                desc="실시간 검색어·IT 이슈를 쪼개 세 가지를 실측합니다 — 트래픽(검색광고 검색량), 수요(데이터랩 최근 7일 · 블로그 문서수), 자리(네이버 블로그탭 상위 10 정면글). 셋을 다 통과한 것만 '틈새'로 싣습니다. 황금키워드보다 좁지만, 쓰면 상위 노출 확률이 높고 트래픽이 옵니다. 카드는 황금키워드와 같은 보강(제목·서브키워드·실측 풀·지식인·30일 추세)을 거치고, 추정치는 '—' 로 비워 둡니다."
                source={`실시간 이슈 실측 회차${publishedLabel ? ` · ${publishedLabel} 발행` : ''} · ${board?.schedule || '매일 07·13·19시(KST) 갱신'}`}
            />

            {/*
              * 살아 있는 줄 — 아래 카드는 하루 3회 실측 판정이라 최대 8시간 낡는다.
              * 목록만 5분마다 따로 받아 "지금 뭐가 뜨는지"를 먼저 보여 준다.
              */}
            <RealtimeStrip measuredKeys={measuredKeySet} />

            <div className="lw-segment lw-segment-wrap" role="group" aria-label="판정">
                {VIEWS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={view === item.id ? 'on' : ''}
                        onClick={() => { setView(item.id); setLane('전체'); }}
                    >
                        {item.label}{' '}
                        <em>{item.id === 'flow' ? briefs.length : (board?.rows || []).filter((row) => row.verdict === item.id).length}</em>
                    </button>
                ))}
            </div>
            <p className="lw-write-hint">
                {current?.hint}
                {measured && typeof measured.candidates === 'number' && measured.candidates > 0 && (
                    <>
                        {' '}· 이번 회차 이슈 {measured.issues ?? '—'}개 → 후보 {measured.candidates}개 실측 → 틈새 {measured.niche ?? 0} · 선점 후보 {measured.preemption ?? 0}
                        {/* 자리 대기 = 트래픽·수요는 통과했는데 블로그탭을 아직 못 잼(회차당 12건). 못 잰 건 싣지 않는다 — 건수만 밝힌다. */}
                        {typeof measured.pending === 'number' && measured.pending > 0 && (
                            <> · 자리 대기 {measured.pending}<i title="트래픽·수요는 통과했지만 블로그탭 상위 10 을 아직 못 잰 행 — 다음 회차에 잰다. 못 잰 것은 싣지 않습니다"> (다음 회차 실측)</i></>
                        )}
                    </>
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
                <div className="lw-note">이번 회차에는 세 실측(검색량 300+ · 데이터랩 최근 7일 수요와 문서수 3,000 이하 · 블로그탭 상위 10 정면글 0건)을 다 통과한 키워드가 없습니다. 다음 회차는 {board?.schedule || '07·13·19시(KST)'} 입니다.</div>
            )}

            {status === 'ready' && board && (
                <>
                    {lanes.length > 1 && (
                        <TopicFilter value={lane} onChange={setLane} topics={lanes} total={view === 'flow' ? briefs.length : verdictRows.length} />
                    )}

                    {view === 'flow' ? (
                        <>
                            {flowItems.length === 0 && (
                                <div className="lw-note">이번 회차에 검증된 이슈 흐름이 없습니다. 다음 회차를 기다려 주세요.</div>
                            )}
                            {lockedWaveCount > 0 && (
                                <LicenseGate
                                    onUnlock={() => setUnlocked(true)}
                                    remaining={lockedWaveCount}
                                    freeRows={FREE_ISSUE_ROWS}
                                    boardLabel="실검 틈새키워드"
                                />
                            )}
                            <div className="lw-issue-flow-list">
                                {flowItems.map((issue) => (
                                    <IssueFlowBrief
                                        key={issue.issue}
                                        anchorId={flowAnchor(issue.issue)}
                                        brief={issue}
                                        rows={rowsOfIssue(board, issue)}
                                        locked={isFlowLocked(issue)}
                                        onAnalyze={onAnalyze}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            {rows.length === 0 && (
                                <div className="lw-note">
                                    이번 회차의 {current?.label} 판정은 0건입니다.
                                    {view === 'niche' && typeof measured?.pending === 'number' && measured.pending > 0
                                        ? ` 트래픽·수요를 통과한 ${measured.pending}건이 자리 실측을 기다리고 있습니다 — 다음 회차에 블로그탭을 재고 통과분만 싣습니다.`
                                        : ' 다른 범주를 열어 보세요.'}
                                </div>
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
                                        <PreemptionCard
                                            key={`${row.issue}-${row.keyword}`}
                                            row={row}
                                            rank={index + 1}
                                            variant="issue"
                                            headTags={headTags(row)}
                                            locked={locked}
                                            copied={copied === row.keyword}
                                            onCopy={() => {
                                                navigator.clipboard?.writeText(row.keyword);
                                                setCopied(row.keyword);
                                                window.setTimeout(() => setCopied(''), 1400);
                                            }}
                                            planOpen={openPlan === row.keyword}
                                            onTogglePlan={() => setOpenPlan(openPlan === row.keyword ? '' : row.keyword)}
                                            onOpenChart={() => setChartKeyword(row.keyword)}
                                            mindmap={mindmap[row.keyword]}
                                            onMindmap={() => openMindmap(row)}
                                            onAnalyze={onAnalyze}
                                        />
                                    );
                                })}
                            </div>

                            {(() => {
                                const chartRow = rows.find((row) => row.keyword === chartKeyword);
                                const chart = chartRow ? pickChartSeries(chartRow) : null;
                                return chartRow && chart ? (
                                    <DemandChartModal
                                        keyword={chartRow.keyword}
                                        ranges={chart.ranges}
                                        asOf={chartRow.measuredAt.slice(0, 10)}
                                        onClose={() => setChartKeyword('')}
                                    />
                                ) : null;
                            })()}

                            {planRow && (
                                <PreemptionPlan
                                    row={planRow}
                                    onClose={() => setOpenPlan('')}
                                    onAnalyze={(keyword) => onAnalyze?.(keyword)}
                                    searchUrl={naverSearchUrl(planRow.keyword)}
                                />
                            )}
                        </>
                    )}
                </>
            )}
        </>
    );
}

export default IssueNicheTab;
