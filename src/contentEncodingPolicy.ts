export function fixUtf8Encoding(text: string): string {
  if (!text) return text;

  try {
    const buffer = Buffer.from(text, 'latin1');
    const utf8Text = buffer.toString('utf8');

    if (/[가-힣]/.test(utf8Text) && !utf8Text.includes('\ufffd')) {
      console.log('[인코딩 수정] latin1 → utf8 변환 성공');
      return utf8Text;
    }
  } catch {
    // Keep the original text when recovery fails.
  }

  try {
    const decoded = decodeURIComponent(escape(text));
    if (/[가-힣]/.test(decoded) && !decoded.includes('\ufffd')) {
      console.log('[인코딩 수정] 이중 인코딩 복구 성공');
      return decoded;
    }
  } catch {
    // Keep the original text when recovery fails.
  }

  return text;
}
