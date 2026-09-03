import type { StructuredContent } from './contentGenerator';

export function sanitizeUnverifiedOfficialGuideClaims(text: string): string {
  if (!text) return text;

  return String(text)
    .replace(/(?:20\d{2}년\s*)?(?:공식|최신)\s*가이드(?:에서는|에 따르면| 기준으로는| 기준|는)?\s*/gi, '')
    .replace(/(?:20\d{2}년\s*)?공식\s*매뉴얼(?:에서는|에 따르면| 기준으로는| 기준|은)?\s*/gi, '')
    .replace(/(?:20\d{2}년\s*)?공식\s*지침(?:에서는|에 따르면| 기준으로는| 기준|은)?\s*/gi, '')
    // [2026-09-03 뿌리] 여기가 벽의 뿌리였다. \s 는 줄바꿈도 잡아서 문단 사이 빈 줄(\n\n)이 공백 하나로 뭉개졌다 —
    //   ensureContentParagraphBreaks 가 45문장을 15문단으로 나눈 직후 이 정제기가 돌며 전부 지웠다(로그 실측).
    //   가로 공백만 접는다. 줄바꿈은 아래 두 줄이 따로 다룬다.
    .replace(/[ \t]{2,}/g, ' ')
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
