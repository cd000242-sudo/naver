import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { applyKeywordPrefixToTitle } from '../contentKeywordPrefix';
import { measureTitleWidth, resolveTitleLengthRange } from '../content/titleLengthPolicy';

/**
 * [2026-08-27 사장님 실측] 장동윤 결혼 글의 제목 후보가 전부 52~54자로 나왔다.
 *
 *   후보1 (52자) 장동윤 김승윤 결혼발표 장동윤 김승윤 10월 결혼 발표와 100% 사비…
 *   후보2 (53자) 장동윤 김승윤 결혼발표 자필 편지로 전한 장동윤의 10월 결혼…
 *   후보3 (54자) 장동윤 김승윤 결혼발표 15년 만의 대학 졸업에 이어…
 *
 * 셋 다 "장동윤 김승윤 결혼발표" 로 시작한다 — 키워드 접두사가 붙은 것이다.
 * 발행된 제목의 "결혼발표"·"결혼 발표" 중복도 여기서 나왔다.
 *
 * 길이 계약(홈판 28~42자)은 JSON 스키마와 후보 선별기에 넣어 뒀는데, 그 뒤에 도는
 * 접두사 정책이 자체 상한 70자를 들고 있었다. 계약이 마지막 단계에서 깨진 것이다.
 * 같은 축에 숫자가 둘이면 뒤에 있는 쪽이 이긴다 — 이 코드베이스가 반복해서 겪은 일이다.
 */
describe('접두사가 길이 계약을 깨지 않는다', () => {
  const KEYWORD = '장동윤 김승윤 결혼발표';
  const TITLE = '10월 결혼 발표와 100% 사비 제작 누룩 펀딩의 진실';

  // [2026-08-27] 예전에는 out.length(글자 수)로 단언했다. 상한을 폭으로 바꾼 뒤
  //   이 단언이 멀쩡한 제목을 실패로 만들었다 — 44자지만 35.5폭이라 계약 안이다.
  //   재는 단위가 바뀌면 단언도 같이 바뀌어야 한다.
  it('홈판 상한을 넘기면서까지 접두사를 붙이지 않는다', () => {
    const max = resolveTitleLengthRange('homefeed').max;
    const out = applyKeywordPrefixToTitle(TITLE, KEYWORD, { maxWidth: max });
    expect(measureTitleWidth(out)).toBeLessThanOrEqual(max);
  });

  it('폭 안에 들어오면 접두사를 붙이고 뒤를 자르지 않는다', () => {
    const max = resolveTitleLengthRange('homefeed').max;
    const out = applyKeywordPrefixToTitle(TITLE, KEYWORD, { maxWidth: max });
    expect(out).toContain('누룩 펀딩의 진실');
    expect(out).toContain('장동윤');
  });

  it('순한글로 넘치면 원래 제목을 지킨다 — 잘라내지 않는다', () => {
    const max = resolveTitleLengthRange('homefeed').max;
    const pureTitle = '무대에 오르기까지 걸린 시간과 그가 끝내 털어놓은 이야기의 전말';
    const out = applyKeywordPrefixToTitle(pureTitle, '장동윤 김승윤 결혼발표', { maxWidth: max });
    expect(out).toBe(pureTitle);
  });

  it('여유가 있으면 예전대로 붙인다', () => {
    const out = applyKeywordPrefixToTitle('펀딩의 진실', '장동윤', { maxWidth: 42 });
    expect(out).toContain('장동윤');
  });

  it('키워드가 이미 제목에 있으면 붙이지 않는다 — 기존 동작 유지', () => {
    const out = applyKeywordPrefixToTitle('장동윤 결혼 발표의 진실', '장동윤', { maxWidth: 42 });
    expect(out).toBe('장동윤 결혼 발표의 진실');
  });
});

describe('본선 배선', () => {
  const src = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');

  it('접두사 호출이 모드별 상한을 넘긴다', () => {
    expect(src).toMatch(/applyKeywordPrefixToStructuredContent\(\s*finalContent,\s*primaryKeyword,\s*\{[^}]*maxWidth/);
  });

  it('상한을 단일 출처에서 가져온다', () => {
    expect(src).toMatch(/resolveTitleLengthRange\(/);
  });
});
