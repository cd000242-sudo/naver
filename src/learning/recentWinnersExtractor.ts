/**
 * Recent winners extractor — pulls the top-performing titles + intros from
 * recent publish history and formats them as LLM few-shot examples.
 *
 * Design:
 *   - Title + intro text live in postMetricsStore optional `notes`, NOT in
 *     featureFlagTracker (which only stores flags/validation meta). To keep
 *     this extractor decoupled we accept an optional resolver callback that
 *     maps postId → { title, intro }. Tests inject a fake resolver; real
 *     callers wire it to the blog post persistence layer (future work).
 *   - "Top 20%" is defined by views DESC among posts with at least one
 *     metric snapshot. Ties broken by likes DESC.
 *   - Minimum sample gate: returns an empty array when fewer than 5 posts
 *     have metrics. With N<5 the "winners" are statistical noise and would
 *     lock the prompt into a random pattern.
 *   - We never invent data. If the resolver cannot provide a title/intro,
 *     that post is silently skipped.
 */

import { listLatestPerPost, type PostMetricSnapshot } from '../analytics/postMetricsStore.js';

export interface WinnerSample {
  postId: string;
  title: string;
  intro: string;
  views: number;
}

export interface WinnerTextResolver {
  (postId: string): { title: string; intro: string } | null;
}

export interface ExtractOptions {
  /** Fraction of posts to pick as winners. Default 0.2 (top 20%). */
  topFraction?: number;
  /** Minimum snapshots required to run the extraction at all. Default 5. */
  minSampleSize?: number;
  /** Upper bound on samples returned to avoid prompt bloat. Default 5. */
  maxWinners?: number;
}

export function extractRecentWinners(
  resolveText: WinnerTextResolver,
  options: ExtractOptions = {},
): WinnerSample[] {
  const topFraction = options.topFraction ?? 0.2;
  const minSampleSize = options.minSampleSize ?? 5;
  const maxWinners = options.maxWinners ?? 5;

  const metrics: PostMetricSnapshot[] = listLatestPerPost();
  if (metrics.length < minSampleSize) return [];

  const sorted = metrics
    .slice()
    .sort((a, b) => (b.views - a.views) || (b.likes - a.likes));

  const cutoff = Math.max(1, Math.ceil(metrics.length * topFraction));
  const topSlice = sorted.slice(0, Math.min(cutoff, maxWinners));

  const winners: WinnerSample[] = [];
  for (const m of topSlice) {
    const text = resolveText(m.postId);
    if (!text || !text.title || !text.intro) continue;
    winners.push({
      postId: m.postId,
      title: text.title,
      intro: text.intro,
      views: m.views,
    });
  }
  return winners;
}

/**
 * Format winners as a prompt-ready few-shot block. Returns empty string when
 * there are no winners, so callers can concatenate unconditionally.
 */
export function formatWinnersForPrompt(winners: WinnerSample[]): string {
  if (winners.length === 0) return '';

  const lines: string[] = [];
  lines.push('[RECENT_WINNERS — 최근 성과 상위 글 패턴 (참조용, 복사 금지)]');
  lines.push('아래는 이 엔진으로 발행되어 실제로 높은 조회수를 기록한 글의 제목과');
  lines.push('도입부 패턴이다. 어조·리듬·후킹 구조를 참고하되, 문장을 그대로 베끼지');
  lines.push('말 것. 같은 주제에 같은 표현을 쓰면 중복 문서로 판정된다.');
  lines.push('');
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    lines.push(`예시 ${i + 1} (조회 ${w.views.toLocaleString()}):`);
    lines.push(`  제목: ${w.title}`);
    lines.push(`  도입부: ${w.intro}`);
    lines.push('');
  }
  return lines.join('\n');
}
