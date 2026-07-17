import path from 'path';
import type { AppConfig } from '../../configManager.js';
import type {
  GenerateImagesOptions,
  GeneratedImage,
  ImageProvider,
} from '../../image/types.js';
import { ALLOWED_PROVIDER } from '../../image/types.js';
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

function resolveConfiguredLegacyProvider(toolOrModelId: string): ImageProvider {
  if (toolOrModelId === 'mcp' || !ALLOWED_PROVIDER.includes(toolOrModelId as ImageProvider)) {
    throw new Error(`IMAGE_ROUTE_ENGINE_UNSUPPORTED: ${toolOrModelId}`);
  }
  return toolOrModelId as ImageProvider;
}

/**
 * Executes only the route selected by the user. An MCP failure is returned to
 * the caller as-is and never reaches the legacy generator. Configured agent/API
 * routes are pinned to engine-only behavior for the same reason.
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

  const routedOptions: GenerateImagesOptions = selectedRoute
    ? {
      ...input.options,
      provider: resolveConfiguredLegacyProvider(selectedRoute.toolOrModelId),
      imageFallbackPolicy: 'engine-only',
    }
    : { ...input.options };

  return input.generateLegacy(routedOptions, input.apiKeys, input.onImageGenerated);
}
