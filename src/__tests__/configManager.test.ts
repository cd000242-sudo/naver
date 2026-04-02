import { describe, it, expect } from 'vitest';
import { validateApiKeyFormat } from '../configManager';

describe('validateApiKeyFormat', () => {
  describe('gemini keys', () => {
    it('accepts valid Gemini key', () => {
      const result = validateApiKeyFormat('AIzaSyD1234567890abcdefghijklmnop', 'gemini');
      expect(result.valid).toBe(true);
    });

    it('rejects key not starting with AIza', () => {
      const result = validateApiKeyFormat('sk-1234567890abcdefghijklmnop', 'gemini');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('AIza');
    });

    it('rejects key shorter than 30 chars', () => {
      const result = validateApiKeyFormat('AIzaShort', 'gemini');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('짧습니다');
    });
  });

  describe('empty/undefined keys', () => {
    it('rejects undefined key', () => {
      const result = validateApiKeyFormat(undefined, 'gemini');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('입력되지 않았습니다');
    });

    it('rejects empty string', () => {
      const result = validateApiKeyFormat('', 'openai');
      expect(result.valid).toBe(false);
    });

    it('rejects whitespace-only string', () => {
      const result = validateApiKeyFormat('   ', 'claude');
      expect(result.valid).toBe(false);
    });
  });

  describe('other key types', () => {
    it('accepts any non-empty OpenAI key (no prefix check)', () => {
      const result = validateApiKeyFormat('sk-proj-abcdefghijklmnopqrstuvwxyz', 'openai');
      expect(result.valid).toBe(true);
    });

    it('accepts any non-empty Pexels key', () => {
      const result = validateApiKeyFormat('abc123def456', 'pexels');
      expect(result.valid).toBe(true);
    });

    it('accepts any non-empty Claude key', () => {
      const result = validateApiKeyFormat('sk-ant-api03-abcdef', 'claude');
      expect(result.valid).toBe(true);
    });
  });

  describe('error message format', () => {
    it('includes "Gemini" in gemini error message', () => {
      const result = validateApiKeyFormat(undefined, 'gemini');
      expect(result.message).toContain('Gemini');
    });

    it('includes "OpenAI" in openai error message', () => {
      const result = validateApiKeyFormat(undefined, 'openai');
      expect(result.message).toContain('OpenAI');
    });

    it('includes "Pexels" in pexels error message', () => {
      const result = validateApiKeyFormat(undefined, 'pexels');
      expect(result.message).toContain('Pexels');
    });

    it('includes "Claude" in claude error message', () => {
      const result = validateApiKeyFormat(undefined, 'claude');
      expect(result.message).toContain('Claude');
    });
  });
});
