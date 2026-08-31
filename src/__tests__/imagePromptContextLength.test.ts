import { describe, expect, it } from 'vitest';

import { getTranslationPrompt } from '../renderer/modules/promptTranslation';

/**
 * [2026-09-01] "소제목과 본문을 정확하게 분석하게끔 해야 되지 않니" — 사장님.
 *
 * 분석하라면서 본문을 버리고 있었다.
 *
 *   호출부(generateEnglishPromptForHeading)
 *     본문 900자 + 주제 280자로 컨텍스트를 만들어 넘긴다.
 *   지시문(getTranslationPrompt)
 *     compactImageContextText(contentContext, 300) 로 300자만 남기고 자른다.
 *
 * 앞 300자는 대개 도입 문장이라 그 섹션이 실제로 무엇을 다루는지가 잘려 나간다.
 * 이미지 모델은 소제목 한 줄만 보고 그리는 것과 다를 바 없어진다.
 *
 * 호출부가 이미 900자로 압축해 넘기므로, 여기서 다시 자를 이유가 없다.
 */
const LONG_CONTEXT = [
  'ARTICLE SUBJECT: 음식물처리기',
  'CURRENT SECTION EVIDENCE: '
    + '앞부분은 도입 문장으로 채워져 있습니다. '.repeat(24)
    + '핵심장면은 젖은 음식물 쓰레기가 바싹 마른 커피 가루 형태로 변하는 장면입니다.',
].join('\n');

describe('본문 맥락을 자르지 않는다', () => {
  it('300자 뒤에 있는 핵심 장면이 지시문에 살아 있다', () => {
    expect(LONG_CONTEXT.length).toBeGreaterThan(400);
    expect(getTranslationPrompt('음식물처리기 건조 성능', 'realistic', LONG_CONTEXT))
      .toContain('커피 가루');
  });

  it('소제목은 그대로 들어간다', () => {
    expect(getTranslationPrompt('음식물처리기 건조 성능', 'realistic', LONG_CONTEXT))
      .toContain('음식물처리기 건조 성능');
  });

  it('맥락이 없어도 지시문이 성립한다', () => {
    const prompt = getTranslationPrompt('가을 환절기 비염', 'realistic');
    expect(prompt).toContain('가을 환절기 비염');
    expect(prompt).not.toContain('CONTEXT: undefined');
  });
});
