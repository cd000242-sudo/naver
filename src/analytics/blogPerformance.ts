/**
 * 블로그 글 성과 가져오기(2026-10-21) — 크리에이터 어드바이저에서 받은 CSV · 운영 대장 CSV를 글별 관측으로 바꾼다.
 *   · 빈 칸 = 미수집(null), "0" = 실제로 본 0. 둘을 섞지 않는다.
 *   · 발행 후 24h · 72h · 7d 와 "기간 합계(range, 예: 9월 한 달)"를 다른 관측으로 둔다. 기간 합계를 발행 후 24시간 값으로 쓰지 않는다.
 *   · 노출수가 없으면 CTR 은 만들지 않는다(필드 자체가 없다). 블로그 일 UV 는 글 성과가 아니라 여기서 다루지 않는다.
 *   · 이 블로그 주소의 글만 받는다. 다른 블로그 · 주소 없는 줄은 추측하지 않고 거절 사유와 함께 돌려준다.
 */

export type PerformanceWindow = '24h' | '72h' | '7d' | 'range';
export interface PerformanceMetrics {
  readonly pv: number | null;
  readonly homefeed: number | null;
  readonly search: number | null;
  readonly dwellSeconds: number | null;
  readonly impressions: number | null;
}
export interface PostObservation {
  readonly blogId: string;
  readonly postId: string;
  readonly url: string;
  readonly title: string;
  readonly window: PerformanceWindow;
  readonly range?: { readonly start: string | null; readonly end: string | null; readonly interval: string | null };
  readonly publishedAt: string | null;
  readonly metrics: PerformanceMetrics;
  readonly source: { readonly kind: 'csv' | 'manual'; readonly fileName: string; readonly importedAt: string };
}
export interface ParseResult {
  readonly observations: PostObservation[];
  readonly rejected: Array<{ row: number; reason: 'NO_POST_URL' | 'OTHER_BLOG' | 'NO_METRICS' }>;
}

const MAX_CSV_CHARS = 2_000_000;
const MAX_ROWS = 5_000;
const WINDOWS = ['24h', '72h', '7d'] as const;

