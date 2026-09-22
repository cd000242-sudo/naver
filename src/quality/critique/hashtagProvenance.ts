// [2026-09-22 Critique Loop] Hashtag provenance — so the Critic/Judge never mistake
// LLM-generated tags for real related-search data (audit P0 item 22 follow-up).
//   actualSearch : tag equals a real related-search keyword (metadata.keywords, non-LLM origin)
//   article      : tag appears in the article body
//   semantic     : tag shares a token with the primary keyword
//   hashtag      : LLM-generated, no other backing

export type HashtagOrigin = 'actualSearch' | 'article' | 'semantic' | 'hashtag';

export interface HashtagProvenance {
  readonly tag: string;
  readonly origin: HashtagOrigin;
}

export interface HashtagProvenanceInput {
  readonly hashtags: readonly string[];
  readonly primaryKeyword: string;
  readonly relatedKeywords: readonly string[];
  readonly relatedKeywordsAreLlmExpanded: boolean;
  readonly articleText: string;
}

const norm = (s: string): string => String(s || '').replace(/^#/, '').replace(/\s+/g, '').toLowerCase();

export function classifyHashtags(input: HashtagProvenanceInput): HashtagProvenance[] {
  const related = new Set(input.relatedKeywordsAreLlmExpanded ? [] : input.relatedKeywords.map(norm).filter(Boolean));
  const body = norm(input.articleText);
  const keywordTokens = String(input.primaryKeyword || '').split(/\s+/).map(norm).filter((t) => t.length >= 2);
  return input.hashtags.map((raw) => {
    const tag = norm(raw);
    let origin: HashtagOrigin = 'hashtag';
    if (related.has(tag)) origin = 'actualSearch';
    else if (tag && body.includes(tag)) origin = 'article';
    else if (keywordTokens.some((t) => tag.includes(t))) origin = 'semantic';
    return { tag: raw, origin };
  });
}

export function describeHashtagProvenance(list: readonly HashtagProvenance[]): string {
  if (list.length === 0) return '(해시태그 없음)';
  return list.map((h) => `${h.tag.startsWith('#') ? h.tag : `#${h.tag}`} (${h.origin})`).join(' ');
}
