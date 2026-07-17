import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(resolve(root, 'public', 'index.html'), 'utf8');
const renderer = readFileSync(resolve(root, 'src', 'renderer', 'renderer.ts'), 'utf8');
const ui = readFileSync(resolve(root, 'src', 'renderer', 'modules', 'generationConnectionUI.ts'), 'utf8');
const buildScript = readFileSync(resolve(root, 'scripts', 'copy-static.mjs'), 'utf8');

describe('generation connection UI integration', () => {
  it('ships one explicit MCP/agent/API selector for both text and images', () => {
    expect(html).toContain('id="generation-connection-panel"');
    expect(html).toContain('data-generation-mode-card="mcp"');
    expect(html).toContain('data-generation-mode-card="agent"');
    expect(html).toContain('data-generation-mode-card="api"');
    expect(html).toContain('id="generation-text-mode"');
    expect(html).toContain('id="generation-image-mode"');
    expect(html).toContain('자동 폴백');
    expect(html).toContain('사용 안 함');
  });

  it('requires explicit trust before storing an executable MCP connection', () => {
    expect(html).toContain('id="mcp-trust-confirm"');
    expect(ui).toMatch(/mcp-trust-confirm[^\n]{0,120}\.checked/);
    expect(html).toContain('STDIO 방식은 내 PC에서 해당 프로그램을 실행');
  });

  it('uses registry-safe route IDs and never creates colon-delimited UI routes', () => {
    expect(ui).toContain('`${profileId}-text`');
    expect(ui).toContain('`${profileId}-image`');
    expect(ui).not.toContain('`${profileId}:text:');
    expect(ui).not.toContain('`${profileId}:image:');
  });

  it('initializes and inlines the module in the packaged renderer', () => {
    expect(renderer).toMatch(/import \{ initGenerationConnectionUI \}/);
    expect(renderer).toMatch(/initSettingsModalFunc\(\);[\s\S]{0,200}initGenerationConnectionUI\(\);/);
    expect(buildScript).toContain("'generationConnectionUI.js'");
  });
});
