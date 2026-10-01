/**
 * 내 블로그 오늘 쓸 글(플랜 C, 2026-09-30).
 *
 * 사이트 층(①) — 앱 없이 완결: 내 글 제목(공개 피드) ∩ 사이트 보드(추천키워드 32주제 · 황금 보드).
 * 앱 층(③) — 비밀번호 동기화가 켜진 계정이면 앱이 잰 판(홈판 탄 편수 · 오늘 홈판 같은 말 · 자리 실측 · 유입 시각 · 제목)이
 * 같은 표에 열로 붙는다. 비어 있으면 열 안에 '앱 실측 전' 한 마디만 — 안내판 구획은 없다.
 * 확률·예상치·임의 주제 분류는 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import { auditBlogPosts } from '../../lib/keywordApi';
import { keySyncSlot } from '../../lib/keySync';
import { boardKeywordCount, myBlogFitRows, myTitleWords, type GoldenRowInput, type MyBlogFitRow, type MyBlogPostTitle, type PicksTopicInput } from '../../lib/myBlogPublic';
import { pullMyBlogSync, pushMyBlogSync, type MyBlogSyncBundle, type TodayKeywordRow } from '../../lib/myBlogSync';
import { bridgeFailureNote } from '../../lib/bridge';
import { TabIntro } from './LewordShared';
import PostAutopsyPanel from './PostAutopsyPanel';

const TITLES_STORE_KEY = 'leaderspro.leword.myBlogTitles.v1';
const AUDIT_STORE_KEY = 'leaderspro.leword.blogAudit.v1';
const TITLE_LIMIT = 500;
const MUTED = { opacity: 0.65 } as const;
const CHIP = { display: 'inline-block', margin: '0 6px 6px 0' } as const;

type TitleStore = { url: string; checkedAt: string; posts: MyBlogPostTitle[] };

function loadTitles(): TitleStore | null {
    try {
        const parsed = JSON.parse(localStorage.getItem(TITLES_STORE_KEY) || 'null');
        return parsed && typeof parsed.url === 'string' && Array.isArray(parsed.posts) ? parsed : null;
    } catch { return null; }
}

/** 노출 추적 탭에 넣어 둔 주소를 그대로 쓴다 — 주소를 두 번 묻지 않는다. */
function auditUrl(): string {
    try {
        const parsed = JSON.parse(localStorage.getItem(AUDIT_STORE_KEY) || 'null');
        return parsed && typeof parsed.url === 'string' ? parsed.url : '';
    } catch { return ''; }
}

const num = (value: number | null) => (value === null ? '—' : value.toLocaleString('ko-KR'));
const compact = (value: string) => String(value || '').toLowerCase().replace(/\s+/g, '');
const kst = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const hourText = (hour: number) => `${hour}시`;

type Boards = { picks: PicksTopicInput[]; golden: GoldenRowInput[] };

async function loadBoards(): Promise<Boards> {
    const [picks, golden] = await Promise.all([
        fetch('/data/today-picks.json', { cache: 'no-cache' }).then((res) => (res.ok ? res.json() : null)).catch(() => null),
        fetch('/data/preemption-board.json', { cache: 'no-cache' }).then((res) => (res.ok ? res.json() : null)).catch(() => null),
    ]);
    return {
        picks: picks && Array.isArray(picks.topics) ? picks.topics : [],
        golden: golden && Array.isArray(golden.rows) ? golden.rows : [],
    };
}

/** 표 한 줄 — 공개 열 + (동기화 시) 앱 실측 열. 앱이 고른 말이 보드에 없으면 앱 행으로 덧붙는다. */
type TableRow = MyBlogFitRow & { app: TodayKeywordRow | null };

function mergeRows(fit: MyBlogFitRow[], plan: TodayKeywordRow[] | null): TableRow[] {
    if (!plan) return fit.map((row) => ({ ...row, app: null }));
    const byKey = new Map(plan.map((row) => [compact(row.keyword), row]));
    const merged: TableRow[] = fit.map((row) => ({ ...row, app: byKey.get(compact(row.keyword)) || null }));
    const seen = new Set(fit.map((row) => compact(row.keyword)));
    const extra: TableRow[] = plan
        .filter((row) => !seen.has(compact(row.keyword)))
        .map((row) => ({
            keyword: row.keyword, topic: row.topic, source: 'picks' as const, searchVolume: row.searchVolume, documentCount: null,
            openSlot: row.seat && row.seat.vacancy !== null ? row.seat.vacancy : null, tierLabel: null,
            matchedWords: [], wordCount: 0, myPosts: row.myPosts.count, sampleTitles: [], app: row,
        }));
    return [...merged, ...extra];
}

