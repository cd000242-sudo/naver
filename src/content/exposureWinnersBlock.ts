/**
 * Exposure-based recent winners — SPEC-HOMEFEED-EMPATHY-2026 Pillar 3.
 *
 * The compounding loop ("꾸준히 하면 성과"): posts published by this engine are
 * tracked (publishedPostTracker) and their 통합탭/homefeed exposure is polled at
 * 24/48/72h (exposurePoller → exposureChecks[].position). Posts that actually
 * reached top-10 exposure are *winners*. We feed their TITLES back as few-shot
 * examples so future generations learn from what actually got exposed. The more
 * the user posts, the more winning patterns the system learns — it compounds.
 *
 * Why titles only: PublishedPost stores no intro, and the user's homefeed
 * priority is the title (the strongest exposure lever).
 *
 * Legal constraint (see postMetricsStore red line): we NEVER scrape logged-in
 * blog stats. Exposure = appearance in *public* search results, the only
 * legitimate auto-signal — and the right signal for "what gets exposed", not
 * raw view counts.
 */
import {
  loadPublishedPosts,
  splitExposureGroups,
  type PublishedPost,
} from '../analytics/publishedPostTracker.js';
import { isFeatureEnabled } from '../services/featureFlagConfig.js';

/** Below this many exposed samples the signal is noise — lock to empty. */
const MIN_WINNERS = 3;
/** Upper bound on examples injected to avoid prompt bloat. */
const MAX_WINNERS = 5;

function resolveUserDataPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    return electron.app?.getPath?.('userData') ?? '';
  } catch {
    return '';
  }
}

/** Best (smallest) exposure position across all checks; Infinity if none. */
function bestPosition(post: PublishedPost): number {
  let best = Number.POSITIVE_INFINITY;
  for (const check of post.exposureChecks ?? []) {
    if (check.position !== null && check.position < best) best = check.position;
  }
  return best;
}

/**
 * Build a few-shot block of this user's titles that actually reached top-10
 * exposure for the given mode. Returns '' when the feature is off, no userData
 * path is available, or fewer than MIN_WINNERS exposed posts exist (noise lock).
 */
export function buildExposureWinnersBlock(
  mode: string,
  userDataPath: string = resolveUserDataPath(),
): string {
  if (!isFeatureEnabled('feedback_loop')) return '';
  if (!userDataPath || !mode) return '';

  try {
    const posts = loadPublishedPosts(userDataPath).filter((p) => p.mode === mode);
    const { exposed } = splitExposureGroups(posts);
    if (exposed.length < MIN_WINNERS) return ''; // too few samples — lock empty

    const ranked = [...exposed].sort(
      (a, b) => bestPosition(a) - bestPosition(b) || b.publishedAt.localeCompare(a.publishedAt),
    );
    const titles = ranked
      .slice(0, MAX_WINNERS)
      .map((p) => (p.title || '').trim())
      .filter(Boolean);
    if (titles.length < MIN_WINNERS) return '';

    return formatExposureWinners(titles);
  } catch (err) {
    console.error('[ExposureWinners] 추출 실패, 빈 블록 사용:', err);
    return '';
  }
}

function formatExposureWinners(titles: string[]): string {
  const lines: string[] = [
    '[검증된 노출 성공 제목 — 내 글 중 실제로 통합탭/홈판 상위 노출된 제목 (참조용, 복사 절대 금지)]',
    '아래는 이 엔진으로 발행되어 *실제로 노출에 성공한* 내 제목이다. 후킹 구조·구체성·리듬을',
    '학습하되 문장·표현을 그대로 베끼지 마라(중복 문서 판정). 같은 패턴을 다른 소재로 변주하라.',
    '',
  ];
  titles.forEach((title, i) => lines.push(`  노출 성공 ${i + 1}: ${title}`));
  return lines.join('\n');
}
