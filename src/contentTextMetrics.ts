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

/**
 * Count the text a reader can see, including a single separator between words
 * and blocks. Length targets shown as "characters" in the UI use this metric;
 * removing every space makes normal Korean prose appear roughly 20-30% shorter.
 */
export function visibleCharacterCount(text: string | undefined): number {
  if (!text) return 0;

  const textWithBlockSeparators = String(text)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|tr)>/gi, ' ');

  return stripHtmlTagsForCharacterCount(textWithBlockSeparators)
    .replace(/\s+/g, ' ')
    .trim()
    .length;
}
