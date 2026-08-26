/**
 * Orders full-text crawl candidates: news articles before blog posts.
 *
 * [2026-08-27] The owner spotted the broken assumption behind the old order:
 *
 *   "블로그 상위노출된 걸 가져오는 이유가, 실시간 검색어로 뜨는 키워드면 먼저 선점하고
 *    있는 블로그가 있다고 생각했는데 — 이슈 키워드는 선점 싸움이라 방금 나온 기사나
 *    키워드라면 없다고 생각을 못 했네."
 *
 * The assumption was written into the code as `[...mergedBlogs, ...newsLinks]`. With a
 * budget of 5 articles / 8,000 chars, eight blogs ahead of four news links meant the news
 * never got a turn. On a breaking keyword there is no established blog to borrow from, so
 * whatever unrelated blog ranked first became the article's spine.
 *
 * That produced a diet article carrying a car review: 서인영's 46kg piece devoted two
 * sections to a MINI Countryman (4445mm, 204마력, 4550만원). The news articles mention
 * 서인영; none of them mention 4445mm.
 *
 * News is the primary source. A blog is someone's retelling of it, often stitched from
 * several unrelated posts. The old comment justified blogs-first as "closest to the target
 * format" — but the output format is decided by the prompt, not by what the material looks
 * like. Facts come first; format is not a reason to prefer second-hand material.
 *
 * Pure and total: never throws, never fetches.
 */

export interface FullTextCandidate {
  readonly title?: string;
  readonly link: string;
  readonly postdate?: string;
}

export interface FullTextCandidateInput {
  /** News results, already merged recent-first by the caller. */
  readonly news: readonly FullTextCandidate[] | undefined;
  /** Blog results, already merged recent-first by the caller. */
  readonly blogs: readonly FullTextCandidate[] | undefined;
}

const isUsable = (candidate: unknown): candidate is FullTextCandidate => {
  const link = (candidate as FullTextCandidate)?.link;
  return typeof link === 'string' && /^https?:\/\//.test(link);
};

/**
 * News first, blogs after, duplicates removed.
 *
 * Blogs are kept rather than dropped: a concept keyword ("인연과 악연" as a Buddhist term)
 * legitimately has no news behind it, and then blogs are all there is.
 */
export function orderFullTextCandidates(input: FullTextCandidateInput): FullTextCandidate[] {
  try {
    const news = Array.isArray(input?.news) ? input.news : [];
    const blogs = Array.isArray(input?.blogs) ? input.blogs : [];

    const seen = new Set<string>();
    const out: FullTextCandidate[] = [];
    for (const candidate of [...news, ...blogs]) {
      if (!isUsable(candidate)) continue;
      if (seen.has(candidate.link)) continue;
      seen.add(candidate.link);
      out.push({
        title: candidate.title,
        link: candidate.link,
        postdate: candidate.postdate,
      });
    }
    return out;
  } catch {
    return [];
  }
}
