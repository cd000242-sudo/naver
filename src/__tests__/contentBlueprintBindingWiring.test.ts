/** SPEC-BLUEPRINT-2026 Phase 3 — god file 배선 계약(소스 텍스트 핀). */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(__dirname, '../contentGenerator.ts'), 'utf8');

describe('설계도 필드 바인딩 배선', () => {
  it('도입부 패치는 설계도 readerSituation 을 받는다', () => {
    expect(source).toContain('readerSituation: string = \'\',');
    expect(source).toContain('- 독자 상황(설계도, 첫 문장은 이 장면에서 시작한다): ${readerSituation}');
    expect(source).toMatch(/introIssues,\s*blueprintReaderSituation,\s*\);/);
  });

  it('인용 삽입 보정은 본문 직접 인용 0 + 설계도 인용 존재 + 유료 보정 허용일 때만, 고른 엔진 라우트로 간다', () => {
    expect(source).toContain('if (allowPaidPostGenerationRepair && blueprintRoute && blueprintQuoteItems.length > 0');
    expect(source).toContain('if (countDirectQuotes(bodyForQuotes) === 0) {');
    expect(source).toContain('{ complete: blueprintRoute.callModel, log: (message) => console.log(message) }');
    expect(source).toContain('[Blueprint] 바인딩: 도입부 패치 ${blueprintIntroPatched} · 인용 삽입 ${blueprintQuoteInserted}');
  });
});
