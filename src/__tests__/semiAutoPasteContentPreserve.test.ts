/**
 * semiAutoPasteContentPreserve.test.ts
 *
 * [2026-07-02] Regression guard for the semi-auto paste pipeline in renderer.ts.
 *
 * Bug: pasting an external article into 반자동 편집 produced a post with only the
 * subheadings (+ a duplicated intro) — the section body paragraphs were lost.
 * Root cause: the paste handler built structuredContent.headings from TITLE strings
 * only (no `content`), so at publish time editorHelpers fell back to "bodyText 균등분배"
 * which duplicates the intro and drops the real section bodies.
 *
 * These are static source guards (the paste handler lives inside a renderer IIFE and is
 * not directly unit-testable) — same convention as sessionGateTimeout / publishRunLoginSkipGate.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const renderer = fs.readFileSync(
  path.resolve(__dirname, '../renderer/renderer.ts'),
  'utf-8',
);

describe('반자동 붙여넣기 본문(content) 보존 가드', () => {
  it('_applyParsed는 소제목에 본문 content를 붙여 조립한다 (제목만 map 하지 않음)', () => {
    // content 없는 옛 조립 패턴이 되살아나면 실패하도록 잠근다.
    expect(renderer).toContain('const extractedDocument = extractSemiAutoDocumentFromBody(semiAutoContent.value);');
    expect(renderer).toContain('const extractedWithContent = extractedDocument.headings;');
    // extractedWithContent를 기반으로 content를 실어 나르는지 확인
    expect(renderer).toMatch(/content:\s*h\.content/);
    expect(renderer).toContain("sc._manualStructureStrategy = 'body-sections'");
  });

  it('_syncSemiAutoManualHeadings는 제목이 같아도 content가 비면 재동기화한다', () => {
    expect(renderer).toContain('currentHasContent');
    expect(renderer).toMatch(/currentSignature === nextSignature && currentHasContent/);
  });

  it('제목 자동 채움: 상한 60자 + 문장형 첫 줄 제외', () => {
    expect(renderer).toContain('firstLineLooksSentence');
    expect(renderer).toMatch(/firstLine\.length <= 60/);
  });

  it('발행이 시작되면 늦게 도착한 비동기 paste 분류 결과를 폐기한다', () => {
    expect(renderer).toContain('__semiAutoPasteRevision');
    expect(renderer).toContain('isCurrentSemiAutoPasteRevision');
    expect(renderer).toContain('오래된 비동기 분류 결과 폐기');
  });
});
