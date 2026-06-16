import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('Flow login UI wiring', () => {
  it('exposes Flow login/check APIs through preload and IPC handlers', () => {
    const preload = read('preload.ts');
    const handlers = read('main/ipc/imageHandlers.ts');
    const flow = read('image/flowGenerator.ts');

    expect(preload).toContain('checkFlowLogin');
    expect(preload).toContain("ipcRenderer.invoke('flow:check-login')");
    expect(preload).toContain('flowLogin');
    expect(preload).toContain("ipcRenderer.invoke('flow:login')");

    expect(handlers).toContain("safeHandle('flow:check-login'");
    expect(handlers).toContain("safeHandle('flow:login'");
    expect(flow).toMatch(/export async function checkFlowLogin/);
    expect(flow).toMatch(/export async function flowLogin/);
  });

  it('shows Flow login controls in both image management and image studio panels', () => {
    const html = read('../public/index.html');

    expect(html).toContain('id="mgmt-flow-login"');
    expect(html).toContain('id="mgmt-flow-login-btn"');
    expect(html).toContain('id="mgmt-flow-check-btn"');
    expect(html).toContain('id="imgstudio-flow-login"');
    expect(html).toContain('id="imgstudio-flow-login-btn"');
    expect(html).toContain('id="imgstudio-flow-check-btn"');
  });

  it('binds Flow rows to select value flow, independent from dropshot rows', () => {
    const ui = read('renderer/modules/dropshotLoginUi.ts');
    const renderer = read('renderer/renderer.ts');
    const studio = read('renderer/modules/imageGenStudio.ts');

    expect(ui).toContain('export function bindFlowLogin');
    expect(ui).toContain('export function wireSelectFlowRow');
    expect(ui).toContain("sel.value === 'flow'");
    expect(ui).toContain('api?.flowLogin?.()');
    expect(ui).toContain('api?.checkFlowLogin?.()');

    expect(renderer).toContain('wireSelectFlowRow');
    expect(renderer).toContain("rowId: 'mgmt-flow-login'");
    expect(studio).toContain('wireSelectFlowRow');
    expect(studio).toContain("rowId: 'imgstudio-flow-login'");
  });
});
