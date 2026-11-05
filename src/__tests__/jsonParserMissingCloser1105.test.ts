/**
 * [2026-11-05] 업체 홍보 샘플 6편 중 2편이 PARTIAL_RESPONSE 로 실패.
 *
 * The model answer was complete except for the outermost closing brace. safeParseJson then fell
 * into tryFixJson, whose aggressive comma recovery runs before the brace is appended and welds
 * commas onto compact keys ("selectedTitle," instead of "selectedTitle"), so title, headings and
 * body all looked missing. A response that only lacks trailing closers must parse untouched.
 */
import { describe, expect, it } from 'vitest';
import { safeParseJson } from '../jsonParser';
import { closeUnbalancedJson } from '../jsonBracketCloser';

// Same shape as the failing answers: a nested object first, then compact keys right after "},".
const FULL =
  '{"preWritingAnalysis":{"coreSubject":"교체 범위에 따라 비용이 갈리고, 공사는 3일에서 5일 걸린다."},' +
  '"selectedTitle":"수원 욕실 리모델링, 견적 전에 확인할 3가지","headings":[{"title":"덧방과 전체 철거, 무엇이 다를까?","content":"덧방은 2~3일, 철거는 4~5일 걸린다."}],' +
  '"introduction":"욕실 공사 상담을 받기 전에 알아두면 좋은 내용입니다.","hashtags":["수원욕실리모델링","욕실시공"],' +
  '"harmonyPacket":{"selfCheck":[{"note":"전화번호는 업체 정보 입력값에서만 가져왔다.","rule":"fact","affected":["headings"]}]}}';

const MISSING_ROOT = FULL.slice(0, -1); // drops the outermost "}"

describe('safeParseJson keeps keys intact when only trailing closers are missing', () => {
  it('parses the complete answer as-is (control)', () => {
    const parsed = safeParseJson<Record<string, unknown>>(FULL);
    expect(parsed.selectedTitle).toBe('수원 욕실 리모델링, 견적 전에 확인할 3가지');
  });

  it('recovers when the outermost brace is missing', () => {
    const parsed = safeParseJson<Record<string, any>>(MISSING_ROOT);
    expect(Object.keys(parsed).some((k) => k.includes(','))).toBe(false);
    expect(parsed.selectedTitle).toBe('수원 욕실 리모델링, 견적 전에 확인할 3가지');
    expect(parsed.headings).toHaveLength(1);
    expect(parsed.headings[0].content).toBe('덧방은 2~3일, 철거는 4~5일 걸린다.');
    expect(parsed.introduction).toContain('욕실 공사 상담');
    expect(parsed.hashtags).toEqual(['수원욕실리모델링', '욕실시공']);
  });

  it('recovers when several closers are missing', () => {
    const cut = FULL.slice(0, -4); // drops "}]}}"
    const parsed = safeParseJson<Record<string, any>>(cut);
    expect(parsed.selectedTitle).toBe('수원 욕실 리모델링, 견적 전에 확인할 3가지');
    expect(parsed.harmonyPacket.selfCheck[0].affected).toEqual(['headings']);
    expect(parsed.hashtags).toEqual(['수원욕실리모델링', '욕실시공']);
  });
});

describe('closeUnbalancedJson', () => {
  it('appends closers in nesting order and ignores brackets inside strings', () => {
    expect(closeUnbalancedJson('{"a":"{[ 괄호 ]","b":[1,{"c":2}')).toBe('{"a":"{[ 괄호 ]","b":[1,{"c":2}]}');
  });

  it('respects escaped quotes inside strings', () => {
    expect(closeUnbalancedJson('{"a":"say \\"{\\" ok","b":[1')).toBe('{"a":"say \\"{\\" ok","b":[1]}');
  });

  it('drops a dangling trailing comma before closing', () => {
    expect(closeUnbalancedJson('{"a":[1,2],  ')).toBe('{"a":[1,2]}');
  });

  it('returns null when nothing is missing, when cut inside a string, or when closers mismatch', () => {
    expect(closeUnbalancedJson('{"a":1}')).toBeNull();
    expect(closeUnbalancedJson('{"a":"잘린 문장')).toBeNull();
    expect(closeUnbalancedJson('{"a":[1}')).toBeNull();
    expect(closeUnbalancedJson('{"a":1}}')).toBeNull();
  });
});
