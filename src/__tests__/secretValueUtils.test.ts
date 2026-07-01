import { describe, expect, it } from 'vitest';
import {
  isMaskedSecretValue,
  normalizeSecretConfig,
  shouldPreserveSecretSchemaText,
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

  it('does not strip schema-looking text from Naver Client Secret fields', () => {
    expect(shouldPreserveSecretSchemaText('naverClientSecret')).toBe(true);
    expect(shouldPreserveSecretSchemaText('naverDatalabClientSecret')).toBe(true);
    expect(shouldPreserveSecretSchemaText('openaiApiKey')).toBe(false);

    const { config } = normalizeSecretConfig({
      naverClientSecret: ' client-secret-schema:RealTail ',
      naverDatalabClientSecret: 'client[스키마]secret',
      openaiApiKey: 'sk-test-[schema]-abc',
    });

    expect(config.naverClientSecret).toBe('client-secret-schema:RealTail');
    expect(config.naverDatalabClientSecret).toBe('client[스키마]secret');
    expect(config.openaiApiKey).toBe('sk-test-abc');
  });

  it('keeps the previous real Naver Client Secret when a masked value would overwrite it', () => {
    const { config } = normalizeSecretConfig(
      { naverClientSecret: '••••••' },
      { naverClientSecret: 'client-secret-schema:RealTail' },
    );

    expect(config.naverClientSecret).toBe('client-secret-schema:RealTail');
  });

  // [ByteString crash guard] a masked secret with no clean value to recover must be dropped to
  // empty so it can never reach an HTTP header and crash fetch. Consumers then throw a clean error.
  it('drops a masked secret to empty when no clean value is recoverable', () => {
    const { config, changed } = normalizeSecretConfig({ openaiApiKey: 'sk-live-••••-tail' });
    expect(changed).toBe(true);
    expect(config.openaiApiKey).toBe('');
  });

  it('drops a masked Naver Client Secret to empty (the ByteString crash scenario)', () => {
    const { config, changed } = normalizeSecretConfig({ naverClientSecret: 'abcd••••ef' });
    expect(changed).toBe(true);
    expect(config.naverClientSecret).toBe('');
  });

  it('drops masked Gemini rotation keys to empty while keeping clean ones', () => {
    const { config } = normalizeSecretConfig({ geminiApiKeys: ['AIzaCleanKey', 'AIza-••••'] });
    expect(config.geminiApiKeys).toEqual(['AIzaCleanKey', '']);
  });

  it('leaves a clean secret untouched (no false-positive drop)', () => {
    const { config, changed } = normalizeSecretConfig({ openaiApiKey: 'sk-live-real-key' });
    expect(changed).toBe(false);
    expect(config.openaiApiKey).toBe('sk-live-real-key');
  });
});
