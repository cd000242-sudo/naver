/*
 * 미리 써 둘 소재(2026-10-11 사장님 "지금 홈판도 미리 쓰면 뜰 소재가 있으면 — A매치 우루과이전에 처음 나온 김민수 선수 글이 그날만 43만").
 * 판은 앱 레포 scripts/upcoming-topics.js 가 하루 두 번 싣는다(경기 일정 · 기사 속 예정 → '처음' 신호 사람 → 실측 → 홈판 제목).
 * 화면은 모양만 검사하고 그대로 그린다 — 잰 사실(기사 · 블로그 문서 수 · 검색량)만, 추정 숫자는 없다.
 */
const HOUR = 3_600_000;
const KST = 9 * HOUR;
const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v, n, max = 200) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const date = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const safeUrl = (v) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } };

function watchItem(raw = {}) {
  return {
    name: str(raw.name, 40), signal: str(raw.signal, 30), quote: str(raw.quote, 300), url: safeUrl(raw.url),
    angles: strs(raw.angles, 3, 120), publishAt: str(raw.publishAt, 60),
    searchVolume: num(raw.searchVolume), documentCount: num(raw.documentCount),
    suggestions: strs(raw.suggestions, 6, 60), homeTitles: strs(raw.homeTitles, 20, 120),
  };
}

export function normalizeUpcoming(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null;
  const cards = raw.cards.slice(0, 200).filter((c) => c && typeof c === 'object').map((c) => ({
    id: str(c.id, 120), kind: c.kind === 'schedule' ? 'schedule' : 'sports', league: str(c.league, 40), title: str(c.title, 200),
    startsAt: date(c.startsAt), dateOnly: c.dateOnly === true, articleCount: num(c.articleCount) ?? 0,
    articles: (Array.isArray(c.articles) ? c.articles : []).slice(0, 5).map((a) => ({ title: str(a?.title, 200), url: safeUrl(a?.url) })).filter((a) => a.title && a.url),
    watch: (Array.isArray(c.watch) ? c.watch : []).slice(0, 5).filter((w) => w && typeof w === 'object').map(watchItem).filter((w) => w.name && w.quote),
  })).filter((c) => c.id && c.title && c.startsAt && c.watch.length);
  return { generatedAt: date(raw.generatedAt), windowDays: num(raw.windowDays) ?? 7, cards };
}

/** 지난 사건은 뺀다(경기 = 시작 6시간 뒤, 날짜만 = 그날이 지나면). 날짜순, 사람은 블로그 문서가 적은 순(먼저 쓰면 첫 글). */
export function upcomingView(board, nowMs = Date.now()) {
  if (!board) return [];
  const docs = (w) => (w.documentCount === null ? Infinity : w.documentCount);
  return board.cards
    .filter((c) => { const at = Date.parse(c.startsAt); return c.dateOnly ? at + 24 * HOUR > nowMs : at + 6 * HOUR > nowMs; })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((c) => ({ ...c, watch: [...c.watch].sort((a, b) => docs(a) - docs(b)) }));
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** "오늘 19:00" · "내일 18:30" · "D-3 · 10/14(수) 20:00" (KST). 날짜만 있는 예정은 시각 없이. */
export function whenLabel(card, nowMs = Date.now()) {
  const at = new Date(Date.parse(card.startsAt) + KST);
  const today = Date.UTC(...ymd(new Date(nowMs + KST)));
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const diff = Math.round((day - today) / (24 * HOUR));
  const time = card.dateOnly ? '' : `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
  if (diff <= 0) return card.dateOnly ? '오늘' : `오늘 ${time}`;
  if (diff === 1) return card.dateOnly ? '내일' : `내일 ${time}`;
  const md = `${at.getUTCMonth() + 1}/${at.getUTCDate()}(${DOW[at.getUTCDay()]})`;
  return `D-${diff} · ${md}${time ? ` ${time}` : ''}`;
}
function ymd(d) { return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; }
