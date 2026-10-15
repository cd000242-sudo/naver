// src/main/ipc/homefeedAutopilotHandlers.ts
// [2026-10-15] Homefeed autopilot P1 — judge and auto-adopt today's topic.
//
// Reads the public LEWORD data (homefeed benchmark, titles, guides, today's briefs), scores
// every candidate, and lets Claude pick one. Owner decisions (2026-10-15):
//   - the app may read the leaderspro.kr/data homefeed files
//   - the best topic is adopted automatically (no manual pick)
//   - the judge always runs on the Claude API key (org promo credits), never the
//     subscription CLI, whatever text engine is selected for generation
// Fetched in the main process: renderer fetches hit CSP/CORS. Public JSON, no auth.

import { app, ipcMain } from 'electron';
import axios from 'axios';
import {
  HOMEFEED_BENCHMARKS_URL,
  HOMEFEED_GUIDES_URL,
  HOMEFEED_TITLES_URL,
  parseHomefeedBenchmarkFeed,
  type HomefeedBenchmarkFeed,
} from '../../analytics/homefeedBenchmarkFeed.js';
import { LEWORD_BRIEFS_URL, parseTopicBriefs, type LewordPick } from '../../analytics/lewordBoard.js';
import { loadPublishedPosts } from '../../analytics/publishedPostTracker.js';
import { scoreHomefeedTopics, type ScoredTopic } from '../../homefeedAutopilot/topicScoring.js';
import { judgeHomefeedTopic, type TopicDecision } from '../../homefeedAutopilot/topicJudge.js';
import { resolveSelectedEngineRoute } from './paraphraseAnalysisHandlers.js';

export interface HomefeedTopicShortlistItem {
  readonly keyword: string;
  readonly title: string;
  readonly score: number;
}

export interface HomefeedTopicResult {
  readonly success: boolean;
  readonly decision?: TopicDecision;
  readonly shortlist?: readonly HomefeedTopicShortlistItem[];
  readonly engine?: string;
  readonly warning?: string;
  readonly message?: string;
}

export interface HomefeedAutopilotHandlerDeps {
  loadConfig: () => Promise<Record<string, unknown>>;
}

/** Benchmarks refresh every ~15 minutes upstream; 10 minutes keeps us close without refetching ~10 MB per click. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Topics published within this window are not proposed again. */
const RECENT_POST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

let cache: { at: number; feed: HomefeedBenchmarkFeed; briefs: readonly LewordPick[] } | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const response = await axios.get(url, {
    timeout: 20_000,
    maxRedirects: 3,
    headers: { Accept: 'application/json' },
    validateStatus: (status) => status === 200,
  });
  return response.data;
}

async function loadSources(): Promise<{ feed: HomefeedBenchmarkFeed; briefs: readonly LewordPick[] }> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  const [bench, titles, guides, briefs] = await Promise.allSettled([
    fetchJson(HOMEFEED_BENCHMARKS_URL),
    fetchJson(HOMEFEED_TITLES_URL),
    fetchJson(HOMEFEED_GUIDES_URL),
    fetchJson(LEWORD_BRIEFS_URL),
  ]);
  const value = (r: PromiseSettledResult<unknown>): unknown => (r.status === 'fulfilled' ? r.value : undefined);
  const feed = parseHomefeedBenchmarkFeed(value(bench), value(titles), value(guides));
  const briefPicks = parseTopicBriefs(value(briefs)).picks;
  if (feed.candidates.length === 0 && briefPicks.length === 0) {
    throw new Error('홈판 벤치마크와 오늘의 글감을 모두 받지 못했습니다');
  }
  cache = { at: Date.now(), feed, briefs: briefPicks };
  return cache;
}

function recentKeywords(): string[] {
  try {
    const cutoff = Date.now() - RECENT_POST_WINDOW_MS;
    return loadPublishedPosts(app.getPath('userData'))
      .filter((post) => Date.parse(post.publishedAt) >= cutoff)
      .flatMap((post) => [post.keyword, post.title])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function toShortlist(scored: readonly ScoredTopic[]): HomefeedTopicShortlistItem[] {
  return scored.slice(0, 5).map((topic) => ({ keyword: topic.keyword, title: topic.title, score: topic.score }));
}

export function registerHomefeedAutopilotHandlers(deps: HomefeedAutopilotHandlerDeps): void {
  ipcMain.handle('homefeedAutopilot:judgeTopic', async (): Promise<HomefeedTopicResult> => {
    try {
      const { feed, briefs } = await loadSources();
      const scored = scoreHomefeedTopics({
        candidates: feed.candidates,
        briefs,
        now: Date.now(),
        excludeKeywords: recentKeywords(),
      });
      const config = await deps.loadConfig();
      const route = resolveSelectedEngineRoute('claude', config, { tier: 'quality' });
      const { decision, warning } = await judgeHomefeedTopic(scored, feed.titleRules, route?.callModel);
      if (!decision) return { success: false, message: '오늘은 채택할 홈판 글감이 없습니다.' };
      console.log(`[HomefeedAutopilot] ✅ 채택: ${decision.keyword} (${decision.decidedBy}, 점수 ${decision.score})`);
      return { success: true, decision, shortlist: toShortlist(scored), engine: route?.engine, warning };
    } catch (error) {
      const message = (error as Error)?.message ?? '알 수 없는 오류';
      console.warn('[HomefeedAutopilot] 글감 판단 실패:', message);
      return { success: false, message: `홈판 글감을 판단하지 못했습니다 — ${message}` };
    }
  });
}
