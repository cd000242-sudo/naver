import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src', 'contentGenerator.ts'), 'utf8');

describe('MCP content pipeline integration', () => {
  it('models MCP as an explicit provider with a main-process runtime and immutable route', () => {
    expect(source).toMatch(/ContentGeneratorProvider\s*=\s*[^;]*'mcp'/);
    expect(source).toMatch(/generationRoute\?:\s*GenerationRoute/);
    expect(source).toMatch(/mcpRuntimeManager\?:\s*McpRuntimeManager/);
  });

  it('routes the already-finalized system prompt only to the MCP adapter', () => {
    expect(source).toMatch(
      /if \(provider === 'mcp'\) \{[\s\S]{0,900}generateTextWithMcp\(\{[\s\S]{0,500}prompt:\s*systemPrompt/,
    );
    expect(source).toMatch(/provider === 'mcp'\s*\|\|\s*!allowAutomaticProviderRetry/);
    expect(source).toMatch(/options\.provider !== 'mcp'/);
    expect(source).toMatch(/source\.generator !== 'mcp'/);
  });

  it('fails closed when the selected MCP runtime or route is absent', () => {
    expect(source).toContain('MCP_RUNTIME_NOT_CONFIGURED');
    expect(source).toMatch(/!options\.mcpRuntimeManager\s*\|\|\s*!options\.generationRoute/);
  });
});
