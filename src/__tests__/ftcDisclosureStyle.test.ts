import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/** [2026-09-03 사장님] "공정위 문구는 19픽셀로 두껍게 중앙정렬로 빨간색상으로." 타이핑 대신 서식 HTML 붙여넣기. */
describe('공정위 문구 서식', () => {
  const src = readFileSync(resolve(__dirname, '..', 'automation', 'editorHelpers.ts'), 'utf-8').replace(/\r/g, '');

  it('19px · 굵게 · 가운데 · 빨강을 인라인 서식으로 못 박는다', () => {
    expect(src).toMatch(/FTC_DISCLOSURE_STYLE = 'text-align:center;font-size:19px;font-weight:700;color:#ff0000;/u);
  });

  it('도입부 있는 경로·없는 경로 둘 다 서식 삽입기를 쓴다 — 타이핑 직접 호출이 남지 않는다', () => {
    expect(src).toMatch(/await insertFtcDisclosureStyled\(self, page, ftcText\);/u);
    expect(src).toMatch(/await insertFtcDisclosureStyled\(self, page, ftcTextNoIntro\);/u);
    expect(src).not.toMatch(/await safeKeyboardType\(page, ftcText, \{ delay: 15 \}\);/u);
    expect(src).not.toMatch(/await safeKeyboardType\(page, ftcTextNoIntro, \{ delay: 15 \}\);/u);
  });

  it('붙여넣기가 실패하면 타이핑으로 내려간다 — 발행을 막지 않는다', () => {
    const fn = src.slice(src.indexOf('export async function insertFtcDisclosureStyled'), src.indexOf('// [2026-05-27] 에디터 진입 직후'));
    expect(fn).toMatch(/await safeKeyboardType\(page, clean, \{ delay: 15 \}\);/u);
    expect(fn).toMatch(/pasteRichHtmlAtCursor\(page, frame, html, clean, 0\)/u);
  });
});
