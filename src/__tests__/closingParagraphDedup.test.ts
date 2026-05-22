/**
 * 회귀 가드 — 마무리 문단 중복 제거 (g 플래그 정규식 statefulness 버그)
 *
 * 버그: closingPatterns(/응원합니다/gi 등 g 플래그 정규식)를 .some(p => p.test(text))로
 *   연속 호출하면, g 플래그 정규식의 .test()가 lastIndex를 누적하기 때문에 두 번째
 *   문단에서 오탐(false)이 발생 → 중복 마무리 문단이 제거되지 않고 그대로 발행됐다.
 * 수정: .test() 호출 전 pattern.lastIndex = 0으로 리셋.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('마무리 중복 — g 플래그 .test() statefulness 버그', () => {
  // 스크린샷 재현: 두 문단 모두 "응원합니다!"로 끝나는 마무리 문단
  const para1 = '꼼꼼하게 준비한다면 분명 좋은 결과를 얻으실 수 있을 거예요. 여러분의 도전을 응원합니다!';
  const para2 = '응원합니다!'; // "응원합니다"가 para1보다 훨씬 앞 인덱스(0)

  it('[RED] lastIndex 리셋 없이 연속 .test()하면 두 번째 문단을 놓친다 (버그 재현)', () => {
    const patterns = [/응원합니다/gi]; // g 플래그 — 실제 closingPatterns와 동일
    // 리셋 없는 버그 방식 — 공유 정규식의 lastIndex가 호출 간 누적됨
    const buggyTest = (text: string): boolean => patterns.some((p) => p.test(text));
    expect(buggyTest(para1)).toBe(true);
    // para1 검사로 lastIndex가 문단 끝으로 이동 → para2의 "응원합니다"(index 0)를 놓침
    expect(buggyTest(para2)).toBe(false);
  });

  it('[GREEN] lastIndex 리셋 후 .test()하면 두 문단 모두 정확히 감지한다 (수정 방식)', () => {
    const patterns = [/응원합니다/gi];
    const safeTest = (text: string): boolean =>
      patterns.some((p) => {
        p.lastIndex = 0;
        return p.test(text);
      });
    expect(safeTest(para1)).toBe(true);
    expect(safeTest(para2)).toBe(true); // 리셋 덕분에 두 번째도 감지
  });
});

describe('정적 회귀 가드 — closingPatterns .test()는 lastIndex 리셋 필수', () => {
  const files = [
    'contentGenerator.ts',
    'automation/editorHelpers.ts',
    'naverBlogAutomation.ts',
  ];

  for (const file of files) {
    it(`${file} — lastIndex 리셋 없는 버그 패턴이 없다`, () => {
      const code = read(file);
      // 'closingPatterns.some(pattern => pattern.test(' — 리셋 없는 형태가 잔존하면 fail
      const buggy = code.match(/closingPatterns\.some\(pattern => pattern\.test\(/g);
      expect(buggy, `${file}에 lastIndex 리셋 없는 closingPatterns.test() 잔존`).toBeNull();
    });

    it(`${file} — closingPatterns .test()는 lastIndex = 0 리셋을 포함한다`, () => {
      const code = read(file);
      // closingPatterns를 .some + .test로 쓰는 곳이 있으면, lastIndex 리셋도 함께 있어야 함
      if (/closingPatterns\.some\([\s\S]{0,40}?\.test\(/.test(code)) {
        expect(code).toMatch(/pattern\.lastIndex = 0;\s*return pattern\.test\(/);
      }
    });
  }
});
