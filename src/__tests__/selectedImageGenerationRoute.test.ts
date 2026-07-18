import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../configManager';
import type { GenerateImagesOptions, GeneratedImage } from '../image/types';
import type { GenerationRoute } from '../generation/routeSnapshot';
import {
  executeSelectedImageGenerationRoute,
  resolveConfiguredImageOutputDirectory,
} from '../main/services/selectedImageGenerationRoute';

const mcpRoute: GenerationRoute = Object.freeze({
  routeId: 'image-mcp',
  mode: 'mcp',
  connectorId: 'local-comfy',
  capability: 'image.generate.text',
  toolOrModelId: 'generate_image',
  billingKind: 'local-compute',
});

function options(): GenerateImagesOptions {
  return {
    provider: 'openai-image',
    items: [{ heading: 'thumbnail', prompt: 'exact image prompt', isThumbnail: true }],
    imageFallbackPolicy: 'guarantee',
  };
}

describe('selected image generation route', () => {
  it('uses the configured image root without creating a hidden shopping subfolder', () => {
    expect(resolveConfiguredImageOutputDirectory(
      { customImageSavePath: 'C:/images' } as AppConfig,
      'C:/fallback',
    )).toMatch(/[\\/]images$/);
  });

  it('executes the selected MCP tool once and never calls the legacy generator', async () => {
    const generated = [{ heading: 'thumbnail', provider: 'mcp' }] as GeneratedImage[];
    const generateMcp = vi.fn().mockResolvedValue(generated);
    const generateLegacy = vi.fn();
    const runtime = {} as never;

    const result = await executeSelectedImageGenerationRoute({
      config: {
        customImageSavePath: 'C:/images',
        generationConnectionSettings: { fallbackPolicy: 'manual-only', image: mcpRoute },
      } as AppConfig,
      options: options(),
      apiKeys: {},
      fallbackOutputDirectory: 'C:/fallback',
      getMcpRuntime: vi.fn().mockResolvedValue(runtime),
      generateMcp,
      generateLegacy,
    });

    expect(result).toBe(generated);
    expect(generateMcp).toHaveBeenCalledTimes(1);
    expect(generateMcp).toHaveBeenCalledWith(expect.objectContaining({
      runtime,
      route: mcpRoute,
      items: options().items,
      outputDirectory: expect.stringMatching(/[\\/]images$/),
    }));
    expect(generateLegacy).not.toHaveBeenCalled();
  });

  it('does not fall back when the selected MCP route fails', async () => {
    const generateLegacy = vi.fn();
    await expect(executeSelectedImageGenerationRoute({
      config: {
        generationConnectionSettings: { fallbackPolicy: 'manual-only', image: mcpRoute },
      } as AppConfig,
      options: options(),
      apiKeys: {},
      fallbackOutputDirectory: 'C:/fallback',
      getMcpRuntime: vi.fn().mockResolvedValue({}),
      generateMcp: vi.fn().mockRejectedValue(new Error('selected MCP failed')),
      generateLegacy,
    })).rejects.toThrow('selected MCP failed');
    expect(generateLegacy).not.toHaveBeenCalled();
  });

  it('ignores stale non-MCP routes and preserves the provider selected in the existing image settings', async () => {
    const generateLegacy = vi.fn().mockResolvedValue([]);
    const apiRoute: GenerationRoute = Object.freeze({
      routeId: 'image-stale-gemini',
      mode: 'api',
      connectorId: 'gemini-image-api',
      capability: 'image.generate.reference',
      toolOrModelId: 'nano-banana-pro',
      billingKind: 'metered-api',
    });
    const existingImageSettings = {
      ...options(),
      provider: 'dropshot' as const,
    };

    await executeSelectedImageGenerationRoute({
      config: {
        generationConnectionSettings: { fallbackPolicy: 'manual-only', image: apiRoute },
      } as AppConfig,
      options: existingImageSettings,
      apiKeys: {},
      fallbackOutputDirectory: 'C:/fallback',
      getMcpRuntime: vi.fn(),
      generateMcp: vi.fn(),
      generateLegacy,
    });

    expect(generateLegacy).toHaveBeenCalledTimes(1);
    expect(generateLegacy.mock.calls[0][0]).toEqual(expect.objectContaining({
      provider: 'dropshot',
      imageFallbackPolicy: 'engine-only',
    }));
  });
});
