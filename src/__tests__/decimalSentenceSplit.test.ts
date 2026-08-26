import { describe, expect, it } from 'vitest';

import { removeDuplicateHeadings } from '../contentDuplicateCleanup';

/**
 * [2026-08-27 사장님 실측] "이거 문단정리 어색해. 이런 게 네이버봇에 걸리면 AI 티가 난다고."
 *
 * 화면에는 이렇게 나왔다.
 *   가장 무거운 볼링공이 16파운드(약
 *                                    ← 빈 문단
 *   7. 2kg) 정도인데, 서인영은 무려
 *
 * 소수점이 문장 종결로 오인돼 "7.2kg" 이 "7. 2kg" 으로 벌어졌고, 그 뒤 붙여넣기가
 * 벌어진 자리를 문장 끝으로 보고 문단까지 갈랐다. 한 문장이 두 문단이 됐다.
 *
 * 뿌리는 중복 문장 제거기다.
 *   문단을 마침표로 쪼개고(공백 유무를 안 따진다) → "7" 과 "2kg" 이 되고
 *   남은 문장을 ". " 로 다시 붙인다        → "7. 2kg" 이 된다
 *
 * 앞선 글들에도 같은 자국이 있었다 — "10. 8km/L", "30. 6kgf·m", "4. 50%", "47. 2억원".
 * 사장님 말씀대로 사람은 이렇게 쓰지 않는다.
 */
describe('소수점은 문장 끝이 아니다', () => {
  // headings 가 비면 함수가 즉시 반환한다 — 재조립 경로를 타려면 하나는 있어야 한다.
  const HEADINGS = [{ title: '소제목' }] as never;
  // 중복 문장이 있어야 재조립 경로를 탄다 — 중복이 없으면 원문을 그대로 보존한다.
  const withDuplicate = (body: string) => `${body} 같은 말을 또 적는다. 같은 말을 또 적는다.`;

  it('소수점이 벌어지지 않는다', () => {
    const out = removeDuplicateHeadings(
      withDuplicate('볼링공이 16파운드(약 7.2kg) 정도인데 두 개면 15kg이다.'), HEADINGS,
    );
    expect(out).toContain('7.2kg');
    expect(out).not.toMatch(/7\.\s+2kg/);
  });

  it('실측된 다른 자국들도 지킨다', () => {
    for (const value of ['10.8km', '30.6kgf', '4.50%', '47.2억원', '13.42%']) {
      const out = removeDuplicateHeadings(withDuplicate(`수치는 ${value} 수준이다.`), HEADINGS);
      expect(out).toContain(value);
    }
  });

  it('진짜 문장 끝은 그대로 나눈다', () => {
    const out = removeDuplicateHeadings('첫 문장이다. 둘째 문장이다. 둘째 문장이다.', HEADINGS);
    expect(out).toContain('첫 문장이다');
    expect(out).toContain('둘째 문장이다');
  });

  it('중복이 없으면 원문을 건드리지 않는다', () => {
    const text = '볼링공이 16파운드(약 7.2kg) 정도인데 두 개면 15kg이다.';
    expect(removeDuplicateHeadings(text, HEADINGS)).toBe(text);
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => removeDuplicateHeadings(null as never, [])).not.toThrow();
  });
});
