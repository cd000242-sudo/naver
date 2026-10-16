import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { filterSeasonalTopics, isPlanningPriority, koreaMonth, loadSeasonalBoard, nextMonth, paginateTopics, timingNotice, type SeasonalBoard, type SeasonalTopic } from './seasonalModel.mjs';

const colors = { ink: '#eef4fc', muted: '#a8b9cc', line: '#304157', teal: '#71e4d3', gold: '#ffda75' };
const button: CSSProperties = { border: `1px solid ${colors.line}`, borderRadius: 10, padding: '10px 14px', background: '#131e30', color: colors.ink, cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700, minHeight: 42 };
const input: CSSProperties = { ...button, background: '#0b1423', fontWeight: 400, minWidth: 0, maxWidth: '100%' };
const badge: CSSProperties = { padding: '4px 8px', borderRadius: 6, background: '#1b2d3d', color: colors.teal, fontSize: 12, fontWeight: 700 };
const monthLabel = (value: string) => new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' });

function TopicCard({ topic, currentMonth, onAnalyze }: { topic: SeasonalTopic; currentMonth: number; onAnalyze: (keyword: string) => void }) {
  const [copyStatus, setCopyStatus] = useState('');
  const priority = isPlanningPriority(topic, currentMonth);
  const copy = async () => {
    try { await navigator.clipboard.writeText(topic.keyword); setCopyStatus('키워드를 복사했습니다.'); }
    catch { setCopyStatus('복사하지 못했습니다. 키워드를 선택해 직접 복사해 주세요.'); }
  };
  return <article style={{ minWidth: 0, padding: 20, border: `1px solid ${priority ? '#53604a' : colors.line}`, borderRadius: 16, background: 'linear-gradient(135deg, #162438, #101a2b)', display: 'flex', flexDirection: 'column', gap: 15 }}>
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <span style={badge}>{topic.month}월 기획</span><span style={{ color: colors.muted, fontSize: 12 }}>{topic.category}</span>
      {priority && <span style={{ color: colors.gold, fontSize: 12, fontWeight: 700 }}>★ {topic.month === currentMonth ? '이번 달 확인' : '다음 달 준비'}</span>}
    </div>
    <div><h3 style={{ margin: '0 0 8px', fontSize: 21, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{topic.keyword}</h3>
      <p style={{ margin: 0, color: colors.muted, lineHeight: 1.65, fontSize: 13 }}><span style={{ color: colors.teal }}>준비 시점</span> · {topic.prep}</p></div>
    <div style={{ borderLeft: `3px solid ${colors.teal}`, padding: '3px 0 3px 12px' }}>
      <strong style={{ color: colors.teal, fontSize: 12 }}>이렇게 쓰세요</strong><p style={{ margin: '7px 0 0', lineHeight: 1.7, fontSize: 14 }}>{topic.angle}</p>
    </div>
    <p style={{ margin: 0, color: colors.muted, fontSize: 12, lineHeight: 1.65 }}><strong style={{ color: colors.gold }}>{topic.type}</strong> · {timingNotice(topic.type)}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, fontSize: 12, color: '#adbed1' }}>
      {['검색량', '문서량', '광고 수'].map(label => <span key={label} style={{ padding: '5px 8px', borderRadius: 6, background: '#0b1423' }}>{label} <strong style={{ fontWeight: 400, color: '#d0d9e5' }}>미측정</strong></span>)}
    </div>
    <details style={{ background: '#0c1727', border: `1px solid ${colors.line}`, borderRadius: 9, padding: '10px 12px' }}>
      <summary style={{ cursor: 'pointer', color: colors.teal, fontSize: 13, lineHeight: 1.6 }}>실제 자동완성 표현 {topic.suggestions.length}개 보기</summary>
      {topic.suggestions.length > 0 ? <>
        <p style={{ color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>검색 표현 수이며 검색량이 아닙니다. 표현을 누르면 키워드 분석으로 이동합니다.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{topic.suggestions.map(word => <button key={word} type="button" onClick={() => onAnalyze(word)} style={{ ...button, padding: '7px 9px', fontWeight: 400, textAlign: 'left', overflowWrap: 'anywhere', maxWidth: '100%' }} aria-label={`${word} 분석`}>{word} ↗</button>)}</div>
      </> : <p style={{ color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>수집된 자동완성 표현이 없습니다. 주제의 검색 수요는 분석에서 별도로 확인하세요.</p>}
      {topic.observedAt && <p style={{ color: colors.muted, fontSize: 11, marginBottom: 0 }}>네이버 자동완성 수집 · {monthLabel(topic.observedAt)}</p>}
    </details>
    <div style={{ marginTop: 'auto', paddingTop: 3 }}>
      <a href={topic.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.teal, fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 3, overflowWrap: 'anywhere' }}>{topic.sourceTitle}에서 확인 ↗</a>
      <div style={{ marginTop: 5, color: colors.muted, fontSize: 11 }}>{topic.sourceStatus}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={() => onAnalyze(topic.keyword)} style={{ ...button, color: '#072c2b', background: colors.teal, borderColor: colors.teal, flex: '1 1 auto' }} aria-label={`${topic.keyword} 검색량·경쟁 분석`}>검색량·경쟁 분석 ↗</button>
        <button type="button" onClick={() => void copy()} style={button} aria-label={`${topic.keyword} 복사`}>키워드 복사</button>
      </div>
      {copyStatus && <p role="status" style={{ color: colors.teal, fontSize: 12, margin: '9px 0 0' }}>{copyStatus}</p>}
    </div>
  </article>;
}

export default function SeasonalKeywordsBoard({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
  const currentMonth = koreaMonth();
  const [month, setMonth] = useState<number | 'all'>(currentMonth);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [moneyOnly, setMoneyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<SeasonalBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError('');
    void loadSeasonalBoard(controller.signal).then(value => { if (active) setBoard(value); }).catch(() => {
      if (active) setError('시즌 자료를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
    }).finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  const topics = board?.topics ?? [];
  const categories = useMemo(() => Array.from(new Set(topics.map(t => t.category))).sort((a, b) => a.localeCompare(b, 'ko')), [topics]);
  const filtered = useMemo(() => filterSeasonalTopics(topics, { month, category, query, moneyOnly }), [topics, month, category, query, moneyOnly]);
  const visible = paginateTopics(filtered, page);
  const chooseMonth = (value: number | 'all') => { setMonth(value); setPage(1); };
  const clearFilters = () => { setMonth('all'); setCategory('all'); setQuery(''); setMoneyOnly(false); setPage(1); };
  const monthButton = (value: number | 'all', label: string) => <button key={label} type="button" aria-pressed={month === value} onClick={() => chooseMonth(value)} style={{ ...button, background: month === value ? colors.teal : '#101b2c', color: month === value ? '#082d29' : colors.muted, borderColor: month === value ? colors.teal : colors.line }}>{label}</button>;

  return <section aria-label="시즌별 키워드 모음" style={{ color: colors.ink, minWidth: 0 }}>
    <header style={{ padding: '24px clamp(16px, 3vw, 30px)', borderRadius: 18, border: '1px solid #28565c', background: 'radial-gradient(ellipse at top right, #19454b 0, transparent 65%), linear-gradient(130deg, #142c38, #121c31)', marginBottom: 18 }}>
      <div style={{ color: colors.teal, fontSize: 12, fontWeight: 800, letterSpacing: 1.4 }}>SEASONAL KEYWORDS · 1—12월</div>
      <h2 style={{ fontSize: 'clamp(23px, 4vw, 32px)', margin: '12px 0', lineHeight: 1.25 }}>돌아오는 계절, <span style={{ color: colors.gold }}>미리 쓰는 기회.</span></h2>
      <p style={{ color: '#c6d7e4', fontSize: 14, margin: 0, lineHeight: 1.75 }}>세금·지원금부터 생활·여행까지. 시기에 맞는 주제를 고르고, 검색 수요를 확인한 뒤 글로 연결하세요.</p>
      {board && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 25px', marginTop: 20, color: '#b6cad8', fontSize: 12 }}>
        <span><strong style={{ fontSize: 23, color: colors.ink }}>{board.stats.topics.toLocaleString()}</strong> 월별 기획 주제</span>
        <span><strong style={{ fontSize: 23, color: colors.gold }}>{board.stats.moneyTopics.toLocaleString()}</strong> 세금·지원금·노무 주제</span>
        <span><strong style={{ fontSize: 23, color: colors.teal }}>{board.stats.autocompleteUnique.toLocaleString()}</strong> 수집된 자동완성 표현</span>
      </div>}
    </header>
    {loading ? <div role="status" style={{ padding: 32, textAlign: 'center', color: colors.teal }}>월별 시즌 자료를 불러오는 중입니다…</div> : error ? <div role="alert" style={{ padding: 24, border: `1px solid ${colors.line}`, borderRadius: 12 }}><p>{error}</p><button type="button" style={button} onClick={() => setAttempt(v => v + 1)}>다시 불러오기</button></div> : board && <>
      <div style={{ border: `1px solid ${colors.line}`, background: '#101a2b', borderRadius: 14, padding: 16, marginBottom: 18 }}>
        <div aria-label="빠른 월 선택" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{monthButton(currentMonth, `이번 달 · ${currentMonth}월`)}{monthButton(nextMonth(currentMonth), `다음 달 · ${nextMonth(currentMonth)}월`)}{monthButton('all', '연간 전체')}</div>
        <div aria-label="월별 선택" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{Array.from({ length: 12 }, (_, i) => monthButton(i + 1, `${i + 1}월`))}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end', marginTop: 15 }}>
          <label style={{ display: 'grid', gap: 6, color: colors.muted, fontSize: 12, flex: '1 1 160px', minWidth: 0 }}>분야 선택<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} style={{ ...input, colorScheme: 'dark' }}><option value="all">모든 분야</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label style={{ display: 'grid', gap: 6, color: colors.muted, fontSize: 12, flex: '3 1 230px', minWidth: 0 }}>키워드 검색<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="주제·자동완성·글 방향에서 찾기" style={input} /></label>
          <label style={{ fontSize: 13, color: colors.gold, cursor: 'pointer', minHeight: 42, display: 'flex', gap: 7, alignItems: 'center' }}><input type="checkbox" checked={moneyOnly} onChange={e => { setMoneyOnly(e.target.checked); setPage(1); }} style={{ accentColor: colors.teal, width: 17, height: 17 }} />세금·지원금·노무만</label>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, lineHeight: 1.8, margin: '0 0 14px' }}><span style={{ color: colors.gold }}>★ 이번 달·다음 달 우선 기획 후보</span> · 수익 등급이 아닙니다.<br />월은 기획 시기이며 검색량 최고점이 아닙니다. 검색량·문서량·광고 수는 아직 미측정입니다.</p>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{month === 'all' ? '연간 전체' : `${month}월 기획`} <span style={{ color: colors.teal }}>{filtered.length}개</span></h3>
        <span style={{ fontSize: 11, color: colors.muted }}>자료 검토 {monthLabel(board.updatedAt)} · 월이 다르면 같은 주제가 반복될 수 있습니다.</span>
      </div>
      {visible.items.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 14 }}>{visible.items.map(topic => <TopicCard key={topic.id} topic={topic} currentMonth={currentMonth} onAnalyze={onAnalyze} />)}</div> : <div style={{ padding: 32, textAlign: 'center', border: `1px dashed ${colors.line}`, borderRadius: 14 }}><h3>조건에 맞는 시즌 주제가 없습니다.</h3><p style={{ color: colors.muted, fontSize: 14 }}>다른 달이나 분야를 선택하거나 검색어를 줄여 보세요.</p><button type="button" style={button} onClick={clearFilters}>전체 주제 보기</button></div>}
      {visible.pages > 1 && <nav aria-label="시즌 키워드 페이지" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 22 }}>
        <button type="button" disabled={visible.page === 1} onClick={() => setPage(visible.page - 1)} style={{ ...button, opacity: visible.page === 1 ? 0.4 : 1 }}>← 이전</button>
        <span aria-live="polite" style={{ color: colors.muted, fontSize: 13 }}>{visible.page} / {visible.pages} 페이지 · 24개씩</span>
        <button type="button" disabled={visible.page === visible.pages} onClick={() => setPage(visible.page + 1)} style={{ ...button, opacity: visible.page === visible.pages ? 0.4 : 1 }}>다음 →</button>
      </nav>}
      <details style={{ marginTop: 24, padding: 16, borderRadius: 12, border: `1px solid ${colors.line}`, color: colors.muted, fontSize: 12, lineHeight: 1.8 }}>
        <summary style={{ cursor: 'pointer', color: colors.ink }}>자료 수집·검토 기준 보기</summary>
        <p>기존 {board.audit.originalTopics}개 주제를 검토하고 {board.audit.addedTopics}개를 보강했습니다. 과거 연도·중복·비정상 자동완성 표현 {board.audit.excludedSuggestions}건은 제외했습니다.</p>
        <ul style={{ paddingLeft: 20 }}>{board.audit.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        <p style={{ marginBottom: 0 }}>자동완성은 수집 당시 존재한 검색 표현입니다. 수요·반복 시즌성·애드센스 수익을 보장하지 않습니다. 신청·지급·사용 마감은 따로 확인하세요.</p>
      </details>
    </>}
  </section>;
}
