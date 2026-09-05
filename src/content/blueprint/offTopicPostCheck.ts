/**
 * SPEC-BLUEPRINT-2026 · [2026-09-05] Post-generation check for excluded subjects.
 *
 * The blueprint's offTopic list ("자료에 있어도 이 글의 질문이 아니다") was advisory only:
 * one prompt line asked the model to keep those subjects out, and nothing verified the result.
 * A storage-question post shipped with 차오포이 소비 · 중고거래 위생 · 섬유 폐기물 sections —
 * every one of them named in material the blueprint could have excluded.
 *
 * Warning-only by policy (게이트는 경고-only, 발행은 막지 않는다): the caller appends the
 * hits to quality.warnings and logs them so the drift is visible, not silently shipped.
 */

export interface OffTopicRemnantHit {
  /** The excluded subject, as the blueprint wrote it. */
  readonly subject: string;
  /** The heading whose title/body still carries that subject. */
  readonly heading: string;
}

interface HeadingLike {
  readonly title?: unknown;
  readonly content?: unknown;
  readonly body?: unknown;
}

/** Korean/Latin tokens of 2+ chars — the words that identify a subject. */
function subjectTokens(subject: string): string[] {
  return String(subject || '')
    .split(/[^가-힣A-Za-z0-9]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !/^\d+$/.test(word));
}

/**
 * Finds headings that still talk about an excluded subject.
 *
 * A heading matches when at least two subject tokens appear in its title+body (one token
 * when the subject has only one) — the same "one shared word proves nothing" bar the
 * material gate uses. Fails empty: no subjects or no headings means no hits, never a throw.
 */
export function findOffTopicRemnants(
  offTopic: readonly string[] | undefined,
  headings: readonly HeadingLike[] | undefined,
): OffTopicRemnantHit[] {
  try {
    const subjects = (Array.isArray(offTopic) ? offTopic : [])
      .map((subject) => String(subject || '').trim())
      .filter(Boolean);
    const sections = Array.isArray(headings) ? headings : [];
    if (subjects.length === 0 || sections.length === 0) return [];

    const hits: OffTopicRemnantHit[] = [];
    for (const subject of subjects) {
      const tokens = subjectTokens(subject);
      if (tokens.length === 0) continue;
      const required = tokens.length >= 2 ? 2 : 1;
      for (const section of sections) {
        const headingTitle = typeof section.title === 'string' ? section.title : '';
        const text = [
          headingTitle,
          typeof section.content === 'string' ? section.content : '',
          typeof section.body === 'string' ? section.body : '',
        ].join('\n');
        if (!text.trim()) continue;
        const matched = tokens.filter((token) => text.includes(token)).length;
        if (matched >= required) {
          hits.push({ subject, heading: headingTitle || '(제목 없는 섹션)' });
        }
      }
    }
    return hits;
  } catch {
    return [];
  }
}
