import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TabIntro } from '../LewordShared';
import { BRIDGE_OFFLINE_NOTE, BRIDGE_OUTDATED_NOTE } from '../../../lib/bridge';
import { hfCollect, hfSettings, hfStories, type HfStoriesResult } from '../../../lib/homefeedBridge';
import {
    CATEGORY_LABEL, DEFAULT_FILTERS, SORT_OPTIONS, STATUS_LABEL, WINDOW_LABEL,
    filterStories, formatTime, sortStories, sourceHealth, type HomefeedFilters,
} from '../../../lib/homefeedModel.mjs';
import HomefeedStyles from './HomefeedStyles';
import HomefeedCard from './HomefeedCard';
import HomefeedDetail from './HomefeedDetail';
import HomefeedLearning from './HomefeedLearning';
import HomefeedSettingsPanel from './HomefeedSettingsPanel';
import { failureOf } from './HomefeedParts';

/**
 * /leword?tab=homefeed — 홈판 신호(사장님 명령서 STORY RADAR v2.0, 2026-09-16).
 *
 * 실시간 이슈 → 새 사실 → 재미 근거 → 첫 카드 → 제목 → 대표이미지 · 썸네일 → 원고 → 성과학습.
 * 단위는 키워드가 아니라 스토리 후보다. 수집 · 판정은 이 PC 의 LEWORD 앱이 켜 둔 동안 10분마다 쌓은 스냅샷으로 하고,
 * 이 화면은 저장된 계산본을 읽어 그린다 — 목록을 그릴 때 AI 를 부르지 않는다.
 * 기존 실검 틈새 탭(이슈)은 건드리지 않는다.
 */

const FILTER_KEY = 'leaderspro.homefeed.filters.v1';

function loadFilters(): HomefeedFilters {
    try {
        const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
        return saved && typeof saved === 'object' ? { ...DEFAULT_FILTERS, ...saved } : { ...DEFAULT_FILTERS };
    } catch {
        return { ...DEFAULT_FILTERS };
    }
}

const STATUS_FILTERS: ReadonlyArray<[string, string]> = [
    ['active', '지금 · 이른 · 지켜보기'], ['NOW', STATUS_LABEL.NOW], ['EARLY', STATUS_LABEL.EARLY], ['WATCH', STATUS_LABEL.WATCH],
    ['LATE', STATUS_LABEL.LATE], ['DROP', STATUS_LABEL.DROP], ['all', '전체'],
];

const EVIDENCE_FILTERS: ReadonlyArray<['funGap' | 'noSearch' | 'payoff2' | 'visualReady', string]> = [
    ['funGap', '재미 근거 있음'], ['noSearch', '검색 없이 이해 통과'], ['payoff2', '정보층 2개 이상'], ['visualReady', '썸네일 준비됨'],
];

