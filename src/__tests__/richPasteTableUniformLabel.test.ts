/**
 * richPasteTableUniformLabel.test.ts
 *
 * [2026-07-04] 요약 표의 왼쪽(항목) 열이 본문 행마다 같은 라벨("핵심"×3 등)로 반복되면
 * 정보가 0이고 어색하다(사용자 지적). markdownTableToHtml이 그 무의미 라벨 열을 드롭한다.
 * 첫 열이 서로 다른 비교표(제품명 등)는 모든 열을 보존(오탐 방지).
 */
import { describe, it, expect } from 'vitest';
import { buildMobileRichHtml } from '../automation/richTextPaste';

describe('요약 표 무의미 라벨 열 제거', () => {
  it('본문 첫 열이 전부 동일("핵심"×3)이면 그 열을 제거한다', () => {
    const md = [
      '| 항목 | 확인 포인트 |',
      '| --- | --- |',
      '| 핵심 | 방탄소년단 아르헨티나 공연 일정 정리 |',
      '| 핵심 | 아르헨티나 현지에서 위상이 대단 |',
      '| 핵심 | 명예 외빈 타이틀의 문화적 가치 |',
    ].join('\n');
    const { html, plainText } = buildMobileRichHtml(md);
    expect(html).not.toContain('핵심'); // 무의미 라벨 열 제거
    expect(plainText).not.toContain('핵심');
    expect(html).toContain('아르헨티나 공연'); // 내용 보존
    expect(html).toContain('확인 포인트'); // 헤더 보존
  });

  it('첫 열이 서로 다른 비교표는 모든 열을 보존한다 (오탐 방지)', () => {
    const md = [
      '| 제품 | 가격 |',
      '| --- | --- |',
      '| A폰 | 100만원 |',
      '| B폰 | 120만원 |',
    ].join('\n');
    const { html } = buildMobileRichHtml(md);
    expect(html).toContain('제품');
    expect(html).toContain('A폰');
    expect(html).toContain('B폰');
    expect(html).toContain('100만원');
  });
});
