import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * [v2.11.140] 도입부 유실 회귀 잠금.
 *
 * 실측 버그: fillSemiAutoFields가 "도입부+소제목+마무리"로 재구성한 본문을
 * textarea(DOM)에만 넣고 structuredContent 객체에는 반영하지 않아,
 * saveGeneratedPost가 도입부 없는 stale bodyPlain을 저장 → 글 목록에서
 * 불러오면 제목과 1번 소제목 사이 도입부가 사라졌다.
 *
 * 수정 계약(소스 단언 — fillSemiAutoFields는 DOM 결합이 깊어 소스 계약으로 잠금):
 *  1. fillSemiAutoFields는 normalized 본문을 structuredContent.bodyPlain/content로
 *     되써야 하며(writeback), 이 재할당은 전역 저장(currentStructuredContent =)보다
 *     먼저 와야 한다.
 *  2. writeback은 _bodyReconstructedFromHeadings 플래그를 세팅해야 하고,
 *     editorHelpers의 heading.content 우선 게이트가 이 플래그를 인식해야 한다
 *     (bodyPlain에 소제목이 들어가며 bodyTextHasHeadingMarkers가 뒤집혀
 *     extractBodyForHeading 취약 경로+마무리 이중 타이핑으로 회귀하는 것 방지).
 */
describe('intro bodyPlain writeback contract (v2.11.140)', () => {
  const contentGenerationSource = readFileSync(
    resolve(__dirname, '../renderer/modules/contentGeneration.ts'),
    'utf8',
  );
  const editorHelpersSource = readFileSync(
    resolve(__dirname, '../automation/editorHelpers.ts'),
    'utf8',
  );

  it('fillSemiAutoFields writes the reconstructed body back into structuredContent', () => {
    expect(contentGenerationSource).toMatch(
      /structuredContent\s*=\s*\{\s*\.\.\.structuredContent,\s*bodyPlain:\s*normalized,\s*content:\s*normalized,/u,
    );
  });

  it('writeback happens before the global currentStructuredContent assignment', () => {
    const fnAt = contentGenerationSource.indexOf('export function fillSemiAutoFields');
    expect(fnAt).toBeGreaterThan(-1);
    const writebackAt = contentGenerationSource.indexOf('bodyPlain: normalized', fnAt);
    const globalAssignAt = contentGenerationSource.indexOf(
      'currentStructuredContent = structuredContent',
      fnAt,
    );
    expect(writebackAt).toBeGreaterThan(-1);
    expect(globalAssignAt).toBeGreaterThan(-1);
    expect(writebackAt).toBeLessThan(globalAssignAt);
  });

  it('writeback marks _bodyReconstructedFromHeadings when body came from headings', () => {
    expect(contentGenerationSource).toMatch(/_bodyReconstructedFromHeadings:\s*true/u);
  });

  it('editorHelpers keeps the heading.content-direct path for reconstructed bodies', () => {
    expect(editorHelpersSource).toMatch(
      /!bodyTextHasHeadingMarkers\s*\|\|\s*structured\._bodyReconstructedFromHeadings\s*===\s*true/u,
    );
  });
});
