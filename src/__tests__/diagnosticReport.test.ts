import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guards for the one-click diagnostic report (2026-06-23).
 *
 * Purpose: break the "works on my machine → release → customer broken → no data →
 * guess again" loop. A publish failure must auto-capture the data needed to
 * diagnose environment-specific bugs (esp. WHICH browser the client used), and a
 * manual button must let any user save the same report on demand.
 */
describe('diagnostic report wiring', () => {
  const handler = read('main/ipc/diagnosticsHandlers.ts');
  const mainSrc = read('main.ts');
  const preload = read('preload.ts');
  const rendererSrc = read('renderer/renderer.ts');
  const indexHtml = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

  it('captures the browser used — the #1 dev/deploy variable', () => {
    expect(handler).toContain('getChromiumExecutablePath()');
    expect(handler).toMatch(/시스템 Chrome|자동설치 Chrome/);
  });

  it('saves the report to a file the customer can send', () => {
    expect(handler).toContain("app.getPath(baseDir)");
    expect(handler).toMatch(/desktop/);
  });

  it('auto-generates a report on publish failure (both result-failure and exception paths)', () => {
    const calls = (mainSrc.match(/generateDiagnosticReport\(/g) || []).length;
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('registers the IPC handler and exposes it through preload', () => {
    expect(mainSrc).toContain('registerDiagnosticsHandlers()');
    expect(preload).toContain("ipcRenderer.invoke('diagnostics:generateReport'");
  });

  it('wires a manual diagnostic button in the header', () => {
    expect(indexHtml).toContain('id="diagnostic-report-btn"');
    expect(rendererSrc).toContain("getElementById('diagnostic-report-btn')");
    expect(rendererSrc).toContain('generateDiagnosticReport');
  });
});
