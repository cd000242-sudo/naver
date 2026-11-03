/**
 * 발행 대조 · 수동 기록(2026-10-21) — 앱이 발행 때 남긴 기록(published-posts.json)과 가져온 성과를 맞대어
 * "발행 후 24h · 72h · 7d 가 지났는데 측정이 없는 글"을 보여 주고, 그 자리에서 숫자를 직접 넣을 수 있게 한다.
 *   · 이 블로그 글만. 아직 시간이 안 된 구간은 대상이 아니다.
 *   · 수동 기록도 빈 칸 = 미수집(null), 0 = 실제 0. 다른 블로그 주소 · 음수 · 숫자가 아닌 값은 거절한다.
 */
import { parseCount, postIdFromUrl, type PerformanceWindow, type PostObservation } from './blogPerformance.js';

export interface PublishedRecord { readonly blogId: string; readonly logNo: string; readonly url: string; readonly title: string; readonly publishedAt: string }
export interface PendingPost { readonly postId: string; readonly url: string; readonly title: string; readonly publishedAt: string; readonly missing: Array<'24h' | '72h' | '7d'> }

const DUE: ReadonlyArray<['24h' | '72h' | '7d', number]> = [['24h', 24], ['72h', 72], ['7d', 168]];
const HOUR = 3_600_000;

export function pendingCollection(published: readonly PublishedRecord[], observations: readonly PostObservation[], blogId: string, now = new Date()): PendingPost[] {
  const measured = new Set(observations.map(o => `${o.postId}|${o.window}`));
  const out: PendingPost[] = [];
  for (const post of published) {
    if (String(post.blogId).toLowerCase() !== blogId || !/^\d{6,20}$/.test(post.logNo)) continue;
    const at = Date.parse(post.publishedAt);
    if (!Number.isFinite(at)) continue;
    const hours = (now.getTime() - at) / HOUR;
    const missing = DUE.filter(([window, h]) => hours >= h && !measured.has(`${post.logNo}|${window}`)).map(([window]) => window);
    if (missing.length) out.push({ postId: post.logNo, url: post.url, title: post.title, publishedAt: post.publishedAt, missing });
  }
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 50);
}

type ManualInput = { url: string; window: PerformanceWindow; pv?: string; homefeed?: string; search?: string; title?: string };

export function manualObservation(input: ManualInput, blogId: string, now = new Date()): PostObservation {
  const invalid = (why: string): never => { throw new Error(`PERFORMANCE_INVALID: ${why}`); };
  if (!['24h', '72h', '7d'].includes(input?.window)) invalid('관측 구간은 24h · 72h · 7d 중 하나입니다.');
  const postId = postIdFromUrl(String(input.url || ''), blogId);
  if (!postId) throw new Error('PERFORMANCE_OTHER_BLOG: 이 블로그의 글 주소가 아닙니다.');
  const field = (value: string | undefined, label: string) => {
    if (value === undefined || String(value).trim() === '') return null;
    const n = parseCount(value);
    return n === null ? invalid(`${label}은 0 이상의 숫자여야 합니다.`) : n;
  };
  const metrics = { pv: field(input.pv, '조회수'), homefeed: field(input.homefeed, '홈판 유입'), search: field(input.search, '검색 유입'), dwellSeconds: null, impressions: null };
  if (metrics.pv === null && metrics.homefeed === null && metrics.search === null) invalid('숫자를 하나 이상 넣어 주세요.');
  return {
    blogId, postId, url: `https://blog.naver.com/${blogId}/${postId}`, title: String(input.title || '').slice(0, 200), window: input.window, publishedAt: null, metrics,
    source: { kind: 'manual', fileName: 'manual', importedAt: now.toISOString() },
  };
}
