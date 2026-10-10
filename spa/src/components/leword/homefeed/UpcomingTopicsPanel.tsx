import { useEffect, useMemo, useState } from 'react';
import { normalizeUpcoming, upcomingView, whenLabel, type UpcomingBoard, type UpcomingCard, type UpcomingWatch } from '../../../lib/upcomingTopicsModel.mjs';

/*
 * 미리 써 둘 소재(2026-10-11 사장님 "지금 홈판도 미리 쓰면 뜰 소재가 있으면 — A매치 우루과이전에 처음 나온 김민수 선수 글이 그날만 43만").
 * 경기 일정 · 기사 속 예정에서 '처음' 신호가 붙은 사람을 짚고, 기사 인용 · 블로그 문서 수 · 검색량(잰 사실)만 보여 준다.
 * 사람은 블로그 문서가 적은 순 — 먼저 쓰면 그 이름의 첫 글이 된다.
 */
const num = (n: number | null) => (n === null ? '미측정' : n.toLocaleString('ko-KR'));

function Copy({ text, label = '복사' }: { text: string; label?: string }) {
  const [done, setDone] = useState('');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone('복사됨'); } catch { setDone('선택해 복사해 주세요'); } };
  return <span className="hfu-copy"><button type="button" onClick={() => void copy()}>{label}</button><small role="status">{done}</small></span>;
}

function Watch({ w }: { w: UpcomingWatch }) {
  const [open, setOpen] = useState(false);
  const titles = open ? w.homeTitles : w.homeTitles.slice(0, 3);
  return <li className="hfu-watch">
   <div className="hfu-watch-head"><strong>{w.name}</strong><span className="hfu-signal">{w.signal}</span><Copy text={w.name} label="이름 복사"/></div>
   <p className="hfu-metrics">블로그 문서 <b>{num(w.documentCount)}</b>개 · 월 검색량 <b>{num(w.searchVolume)}</b>{w.documentCount !== null && w.documentCount < 1000 && <em> · 아직 글이 적어 먼저 쓰면 첫 글이 됩니다</em>}</p>
   <blockquote>{w.quote} {w.url && <a href={w.url} target="_blank" rel="noopener noreferrer">기사 ↗</a>}</blockquote>
   {w.angles.length > 0 && <div className="hfu-angles"><span>미리 써 둘 글</span><ul>{w.angles.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
   {w.publishAt && <p className="hfu-when"><span>올릴 때</span> {w.publishAt}</p>}
   {w.suggestions.length > 0 && <p className="hfu-suggest"><span>자동완성</span> {w.suggestions.join(' · ')}</p>}
   {w.homeTitles.length > 0 && <div className="hfu-titles"><div className="hfu-titles-head"><span>홈판 제목 {w.homeTitles.length}개</span><Copy text={w.homeTitles.join('\n')} label="전체 복사"/></div>
    {titles.map((t, i) => <div key={i} className="hfu-title"><p>{t}</p><Copy text={t}/></div>)}
    {w.homeTitles.length > 3 && <button type="button" className="hfu-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? '접기' : `나머지 ${w.homeTitles.length - 3}개 더 보기`}</button>}
   </div>}
  </li>;
}

function EventCard({ c, now }: { c: UpcomingCard; now: number }) {
  return <article className="hfu-card">
   <div className="hfu-card-top"><span className="hfu-when-badge">{whenLabel(c, now)}</span><span className="hfu-league">{c.league || (c.kind === 'schedule' ? '기사 속 예정' : '경기')}</span><span className="hfu-articles">관련 기사 {c.articleCount}건</span></div>
   <h3>{c.title}</h3>
   <ul className="hfu-watch-list">{c.watch.map((w) => <Watch key={w.name} w={w}/>)}</ul>
   {c.articles.length > 0 && <details className="hfu-sources"><summary>근거 기사 {c.articles.length}곳</summary><ul>{c.articles.map((a, i) => <li key={i}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.title} ↗</a></li>)}</ul></details>}
  </article>;
}

export default function UpcomingTopicsPanel() {
  const [board, setBoard] = useState<UpcomingBoard | null>(null);
  const [limit, setLimit] = useState(6);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
   const controller = new AbortController();
   fetch('/data/upcoming-topics.json', { cache: 'no-store', signal: controller.signal })
    .then((r) => (r.ok ? r.json() : null)).then((raw) => setBoard(normalizeUpcoming(raw))).catch(() => { /* 판이 없으면 칸을 그리지 않는다 */ });
   const timer = window.setInterval(() => setNow(Date.now()), 60_000);
   return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  const cards = useMemo(() => upcomingView(board, now), [board, now]);
  if (!cards.length) return null;
  return <section className="hfu-panel" aria-label="미리 써 둘 소재">
   <header><div><span className="hfb-eyebrow">PREWRITE RADAR</span><h3>미리 써 둘 소재 <small>앞으로 {board?.windowDays ?? 7}일</small></h3>
    <p>경기 · 방송 일정 기사에서 첫 발탁 · 데뷔 · 복귀 · 첫 방송처럼 <b>처음</b> 주목받는 사람을 짚었습니다. 블로그 문서가 적은 사람부터 — 미리 써 두고 그 순간에 올리세요.</p></div></header>
   <div className="hfu-list">{cards.slice(0, limit).map((c) => <EventCard key={c.id} c={c} now={now}/>)}</div>
   {cards.length > limit && <button type="button" className="hfb-more" onClick={() => setLimit((n) => n + 6)}>소재 더 보기 · {limit}/{cards.length}</button>}
   <p className="hfb-caption">사람 · 신호는 기사 문장에 그대로 있는 것만 실었습니다. 문서 수 · 검색량은 수집 시각의 실측입니다.</p>
  </section>;
}
