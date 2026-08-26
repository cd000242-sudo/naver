import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describeTitleLength,
  judgeTitleLength,
  resolveTitleLengthRange,
} from '../content/titleLengthPolicy';

/**
 * [2026-08-27 사장님 실측] 홈판 글이 53자 제목으로 발행됐다.
 *   "전현무 나혼산 조작설 카자흐스탄 정부의 지원 발표와 사전에 섭외된 것 아니냐는 조작 의혹의 시작"
 *   evaluateTitleQuality 는 -60(42자 초과)을 정확히 매겨 29점을 줬는데도 그대로 나갔다.
 *
 * 두 가지가 겹쳤다.
 *   1. 길이 계약이 프롬프트 산문에만 있었고("28~42자 권장"), JSON 스키마 필드에는 없었다.
 *      이 코드베이스에서 산문 지시는 무시되고 스키마 필드는 지켜진다 —
 *      해시태그·요약표·사실 목록이 전부 같은 길을 지났다.
 *   2. 후보 선별은 3개 중 최고점만 고른다. 셋 다 길면 제일 나은 29점이 나간다.
 *
 * 값은 기존 평가기·프롬프트에서 그대로 옮겼다. 정책을 새로 정하지 않는다.
 */
describe('제목 길이 단일 출처', () => {
  it('모드별 범위가 기존 값과 같다', () => {
    expect(resolveTitleLengthRange('homefeed')).toEqual({ min: 28, max: 42 });
    expect(resolveTitleLengthRange('seo')).toEqual({ min: 25, max: 40 });
    expect(resolveTitleLengthRange('affiliate')).toEqual({ min: 28, max: 42 });
    expect(resolveTitleLengthRange('business')).toEqual({ min: 28, max: 42 });
  });

  it('모르는 모드는 가장 느슨한 범위를 준다 — 없는 규칙으로 막지 않는다', () => {
    const range = resolveTitleLengthRange('custom' as never);
    expect(range.max).toBeGreaterThanOrEqual(42);
  });

  it('사장님이 받은 53자 제목을 초과로 판정한다', () => {
    const verdict = judgeTitleLength(
      '전현무 나혼산 조작설 카자흐스탄 정부의 지원 발표와 사전에 섭외된 것 아니냐는 조작 의혹의 시작',
      'homefeed',
    );
    expect(verdict.status).toBe('over');
    expect(verdict.length).toBe(53);
  });

  it('범위 안이면 통과', () => {
    expect(judgeTitleLength('전현무 카자흐스탄 즉흥 여행 조작설, 무편집 영상이 뒤집었다', 'homefeed').status)
      .toBe('ok');
  });

  it('짧으면 under 로 가른다 — 초과와 다른 문제다', () => {
    expect(judgeTitleLength('전현무 조작설', 'homefeed').status).toBe('under');
  });

  it('빈 제목에도 던지지 않는다', () => {
    expect(() => judgeTitleLength('', 'homefeed')).not.toThrow();
    expect(() => judgeTitleLength(undefined as never, undefined as never)).not.toThrow();
  });

  it('스키마에 넣을 문구를 만든다', () => {
    expect(describeTitleLength('homefeed')).toContain('28');
    expect(describeTitleLength('homefeed')).toContain('42');
  });
});

describe('본선 배선', () => {
  it('JSON 스키마 제목 필드가 길이를 말한다 — 산문이 아니라 필드로', () => {
    const source = readFileSync(resolve(__dirname, '../contentJsonPromptFormat.ts'), 'utf-8');
    expect(source).toMatch(/describeTitleLength\(/);
  });

  it('후보 선별이 길이 계약을 본다 — 셋 다 길면 최고점이라도 계약 위반이다', () => {
    const source = readFileSync(resolve(__dirname, '../content/titleCandidateSelection.ts'), 'utf-8');
    expect(source).toMatch(/judgeTitleLength|isWithinTitleLength/);
  });
});
