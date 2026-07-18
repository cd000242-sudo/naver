import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readSource(...segments: string[]): string {
  const filePath = resolve(root, ...segments);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function readTypeScriptTree(...segments: string[]): string {
  const directory = resolve(root, ...segments);
  if (!existsSync(directory)) return '';

  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        return [readTypeScriptTree(...segments, entry.name)];
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
      return [readFileSync(resolve(directory, entry.name), 'utf8')];
    })
    .join('\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasElement(
  source: string,
  tagName: string,
  attributes: Readonly<Record<string, string>>,
): boolean {
  const startTags = source.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
  return startTags.some((startTag) => Object.entries(attributes).every(([name, value]) => (
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']${escapeRegExp(value)}["']`, 'i').test(startTag)
  )));
}

const html = readSource('public', 'index.html');
const renderer = readSource('src', 'renderer', 'renderer.ts');
const preload = readSource('src', 'preload.ts');
const mainProcess = [readSource('src', 'main.ts'), readTypeScriptTree('src', 'main')].join('\n');
const staticCopyScript = readSource('scripts', 'copy-static.mjs');
const packageJson = readSource('package.json');
const contentGenerator = readSource('src', 'contentGenerator.ts');

describe('MCP removal regression', () => {
  it('does not package or initialize the removed MCP connection UI', () => {
    expect(html).not.toMatch(/\bid=["']mcp-[^"']+["']/i);
    expect(html).not.toMatch(/\bid=["']generation-connection-panel["']/i);
    expect(renderer).not.toMatch(/from\s+["'][^"']*generationConnectionUI(?:\.js)?["']/i);
    expect(renderer).not.toMatch(/\binitGenerationConnectionUI\s*\(/);
    expect(staticCopyScript).not.toMatch(/["']generationConnectionUI\.js["']/i);
  });

  it('does not expose mcp:* channels through preload or the main process', () => {
    expect(preload).not.toMatch(/ipcRenderer\.(?:invoke|send|on)\s*\(\s*["'`]mcp:/i);
    expect(mainProcess).not.toMatch(/ipcMain\.(?:handle|on)\s*\(\s*["'`]mcp:/i);
  });

  it('does not ship the removed MCP runtime or SDK dependency', () => {
    expect(readTypeScriptTree('src', 'generation', 'mcp')).toBe('');
    expect(packageJson).not.toMatch(/@modelcontextprotocol\/sdk/i);
    expect(contentGenerator).not.toMatch(/ContentGeneratorProvider\s*=\s*[^;]*["']mcp["']/i);
  });

  it('keeps the existing Agent and API generation choices', () => {
    expect(hasElement(html, 'input', {
      name: 'primaryGeminiTextModel',
      value: 'agent-codex',
    })).toBe(true);
    expect(hasElement(html, 'input', {
      name: 'primaryGeminiTextModel',
      value: 'agent-claude',
    })).toBe(true);
    expect(hasElement(html, 'input', { id: 'gemini-api-key' })).toBe(true);
    expect(hasElement(html, 'input', { id: 'openai-api-key' })).toBe(true);
    expect(hasElement(html, 'input', { id: 'claude-api-key' })).toBe(true);
  });

  it('keeps the existing image source, model, and quality settings', () => {
    expect(hasElement(html, 'select', { id: 'image-source-select' })).toBe(true);
    expect(hasElement(html, 'option', { value: 'dropshot' })).toBe(true);
    expect(hasElement(html, 'option', { value: 'openai-image' })).toBe(true);
    expect(hasElement(html, 'input', {
      name: 'openai-image-model',
      value: 'gpt-image-1.5',
    })).toBe(true);
    expect(hasElement(html, 'input', {
      name: 'openai-image-quality',
      value: 'medium',
    })).toBe(true);
  });
});
