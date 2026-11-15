/*
 * "오늘 쓸 3개" band at the top of the homefeed board (2026-11-15 owner: "easy for beginners, make them come back").
 * Three cards from the beginner order, each with [제목 복사] and [안내 보기]; a one-line follow-up for a topic the reader
 * marked yesterday; and the board's update time. No promise of results, no notifications.
 */
import { useState } from 'react';
import type { BenchmarkCandidate } from '../../../lib/homefeedBenchmarkModel.mjs';
import { channelCount } from './beginnerRank';
import type { FollowUp } from './writtenTopics';
import { kstDay } from './writtenTopics';

// Collection schedule read from the LEWORD repo: .github/workflows/homefeed-benchmarks.yml, cron '17 * * * *' (UTC).
// KST is a whole-hour offset, so the run starts at minute 17 of every KST hour too.
const RUN_MINUTE = 17;

function kstClock(value: number | string): string {
    const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(value));
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return `${hour}시 ${minute}분`;
}

export function updateLine(generatedAt: string | null, now: number): string {
    if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) return '';
    const day = kstDay(generatedAt) === kstDay(now) ? '' : `${Number(kstDay(generatedAt).slice(5, 7))}/${Number(kstDay(generatedAt).slice(8, 10))} `;
    const next = new Date(now);
    next.setUTCMinutes(RUN_MINUTE, 0, 0);
    const nextAt = next.getTime() > now ? next.getTime() : next.getTime() + 3_600_000;
    return `마지막 갱신 ${day}${kstClock(generatedAt)} · 다음 정기 수집 ${kstClock(nextAt)} 시작`;
}

function CopyTitle({ text }: { text: string }) {
    const [notice, setNotice] = useState('');
    const copy = async () => {
        try { await navigator.clipboard.writeText(text); setNotice('복사됨'); } catch { setNotice('제목을 선택해 복사해 주세요'); }
    };
    return <><button type="button" onClick={() => void copy()} aria-label={`제목 복사: ${text}`}>제목 복사</button><small role="status">{notice}</small></>;
}

// A home title that shares no word with the topic (e.g. another person's name from a wrongly grouped source) is not offered for copying:
// a beginner would paste a wrong name. Words are runs of 2+ Hangul/Latin/digit characters.
// Generic news/event words and plain numbers do not tie a title to a topic; only names and specific words do.
const GENERIC = new Set(['공연', '소식', '콘서트', '단독', '속보', '정보', '후기', '이유', '방법', '오늘', '최신', '정리', '총정리', '논란', '근황', '발표', '공개', '확정', '시작', '사람', '이번', '진짜', '결국']);
const wordsOf = (text: string) => new Set((text.match(/[가-힣A-Za-z0-9]{2,}/g) || []).map((w) => w.toLowerCase()).filter((w) => !/^\d+$/.test(w) && !GENERIC.has(w)));
function copyTitleOf(c: BenchmarkCandidate, topic: string): string {
    const words = wordsOf(`${topic} ${c.keyword || ''}`);
    return c.homeTitles.find((line) => [...wordsOf(line)].some((w) => words.has(w) || [...words].some((t) => t.length >= 2 && (w.startsWith(t) || t.startsWith(w))))) || topic;
}

function Pick({ c, rank, onShow }: { c: BenchmarkCandidate; rank: number; onShow: (id: string) => void }) {
    // The heading matches the card the reader lands on; the copy button copies the first home title when there is one.
    const topic = c.title || c.keyword;
    const title = copyTitleOf(c, topic);
    const facts = [`함께 쓴 채널 ${channelCount(c)}곳`, c.writingDirection ? '작성 안내 있음' : '', c.homeTitles.length ? `제목 ${c.homeTitles.length}개` : ''].filter(Boolean);
    return <li className="hft-pick">
        <span className="hft-rank" aria-hidden="true">{rank}</span>
        <div className="hft-body">
            <span className="hft-cat">{c.category}</span>
            <p className="hft-title">{topic}</p>
            {title !== topic && <p className="hft-copy-line">복사할 제목 「{title}」</p>}
            <p className="hft-facts">{facts.join(' · ')}</p>
            <div className="hft-actions"><CopyTitle text={title} /><button type="button" onClick={() => onShow(c.id)}>안내 보기</button></div>
        </div>
    </li>;
}

