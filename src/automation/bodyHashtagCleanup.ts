type MutableStructuredContent = Record<string, any>;

const HASHTAG_TOKEN_RE = /#[\p{L}\p{N}_-]{1,40}/gu;
const HASHTAG_LABEL_RE = /^(?:해시\s*태그|태그|hashtags?)\s*[:：]/i;

function countHashtags(value: string): number {
  return Array.from(value.matchAll(HASHTAG_TOKEN_RE)).length;
}

function hasOnlyHashtagPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (HASHTAG_LABEL_RE.test(trimmed)) {
    const withoutLabel = trimmed.replace(HASHTAG_LABEL_RE, '').trim();
    return withoutLabel.length === 0 || countHashtags(withoutLabel) > 0;
  }

  const tagCount = countHashtags(trimmed);
  if (tagCount === 0) return false;

  const nonTagText = trimmed
    .replace(HASHTAG_TOKEN_RE, '')
    .replace(/[\s,|/·ㆍ・#]+/g, '')
    .trim();

  return nonTagText.length === 0 || (tagCount >= 2 && nonTagText.length <= 3);
}

export function stripBodyHashtagBlocks(text: string): string {
  if (!text) return text;

  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter((line) => !hasOnlyHashtagPayload(line));
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanField<T extends MutableStructuredContent>(
  target: T,
  field: string,
  changed: { value: boolean },
): T {
  if (typeof target?.[field] !== 'string') return target;
  const cleaned = stripBodyHashtagBlocks(target[field]);
  if (cleaned === target[field]) return target;
  changed.value = true;
  return { ...target, [field]: cleaned };
}

export function stripBodyHashtagsFromStructuredContent<T extends MutableStructuredContent | undefined>(content: T): T {
  if (!content) return content;

  const changed = { value: false };
  let next: MutableStructuredContent = content;

  for (const field of ['bodyPlain', 'bodyHtml', 'content', 'introduction', 'conclusion']) {
    next = cleanField(next, field, changed);
  }

  if (Array.isArray(next.headings)) {
    const headings = next.headings.map((heading: MutableStructuredContent) => {
      let nextHeading = heading;
      for (const field of ['content', 'body', 'summary']) {
        nextHeading = cleanField(nextHeading, field, changed);
      }
      return nextHeading;
    });

    if (headings.some((heading: MutableStructuredContent, index: number) => heading !== next.headings[index])) {
      next = { ...next, headings };
    }
  }

  return (changed.value ? next : content) as T;
}
