import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTypingStyleResetHtml } from '../automation/richTextPaste';

/** [2026-09-03 사장님] "공정위 문구는 19픽셀로 두껍게 중앙정렬로 빨간색상으로." 타이핑 대신 서식 HTML 붙여넣기. */
describe('공정위 문구 서식', () => {
  const src = readFileSync(resolve(__dirname, '..', 'automation', 'editorHelpers.ts'), 'utf-8').replace(/\r/g, '');

  // [2026-09-03 사장님 실측] 문단에 글자 서식을 박았더니 Enter 로 생긴 다음 문단이 물려받아 마지막 문단이 가운데 정렬,
  //   구분선·다음 글·해시태그가 빨갛게 나왔다. 정렬만 문단에, 글자 서식은 span 에, 뒤에 리셋 문단을 같이 붙인다.
  it('정렬은 문단, 19px · 굵게 · 빨강은 span 에만 — 문단이 글자 서식을 갖지 않는다', () => {
    expect(src).toMatch(/FTC_DISCLOSURE_PARAGRAPH_STYLE = 'text-align:center;/u);
    expect(src).not.toMatch(/FTC_DISCLOSURE_PARAGRAPH_STYLE = '[^']*(?:color|font-size|font-weight)/u);
    expect(src).toMatch(/FTC_DISCLOSURE_TEXT_STYLE = 'font-size:19px;font-weight:700;color:#ff0000;/u);
    expect(src).toMatch(/<span style="\$\{FTC_DISCLOSURE_TEXT_STYLE\}">/u);
  });

  it('공정위 문구 뒤에 본문 기본값 리셋 문단을 같이 붙인다 — 캐럿이 거기서 이어진다', () => {
    expect(src).toMatch(/buildFtcDisclosureHtml[^]*?\$\{buildTypingStyleResetHtml\(\)\}`;/u);
    const reset = buildTypingStyleResetHtml();
    expect(reset).toContain('data-rich-style-reset="true"');
    expect(reset).toContain('text-align:left');
    expect(reset).toContain('font-weight:400');
    expect(reset).toContain('color:#5f4b45');
    expect(reset).toContain('font-size:15px');
    expect(reset).toContain('\u200b');
    expect(reset).not.toMatch(/text-align:center|#ff0000|19px/u);
  });

  it('꼬리 타이핑(구분선·다음 글·해시태그) 앞에서도 서식을 리셋한다', () => {
    const cta = readFileSync(resolve(__dirname, '..', 'automation', 'ctaHelpers.ts'), 'utf-8').replace(/\r/g, '');
    const resetAt = cta.indexOf('pasteTypingStyleReset(page, tailFrame)');
    const dividerAt = cta.indexOf('// ✅ 2. 구분선 삽입');
    expect(resetAt).toBeGreaterThan(0);
    expect(dividerAt).toBeGreaterThan(resetAt);
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
