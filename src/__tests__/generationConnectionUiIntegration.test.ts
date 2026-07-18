import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const html = readFileSync(resolve(root, 'public', 'index.html'), 'utf8');
const renderer = readFileSync(resolve(root, 'src', 'renderer', 'renderer.ts'), 'utf8');
const ui = readFileSync(resolve(root, 'src', 'renderer', 'modules', 'generationConnectionUI.ts'), 'utf8');
const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');
const buildScript = readFileSync(resolve(root, 'scripts', 'copy-static.mjs'), 'utf8');

describe('generation connection UI integration', () => {
  it('shows only optional MCP overrides and leaves existing agent/API/image settings authoritative', () => {
    expect(html).toContain('id="generation-connection-panel"');
    expect(html).toContain('id="generation-text-choice"');
    expect(html).toContain('id="generation-image-choice"');
    expect(html).not.toContain('data-generation-mode-card=');
    expect(html).not.toContain('id="generation-text-mode"');
    expect(html).not.toContain('id="generation-image-mode"');
    expect(html).toContain('MCP를 사용하지 않으면 기존 글 엔진 설정을 그대로 따릅니다.');
    expect(html).toContain('풀오토 이미지 설정·이미지 관리 탭을 그대로 따릅니다.');
    expect(html).toContain('기존 API와 동일한 최종 프롬프트를 그대로 전달합니다.');
    const saveRoutesSource = ui.match(/async function saveRoutes[\s\S]*?async function saveMcpConnection/)?.[0] || '';
    expect(saveRoutesSource).not.toContain('localStorage.setItem');
    expect(ui).toContain('migrateLegacyNonMcpOverrides');
  });

  it('lets only MCP routes override the existing text and image selections', () => {
    expect(main).toContain('resolveMcpTextOverride(currentConfig.generationConnectionSettings)');
    expect(ui).toContain("route?.mode === 'mcp'");
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
    expect(renderer).toMatch(/initSettingsModalFunc\(\);[\s\S]{0,200}void initGenerationConnectionUI\(\);/);
    expect(renderer).toMatch(/async function initializeApplication[\s\S]{0,700}await initGenerationConnectionUI\(\);/);
    expect(buildScript).toContain("'generationConnectionUI.js'");
  });
});
