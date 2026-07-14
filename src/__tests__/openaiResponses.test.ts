import { describe, expect, it } from 'vitest';
import {
  buildOpenAiSearchResponseParams,
  extractOpenAiResponseText,
  readOpenAiResponseUsage,
} from '../openaiResponses.js';

describe('OpenAI Responses web search integration', () => {
  it('uses a real GPT-5.6 model with the Responses web_search tool', () => {
    const params = buildOpenAiSearchResponseParams({
      model: 'gpt-5.6-terra',
      system: 'Follow the rules.',
      user: 'Find current facts.',
      maxOutputTokens: 4000,
    });

    expect(params.model).toBe('gpt-5.6-terra');
    expect(params.tools).toEqual([{ type: 'web_search' }]);
    expect(params).not.toHaveProperty('web_search_options');
  });

  it('extracts text and usage from the REST Responses envelope', () => {
    const payload = {
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"title":"ok"}' }],
      }],
      usage: { input_tokens: 42, output_tokens: 18 },
    };

    expect(extractOpenAiResponseText(payload)).toBe('{"title":"ok"}');
    expect(readOpenAiResponseUsage(payload)).toEqual({ inputTokens: 42, outputTokens: 18 });
  });
});
