import type { StructuredContent } from './contentGenerator';

export function sanitizeUnverifiedOfficialGuideClaims(text: string): string {
  if (!text) return text;

  return String(text)
    .replace(/(?:20\d{2}년\s*)?(?:공식|최신)\s*가이드(?:에서는|에 따르면| 기준으로는| 기준|는)?\s*/gi, '')
    .replace(/(?:20\d{2}년\s*)?공식\s*매뉴얼(?:에서는|에 따르면| 기준으로는| 기준|은)?\s*/gi, '')
    .replace(/(?:20\d{2}년\s*)?공식\s*지침(?:에서는|에 따르면| 기준으로는| 기준|은)?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeStructuredContentClaims(content: StructuredContent): void {
  if (!content) return;

  if (content.bodyPlain) content.bodyPlain = sanitizeUnverifiedOfficialGuideClaims(content.bodyPlain);
  if (content.bodyHtml) content.bodyHtml = sanitizeUnverifiedOfficialGuideClaims(content.bodyHtml);
  if (content.content) content.content = sanitizeUnverifiedOfficialGuideClaims(content.content);
  if (content.introduction) content.introduction = sanitizeUnverifiedOfficialGuideClaims(content.introduction);
  if (content.conclusion) content.conclusion = sanitizeUnverifiedOfficialGuideClaims(content.conclusion);

  if (Array.isArray(content.headings)) {
    content.headings = content.headings.map((heading: any) => ({
      ...heading,
      content: heading?.content ? sanitizeUnverifiedOfficialGuideClaims(String(heading.content)) : heading?.content,
      body: heading?.body ? sanitizeUnverifiedOfficialGuideClaims(String(heading.body)) : heading?.body,
      summary: heading?.summary ? sanitizeUnverifiedOfficialGuideClaims(String(heading.summary)) : heading?.summary,
    }));
  }
}
