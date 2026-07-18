import { describe, expect, it } from 'vitest';
import {
  normalizeMcpConnectionProfiles,
  normalizeGenerationConnectionSettings,
  resolveMcpTextOverride,
  type PersistedGenerationConnectionSettings,
} from '../generation/connectionConfig';

describe('generation connection settings', () => {
  it('keeps only validated non-secret MCP profile metadata', () => {
    const input = [{
      profileId: 'local-writer',
      connectorId: 'local-mcp',
      transport: 'stdio',
      fallbackPolicy: 'manual-only',
      tools: [{
        routeId: 'local-writer-text',
        toolId: 'write_post',
        capability: 'text.generate',
        billingKind: 'local-compute',
      }],
    }];

    const result = normalizeMcpConnectionProfiles(input);

    expect(result.changed).toBe(false);
    expect(result.profiles).toEqual(input);
    expect(Object.isFrozen(result.profiles)).toBe(true);
    expect(Object.isFrozen(result.profiles[0])).toBe(true);
  });

  it('rejects MCP public metadata that attempts to carry runtime secrets', () => {
    const result = normalizeMcpConnectionProfiles([{
      profileId: 'unsafe',
      connectorId: 'unsafe',
      transport: 'stdio',
      fallbackPolicy: 'manual-only',
      command: 'node',
      tools: [{
        routeId: 'unsafe-text',
        toolId: 'write_post',
        capability: 'text.generate',
        billingKind: 'unknown',
      }],
    }]);

    expect(result.changed).toBe(true);
    expect(result.profiles).toEqual([]);
  });

  it('migrates a legacy Codex selection into an immutable manual-only text route', () => {
    const result = normalizeGenerationConnectionSettings(undefined, {
      primaryGeminiTextModel: 'agent-codex',
      defaultAiProvider: 'agent-codex',
    });

    expect(result.changed).toBe(true);
    expect(result.settings).toMatchObject({
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'agent-codex-text',
        mode: 'agent',
        connectorId: 'agent-codex',
        capability: 'text.generate',
        toolOrModelId: 'codex',
        billingKind: 'subscription',
      },
      image: undefined,
      vision: undefined,
    });
    expect(Object.isFrozen(result.settings)).toBe(true);
    expect(Object.isFrozen(result.settings.text)).toBe(true);
  });

  it('keeps independently selected text and image routes without auto fallback', () => {
    const saved: PersistedGenerationConnectionSettings = {
      version: 1,
      fallbackPolicy: 'automatic' as never,
      text: {
        routeId: 'mcp-codex-text',
        mode: 'mcp',
        connectorId: 'codex-mcp',
        capability: 'text.generate',
        toolOrModelId: 'generate_text',
        billingKind: 'subscription',
      },
      image: {
        routeId: 'agent-dropshot-image',
        mode: 'agent',
        connectorId: 'dropshot-browser',
        capability: 'image.generate.text',
        toolOrModelId: 'dropshot',
        billingKind: 'subscription',
      },
    };

    const result = normalizeGenerationConnectionSettings(saved, {});

    expect(result.changed).toBe(true);
    expect(result.settings.fallbackPolicy).toBe('manual-only');
    expect(result.settings.text.mode).toBe('mcp');
    expect(result.settings.image).toMatchObject({
      mode: 'agent',
      connectorId: 'dropshot-browser',
    });
  });

  it('exposes only an explicit MCP text route as an execution override', () => {
    const mcpSettings = normalizeGenerationConnectionSettings({
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'mcp-writer-text',
        mode: 'mcp',
        connectorId: 'mcp-writer',
        capability: 'text.generate',
        toolOrModelId: 'write_post',
        billingKind: 'subscription',
      },
    }, {}).settings;
    const apiSettings = normalizeGenerationConnectionSettings(undefined, {
      primaryGeminiTextModel: 'gemini-3.1-flash-lite',
      defaultAiProvider: 'gemini',
    }).settings;

    expect(resolveMcpTextOverride(mcpSettings)).toBe(mcpSettings.text);
    expect(resolveMcpTextOverride(apiSettings)).toBeUndefined();
    expect(resolveMcpTextOverride(undefined)).toBeUndefined();
  });

  it('rejects malformed persisted routes and never invents an image route', () => {
    const result = normalizeGenerationConnectionSettings({
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'bad-text',
        mode: 'api',
        connectorId: 'openai-api',
        capability: 'image.generate.text',
        toolOrModelId: 'gpt',
        billingKind: 'metered-api',
      },
      image: {
        routeId: 'bad-image',
        mode: 'mcp',
        connectorId: '',
        capability: 'image.generate.text',
        toolOrModelId: 'image',
        billingKind: 'unknown',
      },
    }, {
      primaryGeminiTextModel: 'gemini-3.1-flash-lite',
      defaultAiProvider: 'gemini',
    });

    expect(result.changed).toBe(true);
    expect(result.settings.text).toMatchObject({
      mode: 'api',
      connectorId: 'gemini-api',
      toolOrModelId: 'gemini-3.1-flash-lite',
    });
    expect(result.settings.image).toBeUndefined();
  });

  it('clones persisted settings so callers cannot change a future run route in place', () => {
    const saved: PersistedGenerationConnectionSettings = {
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'api-openai-text',
        mode: 'api',
        connectorId: 'openai-api',
        capability: 'text.generate',
        toolOrModelId: 'gpt-5.6-terra',
        billingKind: 'metered-api',
      },
    };

    const result = normalizeGenerationConnectionSettings(saved, {});
    saved.text.connectorId = 'unexpected';

    expect(result.changed).toBe(false);
    expect(result.settings.text.connectorId).toBe('openai-api');
  });

  it.each([
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro-preview',
  ])('coerces persisted prepaid Gemini text route %s to the safe Flash-Lite model', (selectedModel) => {
    const result = normalizeGenerationConnectionSettings({
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'api-gemini-text',
        mode: 'api',
        connectorId: 'gemini-api',
        capability: 'text.generate',
        toolOrModelId: selectedModel,
        billingKind: 'metered-api',
      },
    }, {});

    expect(result.changed).toBe(true);
    expect(result.settings.text).toMatchObject({
      routeId: 'api-gemini-text',
      connectorId: 'gemini-api',
      toolOrModelId: 'gemini-3.1-flash-lite',
    });
  });

  it('preserves an explicit stable Flash route because prepaid billing supports it', () => {
    const result = normalizeGenerationConnectionSettings({
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'api-gemini-text',
        mode: 'api',
        connectorId: 'gemini-api',
        capability: 'text.generate',
        toolOrModelId: 'gemini-3.5-flash',
        billingKind: 'metered-api',
      },
    }, {});

    expect(result.changed).toBe(false);
    expect(result.settings.text.toolOrModelId).toBe('gemini-3.5-flash');
  });

  it('keeps an explicit non-Gemini text route instead of silently falling back to Gemini', () => {
    const result = normalizeGenerationConnectionSettings({
      version: 1,
      fallbackPolicy: 'manual-only',
      text: {
        routeId: 'api-openai-text',
        mode: 'api',
        connectorId: 'openai-api',
        capability: 'text.generate',
        toolOrModelId: 'gpt-5.6-terra',
        billingKind: 'metered-api',
      },
    }, {});

    expect(result.changed).toBe(false);
    expect(result.settings.text).toMatchObject({
      routeId: 'api-openai-text',
      connectorId: 'openai-api',
      toolOrModelId: 'gpt-5.6-terra',
    });
  });
});
