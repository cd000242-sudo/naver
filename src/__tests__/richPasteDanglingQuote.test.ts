/**
 * richPasteDanglingQuote.test.ts
 *
 * [2026-07-03] LLM/원본이 인용부호를 줄바꿈으로 떼어놓으면("문장\n'") 리치입력이 닫는 따옴표를
 * 별도 단락으로 렌더해 발행물에 "'문장" / "'" 두 줄로 나오던 버그. 홀로 떨어진 따옴표를 인접
 * 텍스트에 다시 붙여 한 줄로 만드는지 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { buildMobileRichHtml } from '../automation/richTextPaste';

describe('리치입력 홀로 떨어진 인용부호 재결합', () => {
  it("닫는 따옴표가 다음 줄에 떨어져도 별도 단락으로 쪼개지 않는다 (straight ')", () => {
    const { html, plainText } = buildMobileRichHtml("'문장\n'");
    // 닫는 따옴표가 홀로 있는 단락이 없어야 한다
    expect(html).not.toMatch(/<p[^>]*>\s*<span[^>]*>['"‘’“”]<\/span>\s*<\/p>/);
    expect(plainText).not.toMatch(/\n\s*'\s*$/);
    expect(plainText).toContain("'문장'");
  });

  it("curly 따옴표(‘ ’)도 재결합한다", () => {
    const { plainText } = buildMobileRichHtml("‘사는 건 편한데 마음이 외롭다.\n’");
    expect(plainText).toContain("‘사는 건 편한데 마음이 외롭다.’");
    expect(plainText).not.toMatch(/\n\s*’\s*$/);
  });

  it("본문 중간에 낀 dangling 따옴표도 처리하고 나머지 단락은 보존한다", () => {
    const { plainText } = buildMobileRichHtml("그는 말했다.\n\n‘사는 건 편한데 마음이 외롭다.\n’\n\n그리고 침묵했다.");
    expect(plainText).toContain("‘사는 건 편한데 마음이 외롭다.’");
    expect(plainText).toContain('그는 말했다.');
    expect(plainText).toContain('그리고 침묵했다.');
  });

  it("정상 한 줄 인용은 불변(오탐 없음)", () => {
    const { plainText } = buildMobileRichHtml("그가 ‘문장’ 이라고 말했다");
    expect(plainText).toBe('그가 ‘문장’ 이라고 말했다');
  });

  // [2026-07-03] 실측 발행물 케이스: 닫는 큰따옴표(”)가 홀로 + 맨 아래 빈 "##"
  it("실측 케이스 — 닫는 큰따옴표 재결합 + 빈 ## 마커 제거", () => {
    const input = [
      '“호텔 앞까지는 오지 말아달라.',
      '”',
      '',
      '뷔의 부탁은 길지 않았습니다.',
      '',
      '그런데 함께 올라온 수면 기록을 보고 나면,',
      '이 말이 그냥 지나가는 당부처럼 들리지 않습니다.',
      '',
      '##',
    ].join('\n');
    const { html, plainText } = buildMobileRichHtml(input);
    // 닫는 큰따옴표가 앞 줄에 붙어 한 문장
    expect(plainText).toContain('“호텔 앞까지는 오지 말아달라.”');
    // 닫는 따옴표만 홀로 있는 단락 없음
    expect(html).not.toMatch(/<p[^>]*>\s*<span[^>]*>[”"’']<\/span>\s*<\/p>/);
    // 빈 ## 마커는 발행물에 리터럴로 남지 않음
    expect(plainText).not.toContain('##');
    expect(html).not.toContain('##');
    // 나머지 본문 보존
    expect(plainText).toContain('뷔의 부탁은 길지 않았습니다.');
    expect(plainText).toContain('당부처럼 들리지 않습니다.');
  });

  it("빈 ## / ### 단독 줄은 제거, #태그(공백없는 해시태그)는 보존", () => {
    expect(buildMobileRichHtml('본문\n\n##\n\n다음').plainText).not.toContain('##');
    expect(buildMobileRichHtml('###\n본문').plainText).not.toContain('###');
    expect(buildMobileRichHtml('#라이머 관련 이야기').plainText).toContain('#라이머');
  });
});
