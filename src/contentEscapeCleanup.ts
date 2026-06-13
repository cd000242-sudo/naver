export function cleanEscapeSequences(text: string): string {
  if (!text) return text;

  return text
    .replace(/\\([nrtbf])/g, (match, char) => {
      switch (char) {
        case 'n': return '\n';
        case 't': return ' ';
        case 'r': return '';
        case 'b': return '';
        case 'f': return '';
        default: return match;
      }
    })
    .replace(/\\\\/g, '')
    .replace(/\\u[0-9a-fA-F]{4}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
