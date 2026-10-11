import { useEffect, useMemo, useState } from 'react';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { TabIntro } from './LewordShared';
import { formatKst, formatMinutes, judgeFreshness } from '../../lib/boardFreshness';
import { moneyTitle, won, type MoneyBid } from './moneyBid';
import { FREE_PICK_ROWS, pickCountText, pickFreshnessLabel, summarizePickTopic, visiblePickRows } from '../../lib/todayPicksModel';
import { archiveDays } from '../../lib/todayPicksArchive.mjs';

/**
 * 오늘의 네이버 추천키워드 — 사이드 메뉴에서 실검 틈새키워드와 키워드 분석 **사이의 서브탭**,
 * 그 안에서 **주제별 서브-서브 탭**(주제 칩을 눌러 한 주제씩 본다). 사장님 2026-09-08.
 *
 * 데이터는 leword-app CI(today-picks.yml, 하루 3회 06:30·13:30·19:30 KST)가 씨앗 창고에서 주제별 후보를 넓게 뽑아
 * 블로그 문서수를 오픈 API로 실측하고 주제별 30개를 목표로 정적 JSON으로 발행한다.
 * 황금비 충족·계절 씨앗·일반 후보를 구분하며, 최근 노출 이력이 있는 키워드는 재추천으로 표시한다.
 * 황금 안에서는 네이버 광고 3위 입찰가가 높은(돈 되는) 순이다 — 입찰가도 CI 가 잰 실측이다.
 * 여기서는 읽기만 한다. 수치는 전부 실측이고 황금비는 그 나눗셈이다. 자리(SERP)는 안 쟀다.
 *
 * 무료 건수는 실검 틈새와 같은 3건(주제당)이다.
 *
 * 머리말은 한 줄이다(사장님 2026-09-29 "위에 너무 설명이 많아서 지저분하거든 하나로 요약"). 회차·판 시각·
 * 전체/황금·새 추천/재추천을 한 줄에, 출처·갱신 시각·황금 기준은 출처 줄에. 늦고 있을 때만 한 줄 더 적는다
 * (2026-09-12 "업데이트 안 됐다고 사람들이 물어보잖아" — 그 약속은 지킨다).
 */
const ROUNDS = [{ hour: 6, minute: 30 }, { hour: 13, minute: 30 }, { hour: 19, minute: 30 }];
const SOURCE_LINE = '검색량·문서수·입찰가 모두 실측 · 황금 비율 = 월 검색량 ÷ 블로그 문서수 · 매일 06:30 / 13:30 / 19:30 KST 갱신 · 상위 노출·수익을 보장하지 않습니다';

interface PickRow {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    measuredAt?: string;
    ratio: number;
    depth: number | null;
    comp: string | null;
    source: string | null;
    /** 계절 씨앗 예외 — 이번 달·다음 달 피크라 황금비가 1 미만이어도 실린 행 */
    seasonPeakMonth?: number;
    /** 네이버 광고 3위 입찰가 실측(2026-09-24) — 옛 회차 행엔 없다. */
    money?: MoneyBid | null;
    freshness?: { status: 'new' | 'repeated'; lastShownAt?: string };
}

interface PickTopic {
    topic: string;
    candidates: number;
    measured: number;
    golden?: number;
    targetCount?: number;
    shortfall?: number;
    rows: PickRow[];
}

interface TodayPicks {
    builtAt: string;
    warehouseBuiltAt: string | null;
    round?: { id: string; label: string; scheduledAt: string };
    changes?: { added: number; changed: number; retained: number };
    novelty?: { windowDays: number; newCount: number; repeatedCount: number };
    perTopic: number;
    keep: number;
    minRatio?: number;
    topics: PickTopic[];
}

const num = (value: number) => value.toLocaleString('ko-KR');
const ratioText = (ratio: number) => (ratio >= 100 ? Math.round(ratio).toLocaleString('ko-KR') : ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2));
const SOURCE_LABEL: Record<string, string> = { hint: '힌트', biztp: '업종', month: '월', event: '시즌', section: '블로그섹션', shopping: '쇼핑', preemption: '황금 보드' };
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export interface PicksTopicMeta { topic: string; golden: number; rowCount: number }