/** RFC4180 정도의 CSV — 따옴표 안 쉼표 · 줄바꿈 · "" 이스케이프 · BOM · CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = ''; if (row.some(c => c.trim())) rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim())) rows.push(row);
  return rows;
}

/** 이 블로그 글 주소(blog.naver.com/<blogId>/<postId>, 모바일, 어드바이저 contentId)에서 글 번호만. */
export function postIdFromUrl(raw: string, blogId: string): string | undefined {
  let url: URL;
  try { url = new URL(String(raw || '').trim()); } catch { return undefined; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.hostname === 'creator-advisor.naver.com') {
    const content = url.searchParams.get('contentId');
    const channel = url.searchParams.get('channelId');
    if (!content || (channel && channel.toLowerCase() !== blogId)) return undefined;
    return postIdFromUrl(content, blogId);
  }
  if (!['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname)) return undefined;
  const queryBlog = url.searchParams.get('blogId'); const queryPost = url.searchParams.get('logNo');
  if (queryBlog && queryPost) return queryBlog.toLowerCase() === blogId && /^\d{6,20}$/.test(queryPost) ? queryPost : undefined;
  const [owner, post] = url.pathname.split('/').filter(Boolean);
  return owner?.toLowerCase() === blogId && /^\d{6,20}$/.test(post || '') ? post : undefined;
}

/** 다른 블로그 글인지(거절 사유를 정확히 알려 주려고). */
function belongsToOtherBlog(raw: string, blogId: string): boolean {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.hostname === 'creator-advisor.naver.com') {
      const channel = url.searchParams.get('channelId');
      return Boolean(channel && channel.toLowerCase() !== blogId);
    }
    return ['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) && !postIdFromUrl(raw, blogId);
  } catch { return false; }
}

export function parseCount(value: string | undefined): number | null {
  const text = String(value ?? '').replace(/[,\s]/g, '');
  if (!text || text === '-' || !/^\d{1,12}$/.test(text)) return null;
  return Number(text);
}

export function parseDwell(value: string | undefined): number | null {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return null;
  const clock = text.match(/^(\d{1,3}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const minutes = text.match(/(\d{1,4})\s*분/); const seconds = text.match(/(\d{1,4})\s*초/);
  if (!minutes && !seconds) return null;
  return (minutes ? Number(minutes[1]) * 60 : 0) + (seconds ? Number(seconds[1]) : 0);
}

/** "2026-10-20 08:00" · "2026. 10. 20. 08:00"(한국 시간)을 +09:00 ISO 로. 모르면 null. */
export function parseKstDateTime(value: string | undefined): string | null {
  const m = String(value ?? '').trim().match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const pad = (n: string) => n.padStart(2, '0');
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${m[5]}:00+09:00`;
}

const key = (header: string) => header.replace(/[\s_]/g, '').toLowerCase();
type Columns = {
  title?: number; urls: number[]; publishedAt?: number;
  windowed: Record<string, { pv?: number; homefeed?: number; search?: number }>;
  range: { pv?: number; homefeed?: number; search?: number; dwell?: number; impressions?: number };
};

function detectColumns(headers: string[]): Columns {
  const cols: Columns = { urls: [], windowed: {}, range: {} };
  headers.forEach((raw, i) => {
    const h = key(raw);
    if (cols.title === undefined && /제목/.test(h)) cols.title = i;
    if (/url|주소/.test(h)) cols.urls.push(i);
    if (cols.publishedAt === undefined && /발행일시/.test(h)) cols.publishedAt = i;
    const windowed = h.match(/^(24h|72h|7d)(.*)$/);
    if (windowed) {
      const slot = cols.windowed[windowed[1]] ||= {};
      const rest = windowed[2];
      if (/비율/.test(rest)) return;
      if (/^(pv|전체조회|조회수?)$/.test(rest)) slot.pv = i;
      else if (/(홈피드|홈판)유입/.test(rest)) slot.homefeed = i;
      else if (/검색유입/.test(rest)) slot.search = i;
      return;
    }
    if (/비율/.test(h)) return;
    if (/조회수$/.test(h)) cols.range.pv = i;
    else if (/(홈피드|홈판)유입/.test(h)) cols.range.homefeed = i;
    else if (/검색유입/.test(h)) cols.range.search = i;
    else if (/평균사용시간/.test(h)) cols.range.dwell = i;
    else if (/노출수/.test(h)) cols.range.impressions = i;
  });
  return cols;
}

const empty = (m: PerformanceMetrics) => Object.values(m).every(v => v === null);
const text = (value: string | undefined, max: number) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function parsePerformanceCsv(csv: string, ctx: { blogId: string; fileName: string; now?: Date }): ParseResult {
  if (typeof csv !== 'string' || csv.length > MAX_CSV_CHARS) throw new Error('PERFORMANCE_TOO_LARGE: 성과 파일은 2MB 이하만 가져올 수 있습니다.');
  const blogId = String(ctx.blogId || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,100}$/.test(blogId)) throw new Error('PERFORMANCE_BLOG_UNKNOWN: 계정의 블로그 ID가 필요합니다.');
  const rows = parseCsv(csv);
  if (rows.length - 1 > MAX_ROWS) throw new Error('PERFORMANCE_TOO_LARGE: 한 번에 5,000줄까지만 가져올 수 있습니다.');
  const cols = detectColumns(rows[0] || []);
  const hasWindowed = Object.values(cols.windowed).some(slot => slot.pv !== undefined || slot.homefeed !== undefined || slot.search !== undefined);
  const hasRange = cols.range.pv !== undefined || cols.range.homefeed !== undefined;
  if (!hasWindowed && !hasRange) throw new Error('PERFORMANCE_NO_METRICS: 조회수 · 유입수 칸을 찾지 못했습니다.');
  const importedAt = (ctx.now || new Date()).toISOString();
  const source = { kind: 'csv' as const, fileName: text(ctx.fileName, 120) || 'import.csv', importedAt };
  const observations: PostObservation[] = [];
  const rejected: ParseResult['rejected'] = [];

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const urls = cols.urls.map(i => row[i]).filter(Boolean);
    const found = urls.map(u => ({ u, id: postIdFromUrl(u, blogId) })).find(x => x.id);
    if (!found) { rejected.push({ row: line, reason: urls.some(u => belongsToOtherBlog(u, blogId)) ? 'OTHER_BLOG' : 'NO_POST_URL' }); return; }
    const base = { blogId, postId: found.id!, url: `https://blog.naver.com/${blogId}/${found.id}`, title: text(cols.title !== undefined ? row[cols.title] : '', 200),
      publishedAt: cols.publishedAt !== undefined ? parseKstDateTime(row[cols.publishedAt]) : null, source };
    let added = 0;
    for (const window of WINDOWS) {
      const slot = cols.windowed[window];
      if (!slot) continue;
      const metrics = { pv: parseCount(row[slot.pv ?? -1]), homefeed: parseCount(row[slot.homefeed ?? -1]), search: parseCount(row[slot.search ?? -1]), dwellSeconds: null, impressions: null };
      if (!empty(metrics)) { observations.push({ ...base, window, metrics }); added++; }
    }
    if (hasRange) {
      const metrics = { pv: parseCount(row[cols.range.pv ?? -1]), homefeed: parseCount(row[cols.range.homefeed ?? -1]), search: parseCount(row[cols.range.search ?? -1]),
        dwellSeconds: parseDwell(row[cols.range.dwell ?? -1]), impressions: parseCount(row[cols.range.impressions ?? -1]) };
      if (!empty(metrics)) {
        let range: PostObservation['range'] = { start: null, end: null, interval: null };
        try {
          const params = new URL(found.u).searchParams;
          const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
          range = { start: date(params.get('startDate')), end: date(params.get('endDate')), interval: params.get('interval')?.slice(0, 20) || null };
        } catch { /* 기간을 모르면 null 그대로 */ }
        observations.push({ ...base, window: 'range', range, metrics }); added++;
      }
    }
    if (!added) rejected.push({ row: line, reason: 'NO_METRICS' });
  });
  return { observations, rejected };
}
