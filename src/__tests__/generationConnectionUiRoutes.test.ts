import { describe, expect, it } from 'vitest';
import {
  createNonMcpUiRoute,
  createMcpUiRoute,
  mergeUiRouteSettings,
  resolveLegacyImageStorageValue,
} from '../renderer/modules/generationConnectionUI';

describe('generation connection UI route mapping', () => {
  it('maps agent and API choices to exact text routes', () => {
    expect(createNonMcpUiRoute('text', 'agent', 'agent-claude')).toEqual(expect.objectContaining({
      mode: 'agent',
      connectorId: 'agent-claude',
      toolOrModelId: 'claude',
      capability: 'text.generate',
    }));
    expect(createNonMcpUiRoute('text', 'api', 'gemini-3.1-flash-lite')).toEqual(expect.objectContaining({
      mode: 'api',
      connectorId: 'gemini-api',
      toolOrModelId: 'gemini-3.1-flash-lite',
    }));
  });

  it('maps image choices to the exact legacy engine identifier', () => {
    expect(createNonMcpUiRoute('image', 'agent', 'dropshot')).toEqual(expect.objectContaining({
      mode: 'agent',
      connectorId: 'agent-dropshot',
      toolOrModelId: 'dropshot',
      capability: 'image.generate.reference',
    }));
    expect(createNonMcpUiRoute('image', 'api', 'openai-image')).toEqual(expect.objectContaining({
      mode: 'api',
      connectorId: 'openai-image-api',
      toolOrModelId: 'openai-image',
    }));
  });

  it('creates the selected MCP route without changing its connector or tool', () => {
    expect(createMcpUiRoute({
      routeId: 'local:image',
      connectorId: 'local-comfy',
      toolId: 'generate_image',
      capability: 'image.generate.text',
      billingKind: 'local-compute',
    })).toEqual({
      routeId: 'local:image',
      mode: 'mcp',
      connectorId: 'local-comfy',
      toolOrModelId: 'generate_image',
      capability: 'image.generate.text',
      billingKind: 'local-compute',
    });
  });

  it('always persists manual-only fallback and preserves the untouched vision route', () => {
    const text = createNonMcpUiRoute('text', 'agent', 'agent-codex');
    const image = createNonMcpUiRoute('image', 'api', 'openai-image');
    const vision = {
      routeId: 'vision-existing', mode: 'api', connectorId: 'gemini-api',
      capability: 'vision.analyze', toolOrModelId: 'gemini-3.1-flash-lite', billingKind: 'metered-api',
    } as const;
    expect(mergeUiRouteSettings({ vision }, text, image)).toEqual(expect.objectContaining({
      version: 1,
      fallbackPolicy: 'manual-only',
      text,
      image,
      vision,
    }));
  });

  it('rejects invalid mode/provider combinations rather than defaulting', () => {
    expect(() => createNonMcpUiRoute('text', 'agent', 'openai')).toThrow('GENERATION_UI_ROUTE_INVALID');
    expect(() => createNonMcpUiRoute('image', 'api', 'dropshot')).toThrow('GENERATION_UI_ROUTE_INVALID');
  });

  it('does not leak MCP tool ids into legacy image source storage', () => {
    expect(resolveLegacyImageStorageValue(createMcpUiRoute({
      routeId: 'local:image',
      connectorId: 'local-comfy',
      toolId: 'generate_image',
      capability: 'image.generate.text',
      billingKind: 'local-compute',
    }))).toBeUndefined();
    expect(resolveLegacyImageStorageValue(
      createNonMcpUiRoute('image', 'agent', 'dropshot'),
    )).toBe('dropshot');
  });
});
