import { describe, expect, it } from 'vitest';
import {
  materializeEditorBodyFallbackText,
  materializeEditorPlainFallbackText,
  normalizeEditorCtaText,
  normalizeEditorSubtitleText,
  normalizeEditorTitleText,
} from '../automation/editorWriterTextSemantics.js';

describe('SmartEditor writer text semantics SSOT', () => {
  it('materializes the exact title string typed by the writer', () => {
    expect(normalizeEditorTitleText('  수익\r\n100% 보장  ')).toBe('수익 100% 보장');
  });

  it('materializes the exact subtitle cleanup used by the quotation writer', () => {
    expect(normalizeEditorSubtitleText(' **## 제 2번째 소제목: 확인 사항 — ** '))
      .toBe('확인 사항');
  });

  it('materializes body fallback trimming and its one/two Enter newline semantics', () => {
    expect(materializeEditorBodyFallbackText('  첫 줄 \r\n 둘째 줄 \n\n  셋째 줄  '))
      .toBe('첫 줄\n둘째 줄\n\n셋째 줄');
  });

  it('materializes plain fallback repeats with the single Enter the writer actually presses', () => {
    expect(materializeEditorPlainFallbackText('첫 줄\n둘째 줄', 2))
      .toBe('첫 줄\n둘째 줄\n첫 줄\n둘째 줄');
  });

  it('shares CTA CR/LF cleanup with every CTA writer', () => {
    expect(normalizeEditorCtaText('  상담\r\n바로가기  ')).toBe('상담 바로가기');
  });
});
