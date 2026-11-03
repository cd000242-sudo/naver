import { createHash } from 'node:crypto';

function textSnapshot(value: Record<string, any>): string {
  return JSON.stringify({ selectedTitle: value.selectedTitle, bodyPlain: value.bodyPlain,
    bodyHtml: value.bodyHtml, introduction: value.introduction, conclusion: value.conclusion,
    headings: Array.isArray(value.headings) ? value.headings.map((heading: any) => ({
      title: heading?.title, content: heading?.content, summary: heading?.summary,
    })) : value.headings });
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

/** Bind reviewed text to the final editor request without mutating V3 admission. */
export function sealDailyEditorialPublication(article: { selectedTitle: string; bodyPlain: string }) {
  if (!article?.selectedTitle?.trim() || !article?.bodyPlain?.trim()) throw Error('DAILY_EDITORIAL_REQUIRED');
  const title = article.selectedTitle, body = article.bodyPlain, hash = digest(textSnapshot(article));
  return (value: unknown): void => {
    const payload = value as Record<string, any> | null;
    if (!payload || payload.title !== title || payload.content !== body || !payload.structuredContent
      || digest(textSnapshot(payload.structuredContent)) !== hash) {
      throw Error('DAILY_EDITORIAL_CHANGED: 검수 뒤 제목이나 본문이 바뀌어 발행을 보류했습니다. 다시 검수해 주세요.');
    }
  };
}
