import { describe, expect, it } from 'vitest';
import {
  isMaskedSecretValue,
  normalizeSecretConfig,
  stripSecretSchemaArtifacts,
} from '../security/secretValueUtils';

describe('secret value normalization', () => {
  it('strips schema artifacts without changing the usable key body', () => {
    expect(stripSecretSchemaArtifacts(' sk-test-[schema]-abc ')).toBe('sk-test-abc');
    expect(stripSecretSchemaArtifacts('{"value":"sk-json-schema-key"}')).toBe('sk-json-schema-key');
    expect(stripSecretSchemaArtifacts('AIza schema: RealKey123')).toBe('AIzaRealKey123');
  });

  it('detects display-only masked secret values', () => {
    expect(isMaskedSecretValue('sk-live-••••-tail')).toBe(true);
    expect(isMaskedSecretValue('sk-live-****-tail')).toBe(true);
    expect(isMaskedSecretValue('sk-live-real-tail')).toBe(false);
  });

  it('uses the previous real key when a masked value would overwrite it', () => {
    const { config, changed } = normalizeSecretConfig(
      { openaiApiKey: 'sk-live-••••-tail' },
      { openaiApiKey: 'sk-live-real-key' },
    );

    expect(changed).toBe(true);
    expect(config.openaiApiKey).toBe('sk-live-real-key');
  });

  it('normalizes Gemini rotation keys one by one', () => {
    const { config } = normalizeSecretConfig(
      { geminiApiKeys: ['AIza[schema]One', 'AIza-••••'] },
      { geminiApiKeys: ['', 'AIzaRealTwo'] },
    );

    expect(config.geminiApiKeys).toEqual(['AIzaOne', 'AIzaRealTwo']);
  });
});
