import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  planTypingFallback,
  sliceParagraphFromNormalizedOffset,
  splitFallbackParagraphs,
} from '../automation/typingFallbackPlan';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-29] 타이핑 폴백 근본 픽스 잠금 (라이브 물증: 224358415828).
 *
 * 증상: 리치 붙여넣기 실패 → 폴백이 (1) 22자 청킹 없는 AI 원본을 타이핑하고
 * (2) 롤백 미확증으로 이미 들어간 내용 위에 섹션 전체를 다시 타이핑해
 * 같은 문단이 두 번 + 비청킹 사본 + "…보관둘째" 접합이 발행됐다.
 */
describe('typing fallback duplicate guard', () => {
  const expected = [
    '첫 문단 첫 줄입니다\n첫 문단 둘째 줄입니다',
    '둘째 문단은 실제 지급 경로를\n대조하는 내용입니다',
    '셋째 문단은 오류 문구와 확인\n시각을 보관하라는 내용입니다',
  ].join('\n\n');

  it('전량 존재 → skip (재타이핑 생략)', () => {
    const editorTail = '소제목입니다 첫 문단 첫 줄입니다 첫 문단 둘째 줄입니다 둘째 문단은 실제 지급 경로를 대조하는 내용입니다 셋째 문단은 오류 문구와 확인 시각을 보관하라는 내용입니다';
    const plan = planTypingFallback(expected, editorTail);
    expect(plan.mode).toBe('skip');
  });

  it('전무 → full (전체 타이핑)', () => {
    const plan = planTypingFallback(expected, '소제목만 있는 상태');
    expect(plan.mode).toBe('full');
    expect(plan.startParagraphIndex).toBe(0);
  });

  it('앞 문단만 존재 → 다음 문단부터 resume (중복 재타이핑 금지)', () => {
    const editorTail = '소제목 첫 문단 첫 줄입니다 첫 문단 둘째 줄입니다';
    const plan = planTypingFallback(expected, editorTail);
    expect(plan.mode).toBe('resume');
    expect(plan.startParagraphIndex).toBe(1);
    expect(plan.firstParagraphCharOffset).toBe(0);
  });

  it('문단 중간 절단 → 절단 지점부터 이어치기 (라이브 "보관둘째" 케이스)', () => {
    const editorTail = '첫 문단 첫 줄입니다 첫 문단 둘째 줄입니다 둘째 문단은 실제 지급 경로를';
    const plan = planTypingFallback(expected, editorTail);
    expect(plan.mode).toBe('resume');
    expect(plan.startParagraphIndex).toBe(1);
    expect(plan.firstParagraphCharOffset).toBeGreaterThan(0);
    const remainder = sliceParagraphFromNormalizedOffset(
      splitFallbackParagraphs(expected)[1],
      plan.firstParagraphCharOffset,
    );
    expect(remainder).toBe('대조하는 내용입니다');
  });

  it('청킹 줄바꿈(\\n)과 에디터 공백 차이는 정규화로 흡수한다', () => {
    const editorTail = '첫 문단 첫 줄입니다\n첫 문단 둘째 줄입니다\n\n둘째 문단은 실제 지급 경로를\n대조하는 내용입니다';
    const plan = planTypingFallback(expected, editorTail);
    expect(plan.mode).toBe('resume');
    expect(plan.startParagraphIndex).toBe(2);
  });

  it('sliceParagraphFromNormalizedOffset: 원문 개행을 보존한 잔여 반환', () => {
    expect(sliceParagraphFromNormalizedOffset('가나다 라마\n바사아', 0)).toBe('가나다 라마\n바사아');
    expect(sliceParagraphFromNormalizedOffset('가나다 라마\n바사아', 7)).toBe('바사아');
  });

  it('폴백 소스는 22자 청킹된 rich.plainText — AI 원본 직타이핑 금지 (소스 계약)', () => {
    const editorHelpers = read('automation/editorHelpers.ts');
    expect(editorHelpers).toMatch(/expectedFallbackSource = rich\.plainText && rich\.plainText\.trim\(\)\.length > 0\s*\?\s*rich\.plainText/);
    expect(editorHelpers).toContain('planTypingFallback(expectedFallbackSource, editorTailForPlan)');
    // skip 모드가 존재하고, resume 문단 경계에서 접합 방지 Enter가 선행된다
    expect(editorHelpers).toContain('[폴백 중복가드]');
    expect(editorHelpers).toMatch(/mode === 'skip'[\s\S]{0,400}return expectedFallbackSource/);
  });
});