function AppCells({ row, synced }: { row: TableRow; synced: boolean }) {
    if (!synced) return <td colSpan={3} style={MUTED}>앱 실측 전</td>;
    if (!row.app) return <td colSpan={3} style={MUTED}>앱 판에 없음</td>;
    const { myPosts, homefeedTitleMatches, seat } = row.app;
    return (
        <>
            <td>{myPosts.homefeedHits}편{myPosts.unmeasured > 0 ? ` · 못 잰 ${myPosts.unmeasured}` : ''}</td>
            <td>{homefeedTitleMatches}건</td>
            <td>{seat ? `${seat.verdict}${seat.vacancy !== null ? ` · ${seat.vacancy}번째 빔` : ''} · 표본 ${seat.sampled}` : '—'}</td>
        </>
    );
}

function MyBlogTab() {
    const [url, setUrl] = useState(() => loadTitles()?.url || auditUrl());
    const [titles, setTitles] = useState<TitleStore | null>(() => loadTitles());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [boards, setBoards] = useState<Boards | null>(null);
    const [bundle, setBundle] = useState<MyBlogSyncBundle | null>(null);
    const [syncNote, setSyncNote] = useState('');
    const [syncing, setSyncing] = useState(false);
    const syncOn = keySyncSlot() !== null;

    useEffect(() => { loadBoards().then(setBoards); }, []);
    useEffect(() => {
        if (!syncOn) return;
        pullMyBlogSync().then((res) => { if (res.status === 'ok') setBundle(res.bundle); });
    }, [syncOn]);

    const readTitles = async () => {
        const trimmed = url.trim();
        if (!trimmed || loading) return;
        setLoading(true);
        setError('');
        const listed = await auditBlogPosts(trimmed, TITLE_LIMIT);
        setLoading(false);
        if (!listed.ok || !listed.data) { setError(listed.message || '글 목록을 읽지 못했습니다.'); return; }
        const next: TitleStore = {
            url: trimmed, checkedAt: new Date().toISOString(),
            posts: listed.data.posts.map((post) => ({ title: post.title, link: post.link, publishedAt: post.publishedAt })),
        };
        setTitles(next);
        try { localStorage.setItem(TITLES_STORE_KEY, JSON.stringify(next)); } catch { /* 저장 실패해도 화면은 산다 */ }
    };

    const syncFromApp = async () => {
        if (syncing) return;
        setSyncing(true);
        setSyncNote('');
        const res = await pushMyBlogSync();
        setSyncing(false);
        if (res.status === 'pushed') { setBundle(res.bundle); return; }
        if (res.status === 'no-sync') { setSyncNote('설정 탭의 비밀번호 동기화가 꺼져 있습니다.'); return; }
        if (res.status === 'empty') { setSyncNote('앱에 아직 잰 판이 없습니다 — 앱 내 블로그 화면에서 먼저 재 주세요.'); return; }
        if (res.status === 'too-large') { setSyncNote('앱 판이 너무 커서 올리지 못했습니다.'); return; }
        if (res.status === 'worker-failed') { setSyncNote('서버에 올리지 못했습니다 — 잠시 뒤 다시.'); return; }
        setSyncNote(bridgeFailureNote(res, '앱 실측 가져오기 실패'));
    };

    const posts = titles?.posts || [];
    const fit = useMemo(() => (boards ? myBlogFitRows(posts, boards.picks, boards.golden) : []), [boards, posts]);
    const words = useMemo(() => myTitleWords(posts), [posts]);
    const boardTotal = boards ? boardKeywordCount(boards.picks, boards.golden) : 0;
    const plan = bundle?.plan || null;
    const rows = useMemo(() => mergeRows(fit, plan ? plan.keywords : null), [fit, plan]);
    const synced = bundle !== null;

    return (
        <>
            <TabIntro
                title="내 블로그 오늘 쓸 글"
                desc="내 글 제목에 이미 든 말 가운데 사이트 보드가 검색량·문서수·빈자리를 잰 것만 모읍니다. 앱으로 잰 홈판 실적이 있으면 같은 표에 열로 붙습니다."
                source="내 블로그 공개 글 목록 + 추천키워드 32주제 · 황금 보드 실측 · 앱 실측(동기화 계정)"
            />

            <form className="lw-search" onSubmit={(event) => { event.preventDefault(); readTitles(); }}>
                <input
                    type="text"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="블로그 주소 (blog.naver.com/아이디)"
                    aria-label="내 블로그 주소"
                />
                <button type="submit" disabled={loading || !url.trim()}>{loading ? '읽는 중…' : '내 글 제목 읽기'}</button>
                <button type="button" className="lw-mini lw-mini-ghost" onClick={syncFromApp} disabled={syncing || !syncOn}
                    title={syncOn ? '이 PC 의 LEWORD 앱이 잰 판을 잠가 올립니다' : '설정 탭에서 비밀번호 동기화를 켜면 됩니다'}>
                    {syncing ? '가져오는 중…' : '앱 실측 가져오기'}
                </button>
            </form>

            {error && <div className="lw-note lw-note-error"><strong>{error}</strong></div>}
            {syncNote && <div className="lw-note lw-note-plain">{syncNote}</div>}

            <PostAutopsyPanel key={bundle?.syncedAt ?? 'none'} />

            {titles && (
                <p style={MUTED}>
                    {kst(titles.checkedAt)} 읽음 · 내 글 {posts.length}편 · 보드 {boardTotal}개 중 내가 다룬 말 {fit.length}개
                    {bundle ? ` · 앱 실측 ${bundle.plan ? kst(bundle.plan.builtAt) : kst(bundle.syncedAt)} 판` : ''}
                </p>
            )}

            {titles && rows.length > 0 && (
                <div className="lw-table-scroll">
                    <table className="lw-table">
                        <thead>
                            <tr>
                                <th>키워드</th><th>주제</th><th>검색량</th><th>문서수</th><th>빈자리</th><th>내 글</th>
                                <th>홈판 탄 편수</th><th>오늘 홈판 같은 말</th><th>자리 실측</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.keyword}>
                                    <td>
                                        <a href={`https://search.naver.com/search.naver?query=${encodeURIComponent(row.keyword)}`} target="_blank" rel="noreferrer">{row.keyword}</a>
                                        {row.source === 'golden' && row.tierLabel ? <small style={MUTED}> {row.tierLabel}</small> : null}
                                    </td>
                                    <td>{row.topic || '—'}</td>
                                    <td>{num(row.searchVolume)}</td>
                                    <td>{num(row.documentCount)}</td>
                                    <td>{row.openSlot !== null ? `${row.openSlot}번째` : '—'}</td>
                                    <td title={row.sampleTitles.join('\n')}>
                                        {row.myPosts}편{row.matchedWords.length > 0 ? ` · ${row.matchedWords.join(' ')}` : ''}
                                    </td>
                                    <AppCells row={row} synced={synced} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {titles && boards && fit.length === 0 && posts.length > 0 && (
                <div className="lw-note lw-note-plain">보드 {boardTotal}개 가운데 내 글 제목 어절과 절반 이상 겹치는 말이 없습니다.</div>
            )}

            {words.length > 0 && (
                <section className="lw-panel">
                    <div className="lw-panel-head"><strong>내 제목에 자주 든 말</strong> <span style={MUTED}>글 편수 기준 상위 {words.length}</span></div>
                    <p>{words.map((item) => <span key={item.word} className="lw-topic-tag" style={CHIP}>{item.word} <b>{item.posts}</b></span>)}</p>
                </section>
            )}

            {plan && (
                <section className="lw-panel">
                    <div className="lw-panel-head"><strong>내 유입 시각</strong> <span style={MUTED}>앱 실측 · {plan.day} 바탕</span></div>
                    <p>어제 {plan.time.myHoursYesterday.map((item) => `${hourText(item.hour)} ${item.value}`).join(' · ') || '—'}</p>
                    <p>30일 평균 {plan.time.myHoursMonth.map((item) => `${hourText(item.hour)} ${item.value}`).join(' · ') || '—'}</p>
                    {plan.time.topicHours && <p>{plan.time.topicHours.topic} 독자 {plan.time.topicHours.hours.map((item) => `${hourText(item.hour)} ${item.value}`).join(' · ')}</p>}
                    {plan.time.homefeedPublish && (
                        <p>홈판 탄 날 {plan.time.homefeedPublish.daysWithHomefeed}/{plan.time.homefeedPublish.daysMeasured}일 · 발행 시각 {plan.time.homefeedPublish.hours.map((item) => `${hourText(item.hour)} ${item.posts}편`).join(' · ') || '—'}</p>
                    )}
                    {plan.notes.length > 0 && <p style={MUTED}>{plan.notes.join(' / ')}</p>}
                </section>
            )}

            {plan && plan.titles.status === 'ok' && plan.titles.items.length > 0 && (
                <section className="lw-panel">
                    <div className="lw-panel-head"><strong>제목</strong> <span style={MUTED}>앱이 만든 것 · 교리 통과분만</span></div>
                    {plan.titles.items.map((item) => (
                        <div key={item.keyword}>
                            <strong>{item.keyword}</strong>
                            <ul>{item.titles.map((title) => <li key={title}>{title}</li>)}</ul>
                        </div>
                    ))}
                </section>
            )}
        </>
    );
}

export default MyBlogTab;
