import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-08 사용자 실측] "비어있는 소제목 이미지 생성을 눌러 생성 완료가 떴는데 이미지가 없다."
 *
 * regenerateSingleImageForHeading 은 실패를 자기 catch 에서 삼키고 rethrow 하지 않는다
 * (429·타임아웃도 그렇게 지나간다). 그래서 루프는 언제나 정상 종료했고, 완료 문구는 결과를
 * 보지 않고 대상 개수(emptyHeadings.length)를 그대로 찍었다 — 0장이어도 "완료".
 *
 * 성공 판정은 대상 개수가 아니라 실제로 채워진 증가분이어야 한다.
 */
describe('비어있는 소제목 이미지 생성 — 완료 판정', () => {
  const source = read('renderer/modules/headingImageGen.ts');

  /** 생성 버튼 핸들러 본문만 잘라낸다 (수집 버튼과 섞이지 않게). */
  function generateHandlerBlock(): string {
    const start = source.indexOf('// ✅ 비어있는 소제목만 이미지 생성 버튼');
    const end = source.indexOf('// ✅ 비어있는 소제목만 이미지 수집 버튼');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('대상 선별과 완료 판정이 같은 기준(headingHasUsableImage)을 본다', () => {
    expect(source).toMatch(/const headingHasUsableImage = \(headingTitle: string\): boolean =>/);
    const block = generateHandlerBlock();
    // 선별
    expect(block).toMatch(/return !headingHasUsableImage\(headingTitle\)/);
    // 판정
    expect(block).toMatch(/const filledCount = emptyHeadings\.filter\(/);
    expect(block).toMatch(/headingHasUsableImage\(String\(h\?\.title \|\| h\?\.heading \|\| ''\)\)/);
  });

  it('성공 보고가 대상 개수가 아니라 실제 채워진 수를 쓴다 (회귀 잠금)', () => {
    const block = generateHandlerBlock();
    expect(block).toMatch(/successLog: `✅ \$\{filledCount\}개 이미지 생성 완료!`/);
    // 대상 개수를 성공 문구로 쓰던 옛 형태로 돌아가면 안 된다.
    expect(block).not.toMatch(/successLog: `✅ \$\{emptyHeadings\.length\}개 이미지 생성 완료!`/);
  });

  it('0장이면 실패로 보고한다', () => {
    const block = generateHandlerBlock();
    expect(block).toMatch(/if \(filledCount === 0\) \{/);
    expect(block).toMatch(/이미지가 한 장도 생성되지 않았습니다/);
    expect(block).toMatch(/failureTitle: '이미지 생성 실패'/);
  });

  it('일부만 생성되면 성공으로 뭉개지 않는다', () => {
    const block = generateHandlerBlock();
    expect(block).toMatch(/const failedCount = emptyHeadings\.length - filledCount;/);
    expect(block).toMatch(/failureTitle: '일부만 생성됨'/);
  });

  it('complete(true) 는 실패 0건일 때만 도달한다', () => {
    const block = generateHandlerBlock();
    const successIndex = block.indexOf('complete(true');
    const elseIndex = block.lastIndexOf('} else {', successIndex);
    expect(successIndex).toBeGreaterThan(-1);
    // 성공 분기는 filledCount === 0 / failedCount > 0 두 분기를 지난 else 안에 있어야 한다.
    expect(elseIndex).toBeGreaterThan(block.indexOf('failedCount > 0'));
  });
});
