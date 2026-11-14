/**
 * 애드센스 카드 작성 보조(2026-10-20 사장님):
 *  - "상황을 해결해 주거나 지식인에서 문제점을 보고 그걸 해결해 주는 글" → 이 글이 해결할 문제 · 지식인에서 실제로 묻는 것
 *  - "행동을 유발하는 키워드를 같이 엮어서 제목에" → 행동 키워드 제목(복사)
 *  - "벤치마킹해서 보면 되는 곳을 같이" → 지금 네이버 블로그 탭 상위 글(누르면 워커가 읽어 옴) · 구글 · 다음 검색 결과 바로가기
 * 안내 칸은 앱 레포 작성 안내 작업(enrich-benchmark-guides.js --mode=adsense)이 싣는다. 없으면 그 칸을 그리지 않는다.
 */
import { useState } from 'react';
import { callWorkerRaw } from '../../../lib/keywordApi';
import type { AdsenseCard } from '../../../lib/adsenseBenchmarkModel.mjs';

const box: React.CSSProperties = { marginTop: 12, padding: '12px 12px', border: '1px solid var(--lw-line)', borderRadius: 10, background: 'var(--lw-surface)' };
const head: React.CSSProperties = { margin: '0 0 8px', fontSize: 13, fontWeight: 600, letterSpacing: '.2px' };
const smallBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 44, border: '1px solid var(--lw-line)', background: 'var(--lw-surface)', color: 'var(--lw-text)', borderRadius: 10, padding: '0 12px', fontSize: 13, cursor: 'pointer' };

function CopyButton({ text }: { text: string }) {
    const [done, setDone] = useState(false);
    const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1200); } catch { /* 선택해서 복사 */ } };
    return <button type="button" style={smallBtn} onClick={() => void copy()}>{done ? '복사됨' : '복사'}</button>;
}

/** 이 글이 해결할 문제 + 행동 키워드 제목. */
export function SolveBlock({ c }: { c: AdsenseCard }) {
    const solves = c.solves || [];
    const titles = c.actionTitles || [];
    if (!solves.length && !titles.length) return null;
    return (
        <div style={{ ...box, borderColor: 'var(--lw-line)', background: 'var(--lw-surface)' }}>
            {solves.length > 0 && <>
                <h4 style={{ ...head, color: 'var(--lw-positive)' }}>이 글이 해결할 문제</h4>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--lw-text)' }}>{solves.map((s) => <li key={s}>{s}</li>)}</ul>
            </>}
            {titles.length > 0 && <>
                <h4 style={{ ...head, color: 'var(--lw-accent-ink)', marginTop: solves.length ? 10 : 0 }}>행동 키워드를 엮은 제목</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                    {titles.map((t) => <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><p style={{ flex: 1, margin: 0, fontSize: 15, color: 'var(--lw-text)' }}>{t}</p><CopyButton text={t} /></div>)}
                </div>
            </>}
        </div>
    );
}

/** 지식인에서 실제로 묻는 것 — 질문 원문 링크 · 조회수(실측). */
export function KinBlock({ c }: { c: AdsenseCard }) {
    const qs = c.kinQuestions || [];
    if (!qs.length) return null;
    return (
        <div style={box}>
            <h4 style={{ ...head, color: 'var(--lw-text)' }}>지식인에서 실제로 묻는 것 <span style={{ fontWeight: 400, color: 'var(--lw-text-secondary)' }}>· 이 질문을 풀어 주는 글이 검색에 남습니다</span></h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {qs.map((q) => (
                    <li key={q.link} style={{ marginBottom: 3 }}>
                        <a href={q.link} target="_blank" rel="noopener noreferrer">{q.title}</a>
                        <span style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>{typeof q.views === 'number' ? ` · 조회 ${q.views.toLocaleString('ko-KR')}` : ''}{typeof q.answers === 'number' ? ` · 답변 ${q.answers}` : ''}{q.askedAt ? ` · ${q.askedAt}` : ''}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

interface TopPost { title: string; link: string }

/** 벤치마킹할 곳 — 지금 네이버 블로그 탭 상위 글(누를 때 읽어 옴) + 구글 · 다음 검색 결과 바로가기. */
export function BenchmarkBlock({ c }: { c: AdsenseCard }) {
    const query = c.metrics?.query || c.keyword;
    const [posts, setPosts] = useState<TopPost[] | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
    const load = async () => {
        setState('loading');
        const r = await callWorkerRaw('keyword-frontal', { keywords: query });
        const list = (r && typeof r === 'object' ? ((r as { posts?: Record<string, TopPost[]> }).posts || {})[query] : null) || [];
        if (list.length) { setPosts(list.slice(0, 5)); setState('idle'); } else setState('error');
    };
    const q = encodeURIComponent(query);
    return (
        <div style={box}>
            <h4 style={{ ...head, color: 'var(--lw-text-secondary)' }}>벤치마킹할 곳 <span style={{ fontWeight: 400, color: 'var(--lw-text-secondary)' }}>· 지금 「{query}」 상위에 있는 글</span></h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {!posts && <button type="button" style={smallBtn} disabled={state === 'loading'} onClick={() => void load()}>{state === 'loading' ? '읽는 중…' : '네이버 블로그 상위 5개 보기'}</button>}
                <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>구글 검색 결과</a>
                <a href={`https://search.daum.net/search?w=fusion&col=blog&q=${q}`} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}>다음 블로그 결과</a>
                {state === 'error' && <small style={{ color: 'var(--lw-accent-ink)' }}>상위 글을 읽지 못했습니다 — 잠시 뒤 다시 눌러 주세요</small>}
            </div>
            {posts && (
                <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13 }}>
                    {posts.map((p) => <li key={p.link} style={{ marginBottom: 2 }}><a href={p.link} target="_blank" rel="noopener noreferrer">{p.title}</a></li>)}
                </ol>
            )}
        </div>
    );
}

/** 그래프가 아직 없을 때 — 왜 없는지와 언제 붙는지(지어낸 선을 그리지 않는다). */
export function DemandPending({ c }: { c: AdsenseCard }) {
    if (c.demand) return null;
    const measured = Boolean(c.metrics?.query);
    return (
        <p style={{ margin: '2px 0 12px', fontSize: 13, color: 'var(--lw-text-secondary)' }}>
            {measured ? '검색 추이 그래프 준비 중 — 3시간마다 도는 회차가 데이터랩으로 재서 붙입니다.' : '대표 검색어를 아직 실측하지 않아 그래프가 없습니다 — 실측되면 다음 회차에 붙습니다.'}
        </p>
    );
}
