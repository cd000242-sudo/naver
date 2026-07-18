import path from 'path';
import type { AppConfig } from '../../configManager.js';
import type {
  GenerateImagesOptions,
  GeneratedImage,
} from '../../image/types.js';
import type { McpRuntimeManager } from '../../generation/mcp/runtime.js';
import type { GenerateImagesWithMcpInput } from '../../generation/mcp/imageAdapter.js';

type ImageApiKeys = Readonly<{
  openaiApiKey?: string;
  geminiApiKey?: string;
  deepinfraApiKey?: string;
  openaiImageApiKey?: string;
  leonardoaiApiKey?: string;
  prodiaApiKey?: string;
  pexelsApiKey?: string;
  unsplashApiKey?: string;
  pixabayApiKey?: string;
}>;

type ImageProgressCallback = (image: GeneratedImage, index: number, total: number) => void;

export interface ExecuteSelectedImageGenerationRouteInput {
  readonly config: AppConfig;
  readonly options: GenerateImagesOptions;
  readonly apiKeys: ImageApiKeys;
  readonly fallbackOutputDirectory: string;
  readonly onImageGenerated?: ImageProgressCallback;
  readonly getMcpRuntime: (config: AppConfig) => Promise<McpRuntimeManager>;
  readonly generateMcp: (input: GenerateImagesWithMcpInput) => Promise<GeneratedImage[]>;
  readonly generateLegacy: (
    options: GenerateImagesOptions,
    apiKeys: ImageApiKeys,
    onImageGenerated?: ImageProgressCallback,
  ) => Promise<GeneratedImage[]>;
}

export function resolveConfiguredImageOutputDirectory(
  config: Pick<AppConfig, 'customImageSavePath'>,
  fallbackOutputDirectory: string,
): string {
  const configured = String(config.customImageSavePath || '').trim();
  return path.resolve(configured || fallbackOutputDirectory);
}

/**
 * MCP is the only optional override handled here. An MCP failure is returned
 * to the caller as-is and never reaches the existing image generator. When MCP
 * is not selected, the provider already resolved by the full-auto/image tabs is
 * preserved as the single source of truth and is still pinned to engine-only.
 */
export async function executeSelectedImageGenerationRoute(
  input: ExecuteSelectedImageGenerationRouteInput,
): Promise<GeneratedImage[]> {
  const selectedRoute = input.config.generationConnectionSettings?.image;
  if (selectedRoute?.mode === 'mcp') {
    const runtime = await input.getMcpRuntime(input.config);
    return input.generateMcp({
      runtime,
      route: selectedRoute,
      items: input.options.items,
      outputDirectory: resolveConfiguredImageOutputDirectory(
        input.config,
        input.fallbackOutputDirectory,
      ),
      onImageGenerated: input.onImageGenerated,
    });
  }

  const routedOptions: GenerateImagesOptions = {
    ...input.options,
    imageFallbackPolicy: 'engine-only',
  };

  return input.generateLegacy(routedOptions, input.apiKeys, input.onImageGenerated);
}