export default function HomefeedTab() {
    const [data, setData] = useState<HfStoriesResult | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'outdated' | 'error'>('loading');
    const [error, setError] = useState('');
    const [view, setView] = useState<'stories' | 'learning'>('stories');
    const [filters, setFilters] = useState<HomefeedFilters>(loadFilters);
    const [sort, setSort] = useState('window');
    const [openId, setOpenId] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [busy, setBusy] = useState<'' | 'collect' | 'toggle'>('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        const result = await hfStories();
        if (result.status === 'ok') {
            setData(result.result);
            setState('ready');
            setError('');
            return;
        }
        setState(result.status === 'offline' ? 'offline' : result.status === 'outdated' ? 'outdated' : 'error');
        setError(result.status === 'error' ? result.message : '');
    }, []);

    useEffect(() => {
        void load();
        // 앱이 10분마다 새 회차를 쌓는다 — 화면은 1분마다 계산본만 다시 읽는다(AI 호출 없음).
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
        return () => window.clearInterval(timer);
    }, [load]);

    useEffect(() => {
        try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* 기억하지 못해도 화면은 된다 */ }
    }, [filters]);

    const stories = useMemo(() => sortStories(filterStories(data?.stories ?? [], filters), sort), [data, filters, sort]);
    const health = useMemo(() => sourceHealth(data?.sources ?? []), [data]);
    const categories = useMemo(() => [...new Set((data?.stories ?? []).map((story) => story.category))], [data]);
    const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
    const closeDetail = useCallback(() => setOpenId(''), []);
    const closeSettings = useCallback(() => setSettingsOpen(false), []);
    const openSettings = useCallback(() => setSettingsOpen(true), []);

    const collectNow = async () => {
        setBusy('collect');
        setNotice('');
        const result = await hfCollect();
        setBusy('');
        if (result.status !== 'ok') {
            setNotice(failureOf(result, '수집 실패') ?? '');
            return;
        }
        setNotice(result.result.ok
            ? `수집 끝 — 이슈 ${result.result.issues ?? 0}개 · 스토리 ${result.result.stories ?? 0}개`
            : result.result.error ?? '수집하지 못했습니다.');
        await load();
    };

    const toggleCollect = async () => {
        if (!data) return;
        setBusy('toggle');
        setNotice('');
        const result = await hfSettings({ enabled: !data.settings.enabled });
        setBusy('');
        if (result.status !== 'ok') {
            setNotice(failureOf(result, '설정 저장 실패') ?? '');
            return;
        }
        const next = result.result.settings;
        setNotice(next.enabled
            ? `수집을 켰습니다 — ${next.snapshotIntervalMinutes}분마다 쌓습니다${result.result.startedCollection ? ' · 첫 회차를 지금 돕니다' : ''}.`
            : '수집을 껐습니다.');
        await load();
    };

    return (
        <div className="lw-hf">
            <HomefeedStyles />
            <TabIntro
                title="홈판 신호"
                desc="실시간 이슈에서 지금 새로 나온 사실, 궁금해지는 이유(긴장 · 재미 근거), 첫 카드 · 제목 · 이미지로 멈추게 할 방법을 스토리 단위로 봅니다. 수치는 내 PC 의 LEWORD 앱이 잰 실측이고, 못 잰 값은 '미측정'으로 적습니다. 홈판 노출을 보장하거나 가능성을 수치로 말하지 않습니다."
                source="내 PC LEWORD 앱 수집 — 네이버 실시간 · 네이트 · 구글 · 다음 · 네이버 뉴스 검색 · 블로그 문서수 · 사이트 이슈 보드"
            />

            {state === 'loading' && <div className="lw-note">앱에서 스토리를 불러오는 중입니다…</div>}
            {state === 'offline' && (
                <div className="lw-note lw-note-setup">
                    <strong>LEWORD 앱이 꺼져 있습니다</strong>
                    <p>{BRIDGE_OFFLINE_NOTE} 홈판 신호는 앱이 켜져 있는 동안 실시간 이슈를 쌓아 판정합니다.</p>
                    <p><Link to="/download">LEWORD 다운로드</Link></p>
                </div>
            )}
            {state === 'outdated' && <div className="lw-note lw-note-setup"><strong>앱 업데이트가 필요합니다</strong><p>{BRIDGE_OUTDATED_NOTE}</p></div>}
            {state === 'error' && <div className="lw-note lw-note-error"><strong>불러오지 못했습니다</strong><p>{error}</p></div>}

            {state === 'ready' && data && (
                <>
                    <div className="lw-hf-status">
                        <div className="lw-hf-status-main">
                            <div className="lw-hf-status-line">
                                <span className={`lw-hf-state${data.runtime.running ? ' run' : data.settings.enabled ? ' on' : ''}`}>
                                    <i aria-hidden="true" />
                                    {data.runtime.running ? '지금 수집 중' : data.settings.enabled ? `수집 켜짐 · ${data.settings.snapshotIntervalMinutes}분마다` : '수집 꺼짐'}
                                </span>
                                <span>마지막 스냅샷 <b>{data.snapshotAt ? formatTime(data.snapshotAt) : '없음'}</b></span>
                                <span>판정에 쓴 회차 <b>{data.historySnapshots}</b> · 저장된 회차 <b>{data.storedSnapshots}</b></span>
                                {data.runtime.nextRunAt && <span>다음 수집 <b>{formatTime(data.runtime.nextRunAt)}</b></span>}
                                {data.runtime.lastError && <span className="lw-hf-error">최근 오류 · {data.runtime.lastError}</span>}
                            </div>
                            {health.rows.length > 0 && (
                                <div className="lw-hf-sources" aria-label="원천 상태">
                                    {health.rows.map((row) => (
                                        <span key={row.name} className={`lw-hf-source ${row.state}`} title={row.lastError ?? ''}>
                                            <i aria-hidden="true" />
                                            {row.label}{row.state === 'error' ? ` · 연속 실패 ${row.consecutiveFailures}회` : row.state === 'skipped' ? ' · 건너뜀' : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="lw-hf-counts">
                                {(['NOW', 'EARLY', 'WATCH'] as const).map((key) => (
                                    <span key={key} className="lw-hf-count">{STATUS_LABEL[key]}<b>{data.counts.status[key] ?? 0}</b></span>
                                ))}
                                <span className="lw-hf-count">창 {WINDOW_LABEL.OPEN}<b>{data.counts.window.OPEN ?? 0}</b></span>
                                <span className="lw-hf-count">창 {WINDOW_LABEL.OPENING}<b>{data.counts.window.OPENING ?? 0}</b></span>
                            </div>
                        </div>
                        <div className="lw-hf-status-actions">
                            <button type="button" className="lw-hf-btn" disabled={Boolean(busy) || data.runtime.running} onClick={collectNow}>
                                {busy === 'collect' ? '수집 중…' : '지금 수집'}
                            </button>
                            <button type="button" className={`lw-hf-btn${data.settings.enabled ? '' : ' primary'}`} disabled={Boolean(busy)} onClick={toggleCollect}>
                                {data.settings.enabled ? '수집 끄기' : '수집 켜기'}
                            </button>
                            <button type="button" className="lw-hf-btn" onClick={openSettings}>설정</button>
                        </div>
                    </div>

                    {notice && <div className="lw-note">{notice}</div>}
                    {!data.settings.enabled && data.stories.length === 0 && (
                        <div className="lw-note lw-note-setup">
                            <strong>수집을 켜야 판정이 시작됩니다</strong>
                            <p>
                                켜면 앱이 10분마다 실시간 이슈 · 뉴스 표본 · 블로그 문서수를 쌓습니다. 뉴스 검색 · 문서수는 내 네이버 API 키 쿼터를 씁니다(회차마다 이슈 수만큼).
                                새 사실 · 증가 속도 · 가속은 이력이 30~60분 쌓인 뒤부터 계산됩니다.
                            </p>
                        </div>
                    )}

                    <div className="lw-segment lw-segment-wrap" role="tablist" aria-label="홈판 신호 보기">
                        <button type="button" role="tab" aria-selected={view === 'stories'} className={view === 'stories' ? 'on' : ''} onClick={() => setView('stories')}>
                            스토리 신호 <em>{data.stories.length}</em>
                        </button>
                        <button type="button" role="tab" aria-selected={view === 'learning'} className={view === 'learning' ? 'on' : ''} onClick={() => setView('learning')}>
                            성과학습
                        </button>
                    </div>

                    {view === 'stories' && (
                        <>
                            <div className="lw-hf-filters">
                                <div className="lw-hf-filter-row" role="group" aria-label="상태 필터">
                                    {STATUS_FILTERS.map(([id, label]) => (
                                        <button key={id} type="button" className="lw-hf-toggle" aria-pressed={filters.status === id} onClick={() => setFilters({ ...filters, status: id })}>{label}</button>
                                    ))}
                                </div>
                                <div className="lw-hf-filter-row">
                                    <select className="lw-hf-select" aria-label="카테고리" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
                                        <option value="all">카테고리 전체</option>
                                        {categories.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category] ?? category}</option>)}
                                    </select>
                                    <select className="lw-hf-select" aria-label="창" value={filters.window} onChange={(event) => setFilters({ ...filters, window: event.target.value })}>
                                        <option value="all">창 전체</option>
                                        {Object.entries(WINDOW_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                                    </select>
                                    <select className="lw-hf-select" aria-label="처음 본 시각" value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value })}>
                                        <option value="all">기간 전체</option>
                                        <option value="60">1시간 안에 처음 봄</option>
                                        <option value="180">3시간 안에 처음 봄</option>
                                        <option value="360">6시간 안에 처음 봄</option>
                                    </select>
                                    <select className="lw-hf-select" aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value)}>
                                        {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                    </select>
                                    <input className="lw-hf-search" type="search" aria-label="검색어 · 기준어 찾기" placeholder="검색어 · 기준어 찾기" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
                                </div>
                                <div className="lw-hf-filter-row" role="group" aria-label="근거 필터">
                                    {EVIDENCE_FILTERS.map(([key, label]) => (
                                        <button key={key} type="button" className="lw-hf-toggle" aria-pressed={filters[key]} onClick={() => setFilters({ ...filters, [key]: !filters[key] })}>{label}</button>
                                    ))}
                                    {filtered && <button type="button" className="lw-hf-btn small" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>필터 초기화</button>}
                                </div>
                                {filters.period !== 'all' && <p className="lw-write-hint">기간 필터는 처음 본 시각이 확실한 이슈만 남깁니다 — 기록 시작 전부터 떠 있었을 수 있는 이슈는 뺍니다.</p>}
                            </div>

                            {data.stories.length > 0 && stories.length === 0 && <div className="lw-note">이 필터에 맞는 스토리가 없습니다. 필터를 풀어 보세요.</div>}
                            {data.stories.length === 0 && data.settings.enabled && <div className="lw-note">첫 회차를 기다리는 중입니다 — [지금 수집]을 누르면 바로 한 회차를 돕니다.</div>}

                            <div className="lw-hf-list">
                                {stories.map((story) => <HomefeedCard key={story.id} story={story} onOpen={() => setOpenId(story.id)} />)}
                            </div>
                        </>
                    )}

                    {view === 'learning' && <HomefeedLearning />}

                    {openId && (
                        <HomefeedDetail storyId={openId} imageProvider={data.settings.imageProvider} onClose={closeDetail} onChanged={load} onSettings={openSettings} />
                    )}
                    {settingsOpen && <HomefeedSettingsPanel onClose={closeSettings} onSaved={load} />}
                </>
            )}
        </div>
    );
}