export default function TodayPicksBoard({ onAnalyze, topic, onTopics, onTopicChange, nowMs }: {
    onAnalyze?: (keyword: string) => void;
    /** 시험용 — 회차가 늦었는지 가를 '지금'. 비우면 실제 시각. */
    nowMs?: number;
    /** 사이드 메뉴 하위 항목이 고른 주제 — 없으면 첫 주제 */
    topic?: string | null;
    /** 읽어 온 주제 목록과 전체·황금 수를 사이드 메뉴로 올려보낸다 */
    onTopics?: (topics: PicksTopicMeta[]) => void;
    /** 모바일에는 사이드 메뉴 하위 항목이 없다(햄버거 메뉴는 탭만) — 표 위 주제 칩이 이걸로 고른다(사장님 2026-09-09). */
    onTopicChange?: (topic: string) => void;
}) {
    const [data, setData] = useState<TodayPicks | null>(null);
    const [error, setError] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    /*
     * 날짜 탭(2026-10-11 사장님 "어제 꺼는 어떻게 보니?") — 판이 매일 새 키워드로 바뀌니(어제 실린 말 금지) 지난 판을 날짜별로 본다.
     * null = 오늘 판(/data/today-picks.json), 날짜 = 보관본(/data/today-picks-archive/날짜.json, 7일).
     */
    const [day, setDay] = useState<string | null>(null);
    const [archiveIndex, setArchiveIndex] = useState<unknown>(null);

    useEffect(() => {
        let alive = true;
        fetch('/data/today-picks-archive/index.json', { cache: 'no-cache' })
            .then((response) => (response.ok ? response.json() : null))
            .then((json) => { if (alive) setArchiveIndex(json); })
            .catch(() => { /* 보관함이 없으면 날짜 탭을 안 그린다 */ });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        let alive = true;
        setError('');
        fetch(day ? `/data/today-picks-archive/${day}.json` : '/data/today-picks.json', { cache: 'no-cache' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((json) => { if (alive) setData(json as TodayPicks); })
            .catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
        return () => { alive = false; };
    }, [day]);
    const pastDays = useMemo(() => archiveDays(archiveIndex, nowMs ?? Date.now()), [archiveIndex, nowMs]);
    const dayLabel = pastDays.find((item) => item.day === day)?.label ?? '';

    const minRatio = data?.minRatio ?? 1;
    const topics = useMemo(() => (data?.topics ?? []).filter((topic) => topic.rows.length > 0), [data]);
    const goldenOf = (topic: PickTopic) => summarizePickTopic(topic, minRatio).golden;
    const total = topics.reduce((sum, topic) => sum + topic.rows.length, 0);
    const golden = topics.reduce((sum, topic) => sum + goldenOf(topic), 0);
    const active = topics.find((item) => item.topic === topic) ?? topics[0] ?? null;
    const rows = active ? visiblePickRows(active.rows, unlocked) : [];
    const activeSummary = active ? summarizePickTopic(active, minRatio, data?.keep) : null;
    const shown = unlocked ? total : topics.reduce((sum, topic) => sum + Math.min(topic.rows.length, FREE_PICK_ROWS), 0);
    const summary = data
        ? [
            data.round ? `${data.round.label} 회차` : '',
            `${kst(data.builtAt)} 판`,
            `전체 ${num(total)}개 중 황금 ${num(golden)}개`,
            data.novelty ? `새 추천 ${num(data.novelty.newCount)} · 재추천 ${num(data.novelty.repeatedCount)}` : '',
            `주제별 ${data.keep ?? 30}개 목표`,
        ].filter(Boolean).join(' · ')
        : `주제별 30개 목표 · 황금 비율을 앞에 두고 추천`;
    const freshness = judgeFreshness(ROUNDS, data?.builtAt ?? null, nowMs ?? Date.now());

    useEffect(() => {
        if (onTopics && topics.length > 0) onTopics(topics.map((item) => ({ topic: item.topic, golden: goldenOf(item), rowCount: item.rows.length })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topics]);

    return (
        <section className="lw-picks lw-picks-tab" aria-labelledby="lw-picks-title">
            <h2 id="lw-picks-title" hidden>오늘의 네이버 추천키워드</h2>
            <TabIntro title="오늘의 네이버 추천키워드" desc={summary} source={SOURCE_LINE} />

            {pastDays.length > 0 && (
                <div className="lw-picks-topics" role="tablist" aria-label="날짜">
                    <button type="button" role="tab" aria-selected={!day} className={`lw-picks-topic-btn${!day ? ' is-active' : ''}`} onClick={() => setDay(null)}>오늘</button>
                    {pastDays.map((item) => (
                        <button key={item.day} type="button" role="tab" aria-selected={day === item.day} className={`lw-picks-topic-btn${day === item.day ? ' is-active' : ''}`} onClick={() => setDay(item.day)}>{item.label}</button>
                    ))}
                </div>
            )}
            {day && data && <p className="lw-note">{dayLabel} 판입니다 — 지난 날짜의 추천이라 지금 검색량 · 문서수와 다를 수 있습니다. 매일 판은 전날과 겹치지 않게 새 키워드로 바뀝니다.</p>}

            {!day && data && freshness.isLate && freshness.dueAt !== null && (
                <p className="lw-note lw-note-limit" aria-label="회차 지연 안내">
                    {formatKst(freshness.dueAt)} 회차가 예정보다 {formatMinutes(freshness.lateMinutes)} 늦고 있습니다 — 예약이 늦게 도는 날이 있어 자동으로 다시 돌립니다. 그동안은 위 판이 가장 최근 것입니다.
                </p>
            )}

            {error && <p className="lw-note lw-note-error">추천키워드를 못 읽었습니다 — {error}</p>}
            {!error && !data && <p className="lw-note">불러오는 중…</p>}

            {/* 모바일 전용 주제 칩 — PC 에서는 사이드 메뉴 하위 항목이 같은 역할이라 CSS 로 숨긴다. */}
            {onTopicChange && topics.length > 0 && (
                <div className="lw-picks-topics lw-picks-topics-mobile" role="tablist" aria-label="주제">
                    {topics.map((item) => (
                        <button
                            key={item.topic}
                            type="button"
                            role="tab"
                            aria-selected={active?.topic === item.topic}
                            className={`lw-picks-topic-btn${active?.topic === item.topic ? ' is-active' : ''}`}
                            onClick={() => onTopicChange(item.topic)}
                        >
                            {item.topic}<b>{item.rows.length}</b>
                        </button>
                    ))}
                </div>
            )}

            {active && (
                <div className="lw-picks-panel" role="tabpanel" aria-label={active.topic}>
                    <div className="lw-picks-panel-head">
                        <strong>{active.topic}</strong>
                        <span>{activeSummary && `${pickCountText(activeSummary)}${activeSummary.shortfall > 0 ? ` · 목표보다 ${activeSummary.shortfall}개 적습니다` : ''}`}</span>
                    </div>
                    <div className="lw-picks-scroll">
                        <table className="lw-picks-table">
                            <thead>
                                <tr>
                                    <th>키워드</th>
                                    <th className="n">월 검색량</th>
                                    <th className="n">블로그 문서수</th>
                                    <th className="n" title={`월 검색량 ÷ 블로그 문서수 — ${minRatio} 이상이면 황금 비율. 일반 후보는 이 기준에 미달합니다`}>황금비</th>
                                    <th className="n">광고</th>
                                    <th className="n" title="네이버 검색광고 실측 — 이 검색어 광고를 3위에 걸려면 클릭 한 번에 거는 값">광고 3위 입찰가</th>
                                    <th>출처</th>
                                    {onAnalyze && <th aria-label="분석" />}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.keyword}>
                                        <td>
                                            <a href={naverSearchUrl(row.keyword)} target="_blank" rel="noreferrer">{row.keyword}</a>
                                            {row.ratio >= minRatio && <span className="lw-picks-chip">황금 비율</span>}
                                            {row.money?.tier === 'high' && <span className="lw-picks-chip lw-picks-money">고단가</span>}
                                            {row.seasonPeakMonth && <span className="lw-picks-chip lw-picks-season">{row.seasonPeakMonth}월 시즌 앞</span>}
                                            {pickFreshnessLabel(row) && <span className="lw-picks-chip" title="최근 추천 이력에 포함된 키워드입니다">{pickFreshnessLabel(row)}</span>}
                                        </td>
                                        <td className="n">{num(row.searchVolume)}</td>
                                        <td className="n" title={row.measuredAt ? `문서수 실측: ${kst(row.measuredAt)}` : '문서수 실측 시각 미기록'}>{num(row.documentCount)}</td>
                                        <td className={`n${row.ratio >= minRatio ? ' lw-picks-gold' : ''}`}>{ratioText(row.ratio)}</td>
                                        <td className="n">{row.depth == null ? '—' : num(row.depth)}</td>
                                        <td
                                            className={`n${row.money?.tier === 'high' ? ' lw-picks-bid-high' : row.money?.tier === 'none' ? ' lw-picks-bid-none' : ''}`}
                                            title={row.money ? moneyTitle(row.money) : '이 회차엔 입찰가를 재지 않았습니다'}
                                        >{row.money ? won(row.money.value) : '—'}</td>
                                        <td className="lw-picks-src">{row.source ? (SOURCE_LABEL[row.source] ?? row.source) : '—'}</td>
                                        {onAnalyze && (
                                            <td>
                                                <button type="button" className="lw-picks-btn" onClick={() => onAnalyze(row.keyword)}>
                                                    분석
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!unlocked && active.rows.length > FREE_PICK_ROWS && (
                            <p className="lw-picks-more">{active.rows.length - FREE_PICK_ROWS}건 더 — 로그인하면 보입니다</p>
                        )}
                    </div>
                </div>
            )}

            {data && !unlocked && total > shown && (
                <LicenseGate
                    onUnlock={() => setUnlocked(true)}
                    remaining={total - shown}
                    freeRows={FREE_PICK_ROWS}
                    boardLabel="오늘의 네이버 추천키워드"
                />
            )}
        </section>
    );
}
