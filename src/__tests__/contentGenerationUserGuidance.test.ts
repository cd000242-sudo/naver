import { describe, expect, it } from 'vitest';
import {
  buildGeminiEmptyResponseUserMessage,
  buildMissingBodyUserMessage,
  buildSensitiveTopicChatbotGuidance,
} from '../contentGenerationUserGuidance';

describe('contentGenerationUserGuidance', () => {
  it('explains celebrity rumor safety blocks in user-friendly wording', () => {
    const message = buildSensitiveTopicChatbotGuidance();

    expect(message).toContain('연예인 실명');
    expect(message).toContain('열애설');
    expect(message).toContain('루머');
    expect(message).toContain('AI 안전 필터');
  });

  it('tells users to use the site free chatbot for safer keywords', () => {
    const message = buildMissingBodyUserMessage();

    expect(message).toContain('사이트 무료 챗봇');
    expect(message).toContain('안전한 표현');
    expect(message).toContain('키워드');
  });

  it('keeps Gemini empty-response guidance actionable', () => {
    const message = buildGeminiEmptyResponseUserMessage('gemini-2.5-flash');

    expect(message).toContain('[gemini-2.5-flash]');
    expect(message).toContain('공식 확인 기준');
    expect(message).toContain('사이트 무료 챗봇');
    expect(message).toContain('Claude/OpenAI');
  });
});
