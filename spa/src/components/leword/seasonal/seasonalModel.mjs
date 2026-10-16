/** Seasonal planning data is an editorial inventory, never a search-volume or profit score. */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 3000;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function safeSourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function validTopic(t) {
  return isRecord(t) && ['id', 'category', 'type', 'keyword', 'angle', 'prep', 'sourceTitle', 'sourceStatus'].every(key => text(t[key]))
    && Number.isInteger(t.month) && t.month >= 1 && t.month <= 12 && typeof t.money === 'boolean'
    && safeSourceUrl(t.sourceUrl) !== null && Array.isArray(t.suggestions) && t.suggestions.length <= 100 && t.suggestions.every(text)
    && (t.observedAt === null || date(t.observedAt));
}
export function parseSeasonalBoard(value) {
  if (!isRecord(value) || value.version !== 1 || !date(value.updatedAt) || !Array.isArray(value.topics) || value.topics.length > 10000
    || !value.topics.every(validTopic) || new Set(value.topics.map(t => t.id)).size !== value.topics.length) throw new Error('시즌 자료의 형식을 확인할 수 없습니다.');
  const { stats, audit, topics } = value;
  if (!isRecord(stats) || !['topics', 'autocompleteUnique', 'moneyTopics'].every(key => integer(stats[key]))
    || stats.topics !== topics.length || stats.moneyTopics !== topics.filter(t => t.money).length
    || stats.autocompleteUnique !== new Set(topics.flatMap(t => t.suggestions).map(value => value.replace(/\s+/g, '').toLowerCase())).size
    || !isRecord(audit) || !['originalTopics', 'addedTopics', 'excludedSuggestions'].every(key => integer(audit[key]))
    || !Array.isArray(audit.notes) || !audit.notes.every(text)) throw new Error('시즌 자료의 집계를 확인할 수 없습니다.');
  return value;
}
export function koreaMonth(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Seoul' }).format(now));
}
export const nextMonth = (month) => month === 12 ? 1 : month + 1;
export const isPlanningPriority = (topic, month) => topic.month === month || topic.month === nextMonth(month);
export function filterSeasonalTopics(topics, { month = 'all', category = 'all', query = '', moneyOnly = false } = {}) {
  const term = query.trim().toLocaleLowerCase('ko-KR');
  return topics.filter(t => (month === 'all' || t.month === month) && (category === 'all' || t.category === category)
    && (!moneyOnly || t.money) && (!term || [t.keyword, t.category, t.angle, ...t.suggestions].join(' ').toLocaleLowerCase('ko-KR').includes(term)));
}
export function paginateTopics(topics, requestedPage, pageSize = 24) {
  const pages = Math.max(1, Math.ceil(topics.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  return { items: topics.slice((page - 1) * pageSize, page * pageSize), page, pages, total: topics.length };
}
export function timingNotice(type) {
  if (['공고형', '모집형', '제도형'].includes(type)) return '올해 공고와 대상·신청 기간을 확인하세요. 이 달에 접수가 열린다는 뜻은 아닙니다.';
  if (['음력형', '이동행사'].includes(type)) return '음력·이동 행사로 실제 개최월이 달라집니다. 올해 행사 날짜에 맞춰 준비하세요.';
  if (['기상형', '절기형'].includes(type)) return '날씨와 지역에 따라 시점이 달라집니다. 예보·개화·지역 공지를 확인하세요.';
  return '이 달은 기획용 분류입니다. 올해 기한과 기관·지역별 예외를 발행 전에 확인하세요.';
}
export async function loadSeasonalBoard(signal, fetcher = fetch) {
  const response = await fetcher('/data/seasonal-keywords.json', { signal, cache: 'no-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error('시즌 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  return parseSeasonalBoard(await response.json());
}
