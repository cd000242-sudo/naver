/**
 * Pure core of the hourly "topic now" board (spa/public/data/topic-now.json).
 *
 * Why: the LDB extension recommends "keywords to write right now" per blog topic. The boards it read
 * were measured days or weeks ago (preemption board rows: median 8-11 days, max 57). The owner asked
 * for today's numbers, so a scheduled job re-measures a few strong candidates per topic every hour.
 *
 * This file has no I/O: it picks candidates from boards already in the repo, decides whether a run is
 * due, tracks the DataLab daily quota and shapes the output. Every number in the output comes from Naver.
 */

/** The 32 Naver blog topics, in the order today-picks.json uses. */
export const TOPIC_NAMES = Object.freeze([
  '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송',
  '일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
  '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
  'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문',
]);
export const PER_TOPIC = 5;
/** The refresh workflow fires every 15 minutes; this board is rebuilt at most once per hour. */
export const MIN_INTERVAL_MINUTES = 55;
/** Naver DataLab search trend allows 1,000 calls per day per app; stop well before that. */
export const DATALAB_DAILY_CAP = 900;
export const DATALAB_GROUPS_PER_CALL = 5;
/** Daily trend window: the 14 complete days ending yesterday (Korea time). */
export const TREND_DAYS = 14;
/** Preemption board seat tiers worth re-measuring (search-result vacancies), strongest first. */
const SEAT_TIERS = Object.freeze({ top3: 3, page1: 2, 'page1-weak': 2 });
const SEAT_FRESH_DAYS = 14;
const FACING_LIMIT = 2;
const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

const compact = value => String(value ?? '').replace(/\s+/g, '').toLowerCase();
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const text = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const ratioOf = (volume, docs) => (finite(volume) !== null && finite(docs) !== null && docs > 0 ? volume / docs : -1);

/** 'YYYY-MM-DD' in Korea time. */
export const kstDateKey = ms => new Date(ms + KST_MS).toISOString().slice(0, 10);

/** DataLab request window: TREND_DAYS complete days ending yesterday (Korea time). */
export function trendWindow(now) {
  return { startDate: kstDateKey(now - TREND_DAYS * DAY_MS), endDate: kstDateKey(now - DAY_MS) };
}

/** A run is due when there is no previous board or it was built MIN_INTERVAL_MINUTES or more ago. */
export function isDue(previous, now) {
  const built = Date.parse(previous && previous.builtAt);
  return !Number.isFinite(built) || now - built >= MIN_INTERVAL_MINUTES * 60_000;
}

/** DataLab calls already spent today (Korea date) according to the previous board. */
export function usedToday(previous, now) {
  const usage = previous && previous.usage;
  return usage && usage.date === kstDateKey(now) && finite(usage.datalabCalls) !== null ? usage.datalabCalls : 0;
}

/**
 * Up to perTopic candidates per topic, in this order:
 *   1. preemption board seats (top 3 / page 1 vacancy) measured within SEAT_FRESH_DAYS, strongest first
 *   2. today's topic briefs (timing NOW) whose top-10 has at most FACING_LIMIT head-on titles
 *   3. today's picks, highest search volume / document count first
 * Duplicates (spaces and case ignored) are kept once per topic. Inputs are not modified.
 */
export function pickCandidates({ picks, preemption, briefs } = {}, { now, perTopic = PER_TOPIC } = {}) {
  const buckets = new Map(TOPIC_NAMES.map(name => [name, []]));
  const add = (topic, keyword, source, extra = {}) => {
    const list = buckets.get(topic), clean = text(keyword);
    if (!list || !clean || list.some(row => compact(row.keyword) === compact(clean))) return;
    list.push({ keyword: clean, topic, source, ...extra });
  };
  const freshSeat = row => SEAT_TIERS[row.tier] && Number.isFinite(Date.parse(row.measuredAt)) && now - Date.parse(row.measuredAt) <= SEAT_FRESH_DAYS * DAY_MS;
  const seats = ((preemption && preemption.rows) || []).filter(freshSeat)
    .sort((a, b) => SEAT_TIERS[b.tier] - SEAT_TIERS[a.tier] || ratioOf(b.searchVolume, b.documentCount) - ratioOf(a.searchVolume, a.documentCount));
  for (const row of seats) add(row.topic, row.keyword, 'preemption', { tier: row.tier });
  for (const brief of (briefs && briefs.briefs) || []) {
    const facing = finite(brief.serpFacing);
    if (brief.timing === 'NOW' && facing !== null && facing <= FACING_LIMIT) add(brief.field, brief.coreKeyword, 'brief', { serpFacing: facing });
  }
  for (const group of (picks && picks.topics) || []) {
    const rows = [...(group.rows || [])].sort((a, b) => ratioOf(b.searchVolume, b.documentCount) - ratioOf(a.searchVolume, a.documentCount));
    for (const row of rows) add(group.topic, row.keyword, 'picks');
  }
  return TOPIC_NAMES.flatMap(name => buckets.get(name).slice(0, perTopic));
}

/** Split a list into chunks of `size`. */
export const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** One value per day of the window, in order. A day DataLab did not return stays null (never filled in). */
export function fillDays(series, { startDate, endDate }) {
  const byDay = new Map((series || []).map(point => [String(point.period).slice(0, 10), finite(point.ratio)]));
  const out = [];
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= Date.parse(`${endDate}T00:00:00Z`); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push(byDay.has(day) ? byDay.get(day) : null);
  }
  return out.some(value => value !== null) ? out : [];
}

/**
 * The published board. Rows keep only measured values; a value Naver did not return stays null.
 * measurements: { volumes: Map(compact → n), docs: Map(compact → n), trends: Map(compact → number[]) }
 */
export function buildBoard({ now, candidates, measurements, window, usage, status }) {
  const { volumes = new Map(), docs = new Map(), trends = new Map() } = measurements || {};
  const rows = candidates.map(candidate => {
    const key = compact(candidate.keyword);
    const points = trends.get(key);
    return {
      ...candidate,
      searchVolume: volumes.has(key) ? volumes.get(key) : null,
      documentCount: docs.has(key) ? docs.get(key) : null,
      daily: Array.isArray(points) && points.length >= 2 ? { end: window.endDate, points } : null,
      measuredAt: new Date(now).toISOString(),
    };
  });
  return {
    builtAt: new Date(now).toISOString(),
    window: { ...window },
    usage: { ...usage },
    status: { ...status },
    rows,
  };
}

/** True when the run measured something worth publishing (never overwrite a good board with an empty one). */
export const hasMeasurements = board => board.rows.some(row => row.searchVolume !== null || row.documentCount !== null || row.daily);
