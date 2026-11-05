/**
 * Close a JSON document whose only defect is missing trailing closers ("}" / "]").
 *
 * Model answers sometimes drop the outermost brace. The generic repair cascade in jsonParser
 * rewrites commas before it balances brackets and corrupts compact keys, so this narrow pass
 * runs first: it scans string-aware, and only appends the closers the open stack still needs.
 *
 * Returns null when nothing is missing, when the text ends inside a string (a real truncation),
 * or when a closer does not match its opener — those cases stay with the generic repairs.
 */
export function closeUnbalancedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return null;
    }
  }

  if (inString || stack.length === 0) return null;
  const body = text.trimEnd().replace(/,$/, '');
  return body + stack.reverse().join('');
}