export default function HomefeedTodayPicks({ picks, followUp, generatedAt, now, onShow }: { picks: BenchmarkCandidate[]; followUp: FollowUp | null; generatedAt: string | null; now: number; onShow: (id: string) => void }) {
    if (!picks.length) return null;
    const update = updateLine(generatedAt, now);
    return <section className="hft" aria-label="오늘 쓸 3개">
        <style>{STYLES}</style>
        <div className="hft-head"><h3>오늘 쓸 3개</h3>{update && <p>{update}</p>}</div>
        {followUp && <div className="hft-follow"><b>{followUp.dayLabel} 쓴 소재 이어 쓰기</b><span title={`${followUp.dayLabel} 쓴 글: ${followUp.entry.title}`}>{followUp.card.homeTitles[0] || followUp.card.title}</span><button type="button" onClick={() => onShow(followUp.card.id)}>안내 보기</button></div>}
        <ol className="hft-list">{picks.map((c, i) => <Pick key={c.id} c={c} rank={i + 1} onShow={onShow} />)}</ol>
    </section>;
}

const STYLES = `
.hft{margin:12px 0 16px;padding:20px;border:1px solid var(--lw-line);border-radius:18px;background:var(--lw-surface);box-shadow:var(--lw-shadow-sm)}
.hft-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
.hft-head h3{margin:0;font-size:20px;line-height:1.4;font-weight:600;color:var(--lw-text)}
.hft-head p{font-size:13px;color:var(--lw-text-muted);font-variant-numeric:tabular-nums}
.hft-follow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:12px;padding:8px 12px;border:1px solid var(--lw-accent-line);border-radius:14px;background:var(--lw-accent-soft)}
.hft-follow b{font-size:15px;font-weight:600;color:var(--lw-text)}
.hft-follow span{flex:1;min-width:0;font-size:15px;color:var(--lw-text-secondary);overflow-wrap:anywhere}
.hft-list{list-style:none;margin:12px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.hft-pick{display:flex;gap:12px;padding:16px;border:1px solid var(--lw-line);border-radius:14px;background:var(--lw-raised)}
.hft-rank{flex:none;width:28px;height:28px;display:grid;place-items:center;border-radius:999px;background:var(--lw-surface);border:1px solid var(--lw-line);font-size:15px;font-weight:600;color:var(--lw-accent-ink);font-variant-numeric:tabular-nums}
.hft-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.hft-cat{font-size:13px;color:var(--lw-text-muted)}
.hft-title{font-size:15px;line-height:1.55;font-weight:600;color:var(--lw-text);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hft-copy-line{font-size:13px;line-height:1.5;color:var(--lw-text-secondary);overflow-wrap:anywhere}
.hft-facts{font-size:13px;color:var(--lw-text-muted)}
.hft-actions{margin-top:auto;padding-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.hft button{min-height:44px;padding:0 12px;border:1px solid var(--lw-line);border-radius:10px;background:var(--lw-surface);color:var(--lw-text);font-size:15px;transition:border-color var(--lw-fast) var(--lw-ease),background-color var(--lw-fast) var(--lw-ease)}
.hft button:hover{border-color:var(--lw-line-strong);background:var(--lw-raised)}
.hft-actions small{font-size:13px;color:var(--lw-accent-ink)}.hft-actions small:empty{display:none}
@media(max-width:900px){.hft-list{grid-template-columns:1fr}}
@media(max-width:640px){.hft{padding:16px}.hft-follow span{flex-basis:100%}}
@media(prefers-reduced-motion:reduce){.hft button{transition:none}}
`;
