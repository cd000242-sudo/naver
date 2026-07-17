import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateImagesWithMcp } from '../generation/mcp/imageAdapter';
import type { McpRuntimeManager } from '../generation/mcp/runtime';

const roots: string[] = [];
const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

async function outputRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(process.cwd(), 'tmp', 'mcp-image-test-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const route = Object.freeze({
  routeId: 'mcp-image',
  mode: 'mcp' as const,
  connectorId: 'local-mcp',
  capability: 'image.generate.text' as const,
  toolOrModelId: 'create_images',
  billingKind: 'local-compute' as const,
});

function runtime(result: Awaited<ReturnType<McpRuntimeManager['invokeRoute']>>): McpRuntimeManager {
  return {
    checkRoute: vi.fn(),
    invokeRoute: vi.fn().mockResolvedValue(result),
    close: vi.fn(),
  };
}

describe('MCP image generation adapter', () => {
  it('submits the complete image batch once and writes images directly to the configured root', async () => {
    const root = await outputRoot();
    const manager = runtime({
      text: [],
      images: [
        { data: png.toString('base64'), mimeType: 'image/png' },
        { data: png.toString('base64'), mimeType: 'image/png' },
      ],
      resourceLinks: [],
    });
    const onImage = vi.fn();
    const items = [
      { heading: '대표 이미지', prompt: 'clean product hero', isThumbnail: true },
      { heading: '사용 장면', prompt: 'product in a room' },
    ];

    const result = await generateImagesWithMcp({
      runtime: manager,
      route,
      items,
      outputDirectory: root,
      onImageGenerated: onImage,
    });

    expect(manager.invokeRoute).toHaveBeenCalledTimes(1);
    expect(manager.invokeRoute).toHaveBeenCalledWith(route, {
      arguments: {
        responseFormat: 'image',
        items,
      },
    }, expect.any(Object));
    expect(result).toHaveLength(2);
    expect(result.every((image) => path.dirname(image.filePath) === root)).toBe(true);
    expect(result[0]).toMatchObject({ provider: 'mcp', isThumbnail: true, fallbackUsed: false });
    expect(onImage).toHaveBeenCalledTimes(2);
    await expect(fs.readFile(result[0].filePath)).resolves.toEqual(png);
  });

  it('rejects malformed image bytes and never tries another route', async () => {
    const root = await outputRoot();
    const manager = runtime({
      text: [],
      images: [{ data: Buffer.from('not-a-png').toString('base64'), mimeType: 'image/png' }],
      resourceLinks: [],
    });

    await expect(generateImagesWithMcp({
      runtime: manager,
      route,
      items: [{ heading: '대표', prompt: 'prompt' }],
      outputDirectory: root,
    })).rejects.toMatchObject({ code: 'MCP_IMAGE_BYTES_INVALID' });
    expect(manager.invokeRoute).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('fails explicitly when the MCP server returns fewer images than requested', async () => {
    const root = await outputRoot();
    const manager = runtime({
      text: [],
      images: [{ data: png.toString('base64'), mimeType: 'image/png' }],
      resourceLinks: [],
    });

    await expect(generateImagesWithMcp({
      runtime: manager,
      route,
      items: [{ heading: 'one', prompt: 'one' }, { heading: 'two', prompt: 'two' }],
      outputDirectory: root,
    })).rejects.toMatchObject({ code: 'MCP_IMAGE_COUNT_MISMATCH' });
    expect(manager.invokeRoute).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(root)).toEqual([]);
  });
});
