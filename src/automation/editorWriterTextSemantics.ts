/**
 * Pure SSOT for the strings SmartEditor writers actually materialize.
 * The commit ledger records writer return values, never pre-writer inputs.
 */

export function normalizeEditorTitleText(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function normalizeEditorCtaText(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function normalizeEditorSubtitleText(raw: unknown): string {
  const original = String(raw ?? '');
  let text = original.trim();
  if (!text) return '';

  text = text.replace(/\*\*/g, '');
  text = text.replace(/^#+\s*/, '');
  text = text.replace(/^\s*(?:제\s*)?\d+\s*번째\s*소제목\s*[:：]\s*/i, '');
  text = text.replace(
    /^\s*(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째\s*소제목\s*[:：]\s*/i,
    '',
  );
  text = text.replace(/^\s*소제목\s*[:：]\s*/i, '');
  text = text.replace(
    /^(?:[•\-–—*]\s*)?(?:제\s*\d+\s*장\s*|STEP\s*\d+\s*|Step\s*\d+\s*|[①-⑳]\s*|\d{1,2}[).]\s*)/i,
    '',
  );
  text = text.replace(/[\s\-–—:|·•,]+$/g, '').trim();
  text = text.replace(/\s+/g, ' ').trim();
  return text || original.trim();
}

export function materializeEditorBodyFallbackText(value: unknown): string {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .map(paragraph => paragraph
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

export function materializeEditorPlainFallbackText(
  value: unknown,
  lines: number,
): string {
  const content = String(value ?? '');
  const repeatCount = Math.max(1, lines || 1);
  return Array.from({ length: repeatCount }, () => content).join('\n');
}
