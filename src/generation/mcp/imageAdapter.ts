import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { GeneratedImage, ImageRequestItem } from '../../image/types.js';
import type { GenerationRoute } from '../routeSnapshot.js';
import type { McpRuntimeManager, NormalizedMcpImage } from './runtime.js';

export type McpImageGenerationErrorCode =
  | 'MCP_IMAGE_ROUTE_INVALID'
  | 'MCP_IMAGE_REQUEST_INVALID'
  | 'MCP_IMAGE_COUNT_MISMATCH'
  | 'MCP_IMAGE_BYTES_INVALID'
  | 'MCP_IMAGE_RESOURCE_LINK_UNSUPPORTED';

const MESSAGES: Readonly<Record<McpImageGenerationErrorCode, string>> = Object.freeze({
  MCP_IMAGE_ROUTE_INVALID: '선택한 MCP 이미지 생성 경로가 올바르지 않습니다. 다른 경로로 자동 전환하지 않습니다.',
  MCP_IMAGE_REQUEST_INVALID: 'MCP 이미지 생성 요청이 비어 있거나 올바르지 않습니다.',
  MCP_IMAGE_COUNT_MISMATCH: 'MCP 서버가 요청한 개수의 이미지를 반환하지 않았습니다. 다른 경로로 자동 전환하지 않습니다.',
  MCP_IMAGE_BYTES_INVALID: 'MCP 서버가 반환한 이미지 데이터와 파일 형식이 일치하지 않습니다.',
  MCP_IMAGE_RESOURCE_LINK_UNSUPPORTED: 'MCP 서버가 링크만 반환했습니다. 이 앱에서는 안전한 image 또는 embedded resource 결과가 필요합니다.',
});

export class McpImageGenerationError extends Error {
  readonly code: McpImageGenerationErrorCode;

  constructor(code: McpImageGenerationErrorCode) {
    super(MESSAGES[code]);
    this.name = 'McpImageGenerationError';
    this.code = code;
  }
}

export interface GenerateImagesWithMcpInput {
  readonly runtime: McpRuntimeManager;
  readonly route: GenerationRoute;
  readonly items: readonly ImageRequestItem[];
  readonly outputDirectory: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void;
}

const EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
});

function matchesMime(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/gif') {
    const header = bytes.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function safeHeading(value: string, index: number): string {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || `image-${index + 1}`;
}

function validateRoute(route: GenerationRoute): void {
  if (!route
    || route.mode !== 'mcp'
    || !route.capability.startsWith('image.')
    || !route.routeId
    || !route.connectorId
    || !route.toolOrModelId) {
    throw new McpImageGenerationError('MCP_IMAGE_ROUTE_INVALID');
  }
}

function decodeImages(images: readonly NormalizedMcpImage[]): readonly Buffer[] {
  const buffers = images.map((image) => {
    const bytes = Buffer.from(image.data, 'base64');
    if (!matchesMime(bytes, image.mimeType)) {
      throw new McpImageGenerationError('MCP_IMAGE_BYTES_INVALID');
    }
    return bytes;
  });
  return Object.freeze(buffers);
}

/** One user action produces one batch tool call. No per-image retry or alternate connector is used. */
export async function generateImagesWithMcp(input: GenerateImagesWithMcpInput): Promise<GeneratedImage[]> {
  validateRoute(input.route);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 64) {
    throw new McpImageGenerationError('MCP_IMAGE_REQUEST_INVALID');
  }
  const outputDirectory = path.resolve(input.outputDirectory);
  const requestItems = input.items.map((item) => ({ ...item }));
  const result = await input.runtime.invokeRoute(
    input.route,
    { arguments: { responseFormat: 'image', items: requestItems } },
    { timeoutMs: input.timeoutMs, signal: input.signal },
  );

  if (result.images.length === 0 && result.resourceLinks.length > 0) {
    throw new McpImageGenerationError('MCP_IMAGE_RESOURCE_LINK_UNSUPPORTED');
  }
  if (result.images.length !== requestItems.length) {
    throw new McpImageGenerationError('MCP_IMAGE_COUNT_MISMATCH');
  }
  const buffers = decodeImages(result.images);

  await fs.mkdir(outputDirectory, { recursive: true });
  const writtenPaths: string[] = [];
  const generated: GeneratedImage[] = [];
  try {
    for (let index = 0; index < requestItems.length; index += 1) {
      const item = requestItems[index];
      const image = result.images[index];
      const extension = EXTENSIONS[image.mimeType];
      if (!extension) throw new McpImageGenerationError('MCP_IMAGE_BYTES_INVALID');
      const fileName = `${safeHeading(item.heading, index)}-${randomUUID()}.${extension}`;
      const filePath = path.join(outputDirectory, fileName);
      await fs.writeFile(filePath, buffers[index], { flag: 'wx' });
      writtenPaths.push(filePath);

      const generatedImage: GeneratedImage = Object.freeze({
        heading: item.heading,
        filePath,
        previewDataUrl: `data:${image.mimeType};base64,${image.data}`,
        provider: 'mcp',
        mimeType: image.mimeType,
        byteSize: buffers[index].byteLength,
        createdAt: Date.now(),
        isThumbnail: item.isThumbnail === true,
        requestedProvider: 'mcp',
        actualProvider: 'mcp',
        fallbackUsed: false,
        imageFallbackPolicy: 'engine-only',
        savedToLocal: filePath,
      });
      generated.push(generatedImage);
      input.onImageGenerated?.(generatedImage, index, requestItems.length);
    }
    return generated;
  } catch (error) {
    await Promise.allSettled(writtenPaths.map((filePath) => fs.unlink(filePath)));
    throw error;
  }
}
