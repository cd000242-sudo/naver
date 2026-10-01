import { useEffect, useMemo, useState } from 'react';
import { autopsyPosts, type AutopsyRow, type AutopsyVerdict } from '../../lib/postAutopsy.mjs';
import { loadAdvisorDaily } from '../../lib/homefeedEvidenceLoad';
import type { AdvisorDailyView } from '../../lib/myBlogSync';

/*
 * 0명 글 부검(2026-10-01) — 사장님 "0명 본 글이 너무 많다, 하나하나 뜯어서 보고해 달라".
 * 재료는 사용자 본인 앱이 잰 사실(앱이 켜져 있으면 앱에서, 아니면 비밀번호로 잠근 동기화본).
 * 확인된 사실만 적는다 — "제목 때문"처럼 증명 못 하는 원인은 쓰지 않는다. 판정 규칙은 lib/postAutopsy.mjs.
 */
const MUTED = { opacity: 0.65 } as const;
const VERDICT_LABEL: Record<AutopsyVerdict, string> = {
    late: '같은 소재가 먼저 홈판에',
    outtitled: '같은 소재, 다른 글이 홈판에',
    'no-homefeed': '그날 홈판에 없던 소재',
    unknown: '그날 홈판 기록 없음',
    blocked: '네이버가 막은 글',
};
const VERDICT_ORDER: AutopsyVerdict[] = ['late', 'outtitled', 'no-homefeed', 'unknown', 'blocked'];

const kstTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '시각 미확인');
/** 'N시간 전'에서 온 어림 시각 — 분은 지어내지 않고 시까지만. */
const approxTime = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false })}쯤` : '시각 미확인');
const monthDay =(day: string) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day); return m ? `${Number(m[1])}/${Number(m[2])}` : day; };
const hoursText = (hours: number[]) => hours.map((h) => `${h}시`).join('·');
const leadText = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ''}` : `${minutes}분`);

function VerdictLine({ row }: { row: AutopsyRow }) {
    const m = row.match;
    if (m && row.verdict === 'late') {
        return <p>같은 소재가 {monthDay(m.day)} 홈판 {m.rank}위 — 그 글이 내 글보다 <b>{leadText(m.leadMinutes ?? 0)} 먼저</b> 나왔습니다. <a href={m.url} target="_blank" rel="noreferrer">{m.title} ↗</a></p>;
    }
    if (m) {
        const order = m.leadMinutes === null ? '발행 순서는 확인 못 함' : m.leadMinutes < 0 ? `내가 ${leadText(-m.leadMinutes)} 먼저 씀` : '거의 같은 시각';
        return (
            <div>
                <p>같은 소재가 {monthDay(m.day)} 홈판 {m.rank}위에 올랐습니다 ({order}). 두 글을 나란히 비교해 보세요.</p>
                <p style={{ margin: '4px 0 0 12px' }}>홈판 글: <a href={m.url} target="_blank" rel="noreferrer">{m.title} ↗</a></p>
                <p style={{ margin: '2px 0 0 12px' }}>내 글: {row.post.title}</p>
            </div>
        );
    }
    if (row.verdict === 'no-homefeed') {
        return (
            <div>
                <p>그날 홈판 상위 20에 같은 소재가 없었습니다. 그날 실제로 오른 글:</p>
                <ul style={{ margin: '4px 0 0 0' }}>{row.dayTop.map((r) => <li key={r.url}>{r.rank}위 <a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a></li>)}</ul>
            </div>
        );
    }
    if (row.verdict === 'blocked') return <p>네이버가 막은 글입니다 — 검색에도 홈판에도 나가지 않습니다.</p>;
    return <p style={MUTED}>그날 홈판 기록을 앱이 아직 못 모았습니다.</p>;
}

function ZeroPost({ row }: { row: AutopsyRow }) {
    return (
        <li className="lw-panel" style={{ listStyle: 'none', margin: '0 0 10px 0' }}>
            <div className="lw-panel-head">
                <strong><a href={row.post.url} target="_blank" rel="noreferrer">{row.post.title}</a></strong>
                <span style={MUTED}> {VERDICT_LABEL[row.verdict]}</span>
            </div>
            <p style={MUTED}>
                발행 {row.post.approxTime ? approxTime(row.post.publishedAt) : kstTime(row.post.publishedAt)}
                {row.hoursTracked !== null ? ` · 발행 뒤 ${row.hoursTracked}시간 동안 조회 0` : ' · 조회 0'}
            </p>
            <VerdictLine row={row} />
            {row.flags.map((flag) => (
                <p key={flag.kind} className="lw-note lw-note-plain" style={{ margin: '6px 0 0 0' }}>
                    {flag.kind === 'no-search'
                        ? '이 글은 검색 허용이 꺼져 있습니다 — 검색 유입은 처음부터 막혀 있습니다.'
                        : `내 독자가 가장 많은 시간(${hoursText(flag.peakHours)}) 밖인 ${flag.publishedHour}시에 발행했습니다.`}
                </p>
            ))}
        </li>
    );
}

export default function PostAutopsyPanel() {
    const [state, setState] = useState<{ from: 'app' | 'sync'; daily: AdvisorDailyView } | null | 'loading'>('loading');
    useEffect(() => { void loadAdvisorDaily().then(setState).catch(() => setState(null)); }, []);
    const daily = state === 'loading' ? null : state?.daily ?? null;
    const facts = daily?.autopsy ?? null;
    const result = useMemo(() => autopsyPosts(facts, { myHours: daily?.myHours ?? [] }), [facts, daily]);

    if (state === 'loading') return null;
    if (!daily) {
        return <div className="lw-note lw-note-plain"><strong>0명 글 부검</strong> — LEWORD 앱에서 네이버 로그인(어드바이저)을 해 두면, 조회 0명 글마다 그날 홈판과 맞대 어디서 엇갈렸는지 보여 드립니다. 앱을 켜 두거나 '앱 실측 가져오기'로 올려 주세요.</div>;
    }
    if (!facts) {
        return <div className="lw-note lw-note-plain"><strong>0명 글 부검</strong> — 앱을 최신 버전(v2.49.146 이상)으로 업데이트하면 표시됩니다.</div>;
    }
    const { summary } = result;
    return (
        <section className="lw-panel">
            <div className="lw-panel-head">
                <strong>0명 글 부검</strong>
                <span style={MUTED}> {monthDay(facts.from)}~{monthDay(facts.to)} · {state?.from === 'app' ? '이 PC 앱 실측' : '동기화본'}</span>
            </div>
            <p>
                최근 14일 내 글 {summary.posts}편 중 발행일부터 조회 기록이 다 있는 글 {summary.complete}편, 그중 <b>조회 0명 {summary.zero}편</b>
                {summary.zero > 0 ? ` — ${VERDICT_ORDER.filter((v) => summary.verdicts[v]).map((v) => `${VERDICT_LABEL[v]} ${summary.verdicts[v]}`).join(' · ')}` : ''}
            </p>
            {summary.incomplete > 0 && <p style={MUTED}>기록이 덜 찬 글 {summary.incomplete}편은 아직 판정하지 않았습니다 — 앱이 매일 새벽 기록을 채웁니다.</p>}
            {result.zero.length > 0 && <ul style={{ padding: 0, margin: '10px 0 0 0' }}>{result.zero.map((row) => <ZeroPost key={row.post.url} row={row} />)}</ul>}
            <p style={MUTED}>어드바이저 실측(조회 · 전체 홈판 상위 20)과 공개 글 화면의 발행 시각만으로 맞댄 결과입니다. 원인을 단정하지 않고 확인된 사실만 적습니다.</p>
        </section>
    );
}
