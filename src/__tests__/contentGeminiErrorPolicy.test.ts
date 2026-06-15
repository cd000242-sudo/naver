import { describe, expect, it } from 'vitest';
import { translateGeminiError } from '../contentGeminiErrorPolicy';

describe('contentGeminiErrorPolicy', () => {
  it('explains invalid or expired Gemini API keys with the original detail attached', () => {
    const result = translateGeminiError('API key expired for this project');

    expect(result).toContain('Gemini API키가 만료됨');
    expect(result).toContain('API key expired for this project');
  });

  it('separates blocked free-tier model errors from generic RPM waits', () => {
    const result = translateGeminiError('429 quota exceeded generate_content_free_tier_requests limit: 0');

    expect(result).toContain('무료 사용이 차단');
    expect(result).toContain('유료');
    expect(result).toContain('limit: 0');
  });

  it('translates generic rate limits as temporary RPM waits', () => {
    const result = translateGeminiError('429 Too Many Requests resource exhausted');

    expect(result).toContain('분당 요청 한도 초과');
    expect(result).toContain('1~2분');
  });

  it('keeps network failures actionable and asks for a screenshot', () => {
    const result = translateGeminiError('fetch failed getaddrinfo ENOTFOUND generativelanguage.googleapis.com');

    expect(result).toContain('네트워크 연결 실패');
    expect(result).toContain('백신/방화벽');
    expect(result).toContain('캡처');
  });

  it('keeps safety policy blocks distinguishable from generic Gemini failures', () => {
    const result = translateGeminiError('response blocked by SAFETY content policy');

    expect(result).toContain('콘텐츠 정책 위반');
    expect(result).toContain('프롬프트를 수정');
  });

  it('falls back to the full raw message when classification is unknown', () => {
    const result = translateGeminiError('unexpected provider payload shape');

    expect(result).toContain('Gemini 오류 (분류 안 됨)');
    expect(result).toContain('unexpected provider payload shape');
    expect(result).toContain('캡처');
  });
});
