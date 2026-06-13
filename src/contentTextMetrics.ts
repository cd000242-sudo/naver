export function stripHtmlTagsForCharacterCount(text: string): string {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function characterCount(text: string | undefined, _minChars?: number): number {
  if (!text) return 0;
  return stripHtmlTagsForCharacterCount(text).replace(/\s+/g, '').length;
}
