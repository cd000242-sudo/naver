import { describe, expect, it } from 'vitest';

import { buildCustomModeOverridePrompt } from '../contentCustomModePrompt';

describe('contentCustomModePrompt', () => {
  it('places the user prompt above quality guardrails and keeps strict JSON output', () => {
    const prompt = buildCustomModeOverridePrompt({
      customPrompt: '표를 넣고 부드러운 말투로 작성해주세요.',
      toneStyle: 'friendly',
    });

    expect(prompt).toContain('[최우선] 사용자 요청 프롬프트');
    expect(prompt).toContain('표를 넣고 부드러운 말투로 작성해주세요.');
    expect(prompt).toContain('사용자 요청과 충돌 시 사용자 요청이 우선');
    expect(prompt).toContain('자료 외 사실 작성 금지');
    expect(prompt).toContain('거짓 경험 금지');
    expect(prompt).toContain('모바일 가독성');
    expect(prompt).toContain('"selectedTitle"');
    expect(prompt).toContain('"hashtags"');
    expect(prompt).toContain('순수 JSON만 출력');
  });

  it('falls back to a safe friendly tone when the selected tone is missing', () => {
    const prompt = buildCustomModeOverridePrompt({
      customPrompt: '사용자 요청',
      toneStyle: '',
    });

    expect(prompt).toContain('【글톤: friendly】');
    expect(prompt).toContain('친근한 톤');
  });
});
