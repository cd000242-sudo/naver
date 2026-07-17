import { describe, expect, it, vi } from 'vitest';
import {
  generateTextWithMcp,
  McpTextGenerationError,
} from '../generation/mcp/textAdapter';
import type { McpRuntimeManager } from '../generation/mcp/runtime';

const textRoute = Object.freeze({
  routeId: 'mcp-local-text',
  mode: 'mcp' as const,
  connectorId: 'mcp-local',
  capability: 'text.generate' as const,
  toolOrModelId: 'write_post',
  billingKind: 'local-compute' as const,
});

function runtimeReturning(result: Awaited<ReturnType<McpRuntimeManager['invokeRoute']>>) {
  return {
    checkRoute: vi.fn().mockResolvedValue({ profileId: 'local', toolId: 'write_post' }),
    invokeRoute: vi.fn().mockResolvedValue(result),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies McpRuntimeManager;
}

describe('MCP text generation adapter', () => {
  it('passes the existing final prompt unchanged to the exact route exactly once', async () => {
    const runtime = runtimeReturning({
      text: ['{"selectedTitle":"제목","bodyPlain":"본문"}'],
      images: [],
      resourceLinks: [],
    });
    const prompt = '[LOCKED FTC]\n[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.\n최종 프롬프트';

    const output = await generateTextWithMcp({
      runtime,
      route: textRoute,
      prompt,
      mode: 'affiliate',
      minimumBodyCharacters: 1200,
      signal: undefined,
    });

    expect(output).toBe('{"selectedTitle":"제목","bodyPlain":"본문"}');
    expect(runtime.invokeRoute).toHaveBeenCalledTimes(1);
    expect(runtime.invokeRoute).toHaveBeenCalledWith(
      textRoute,
      {
        arguments: {
          prompt,
          responseFormat: 'structured-content-json',
          contentMode: 'affiliate',
          minimumBodyCharacters: 1200,
        },
      },
      expect.objectContaining({ signal: undefined }),
    );
  });

  it('serializes official structuredContent without making a second tool call', async () => {
    const runtime = runtimeReturning({
      text: [],
      images: [],
      resourceLinks: [],
      structuredContent: { selectedTitle: '제목', bodyPlain: '본문' },
    });

    await expect(generateTextWithMcp({
      runtime,
      route: textRoute,
      prompt: 'same prompt',
      mode: 'seo',
      minimumBodyCharacters: 1500,
    })).resolves.toBe(JSON.stringify({ selectedTitle: '제목', bodyPlain: '본문' }));
    expect(runtime.invokeRoute).toHaveBeenCalledTimes(1);
  });

  it('fails explicitly when the selected MCP tool returns no text instead of falling back', async () => {
    const runtime = runtimeReturning({ text: [], images: [], resourceLinks: [] });

    await expect(generateTextWithMcp({
      runtime,
      route: textRoute,
      prompt: 'same prompt',
      mode: 'seo',
      minimumBodyCharacters: 1500,
    })).rejects.toMatchObject({ code: 'MCP_TEXT_RESULT_EMPTY' });
    expect(runtime.invokeRoute).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-text route before calling the runtime', async () => {
    const runtime = runtimeReturning({ text: ['never'], images: [], resourceLinks: [] });

    try {
      await generateTextWithMcp({
        runtime,
        route: { ...textRoute, capability: 'image.generate.text' },
        prompt: 'same prompt',
        mode: 'seo',
        minimumBodyCharacters: 1500,
      });
      throw new Error('expected MCP text route validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(McpTextGenerationError);
      expect(error).toMatchObject({ code: 'MCP_TEXT_ROUTE_INVALID' });
    }
    expect(runtime.invokeRoute).not.toHaveBeenCalled();
  });
});
