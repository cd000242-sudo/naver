import { describe, expect, it } from 'vitest';

import {
  cleanJsonOutput,
  isPartialRecovery,
  PartialResponseError,
  safeParseJson,
} from '../jsonParser';

describe('jsonParser completeness (8th fallback removal)', () => {
  it('throws PartialResponseError instead of silently returning a single-field object', () => {
    // No quotes at all — cannot even reach the 7th-stage regex reconstruction.
    const brokenText = '제목: 셀토스 후기 … 본문 없음';

    expect(() => safeParseJson<unknown>(brokenText)).toThrow(PartialResponseError);

    try {
      safeParseJson<unknown>(brokenText);
      throw new Error('should not reach here');
    } catch (error) {
      expect(error).toBeInstanceOf(PartialResponseError);
      const partialError = error as PartialResponseError;
      expect(partialError.code).toBe('PARTIAL_RESPONSE');
      expect(partialError.stage).toBe('safeParseJson');
      expect(partialError.recovered).toBeUndefined();
    }
  });

  it('preserves a top-level JSON array instead of collapsing to the first object', () => {
    const arrayText = '```json\n[{"text":"A"},{"text":"B"}]\n```';
    const cleaned = cleanJsonOutput(arrayText);

    expect(cleaned).toBe('[{"text":"A"},{"text":"B"}]');
    expect(JSON.parse(cleaned)).toEqual([{ text: 'A' }, { text: 'B' }]);
  });

  it('preserves a top-level JSON array even with leading explanation text', () => {
    const arrayText = '결과:\n[{"title":"H1","score":1},{"title":"H2","score":2}]';
    const cleaned = cleanJsonOutput(arrayText);

    expect(JSON.parse(cleaned)).toEqual([
      { title: 'H1', score: 1 },
      { title: 'H2', score: 2 },
    ]);
  });

  it('still extracts a single JSON object unchanged (non-array case)', () => {
    const objectText = '```json\n{"selectedTitle":"제목"}\n```';
    const cleaned = cleanJsonOutput(objectText);

    expect(cleaned).toBe('{"selectedTitle":"제목"}');
  });

  it('flags 7th-stage regex reconstruction results as partial recovery', () => {
    // Leading prose breaks every structural parse attempt (stages 1-6), but
    // contains enough quoted "key": "value" pairs for the 7th-stage regex
    // reconstruction to succeed.
    const broken = '여기 이상한 응답 시작입니다 { "selectedTitle": "테스트 제목" "note": "괜찮음"';

    const result = safeParseJson<Record<string, unknown>>(broken);

    expect(isPartialRecovery(result)).toBe(true);
    expect((result as any).__recoveryStage).toBe(7);
    expect(result.selectedTitle).toBe('테스트 제목');
    // The marker must not be enumerable — it should not leak into
    // JSON.stringify or object-spread output.
    expect(Object.keys(result)).not.toContain('__partial');
    expect(JSON.stringify(result)).not.toContain('__partial');
  });

  it('isPartialRecovery returns false for a normal complete object', () => {
    expect(isPartialRecovery({ selectedTitle: '제목' })).toBe(false);
    expect(isPartialRecovery(null)).toBe(false);
    expect(isPartialRecovery(undefined)).toBe(false);
    expect(isPartialRecovery('not an object')).toBe(false);
  });

  it('parses a well-formed JSON object normally (regression guard)', () => {
    const good = '```json\n{"selectedTitle":"정상 제목","headings":[{"title":"H1","content":"내용"}]}\n```';
    const result = safeParseJson<Record<string, unknown>>(good);

    expect(result.selectedTitle).toBe('정상 제목');
    expect(isPartialRecovery(result)).toBe(false);
  });

  // [2026-09-22 live 제주 10월 가볼만한곳] The model wrote a raw quotation inside a string value
  // (대표는 "제주의 술은…"라며 "판로가…"고 전했습니다). The repair pass escaped the first stray
  // quote but then left "in-string" state, inverting quote parity for the rest of the document —
  // every stage failed and the article was lost. Two stray quote pairs must repair cleanly.
  it('repairs unescaped quotation marks inside string values without inverting quote parity', () => {
    const raw = '{"selectedTitle":"제주 10월 축제","headings":[{"title":"제주한잔","content":"조남희 대표는 "제주의 술은 귀한 콘텐츠"라며 "판로가 막힌 농산물도 가치를 발휘한다"고 전했습니다."}],"conclusion":"끝."}';
    const result = safeParseJson<{ selectedTitle: string; headings: Array<{ content: string }>; conclusion: string }>(raw);

    expect(result.selectedTitle).toBe('제주 10월 축제');
    expect(result.headings[0].content).toContain('"제주의 술은 귀한 콘텐츠"라며');
    expect(result.headings[0].content).toContain('"판로가 막힌 농산물도 가치를 발휘한다"고');
    expect(result.conclusion).toBe('끝.');
    expect(isPartialRecovery(result)).toBe(false);
  });
});
