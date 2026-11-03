/**
 * [2026-11-03] 고객: "개인 프롬프트 체크하고 내 프롬프트를 넣어 글을 생성해도 적용이 안 된다".
 * A free-form personal prompt ("친근한 말투로…") yields no checklist items, so it only appeared once, in the middle,
 * before thousands of characters of source text and rules. It is now repeated at the end, right before the
 * evidence contract (which stays last).
 */
import { describe, expect, it } from 'vitest';
import { buildCustomPromptReminderBlock, buildRequestChecklistBlock } from '../contentRequestSections';
import { buildModeBasedPrompt } from '../contentGenerator';

const FREE_FORM = '친근한 반말 대신 존댓말로, 소제목은 꼭 5개로 써 주세요. 마지막에 체크리스트를 넣어 주세요.';

describe('personal prompt reminder block', () => {
  it('repeats a free-form prompt that the checklist cannot parse', () => {
    expect(buildRequestChecklistBlock(FREE_FORM)).toBe('');
    const block = buildCustomPromptReminderBlock(FREE_FORM);
    expect(block).toContain('[사용자 개인 프롬프트 재확인');
    expect(block).toContain(FREE_FORM);
    expect(block).toContain('근거 · 사실을 지키는 규칙은 예외');
  });

  it('is empty without a personal prompt', () => {
    expect(buildCustomPromptReminderBlock(undefined)).toBe('');
    expect(buildCustomPromptReminderBlock('   ')).toBe('');
  });

  it('cuts a very long prompt at 2000 characters and points back to the full text', () => {
    const long = '가'.repeat(2500);
    const block = buildCustomPromptReminderBlock(long);
    expect(block).toContain('가'.repeat(2000));
    expect(block).not.toContain('가'.repeat(2001));
    expect(block).toContain('위 [사용자 추가 지시사항] 전문을 그대로 따른다');
  });
});

describe('the final prompt shows the personal prompt again near the end', () => {
  const source = (customPrompt?: string) => ({
    sourceType: 'custom_text' as const,
    rawText: '가을 단풍 명소를 소개하는 자료입니다. '.repeat(40),
    title: '가을 단풍 명소',
    contentMode: 'seo' as const,
    ...(customPrompt ? { customPrompt } : {}),
  });

  it('SEO mode: the free-form prompt appears twice, the second time after the source text', () => {
    const prompt = buildModeBasedPrompt(source(FREE_FORM) as any, 'seo' as any, undefined, 1800);
    const first = prompt.indexOf(FREE_FORM);
    const reminder = prompt.indexOf('[사용자 개인 프롬프트 재확인');
    expect(first).toBeGreaterThan(-1);
    expect(reminder).toBeGreaterThan(first);
    expect(prompt.indexOf(FREE_FORM, reminder)).toBeGreaterThan(reminder);
  });

  it('without a personal prompt there is no reminder block', () => {
    const prompt = buildModeBasedPrompt(source() as any, 'seo' as any, undefined, 1800);
    expect(prompt).not.toContain('[사용자 개인 프롬프트 재확인');
  });
});
