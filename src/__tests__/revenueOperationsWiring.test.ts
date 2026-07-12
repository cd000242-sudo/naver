import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('revenue operations wiring', () => {
  it('makes analytics and revenue operations reachable in the UI', () => {
    const html = read('public/index.html');
    expect(html).toContain('data-tab="analytics"');
    expect(html).toContain('data-subtab="revenue"');
    expect(html).toContain('id="subtab-revenue"');
    expect(html).toContain('id="revenue-entry-form"');
    expect(html).toContain('id="analytics-leword-redirect"');
  });

  it('wires renderer, preload, and main IPC through one revenue contract', () => {
    const renderer = read('src/renderer/renderer.ts');
    const preload = read('src/preload.ts');
    const main = read('src/main.ts');
    const bundler = read('scripts/copy-static.mjs');
    const analyticsTabs = read('src/renderer/modules/thumbnailGenerator.ts');

    expect(renderer).toContain('initRevenueOperationsDashboard');
    expect(preload).toContain("ipcRenderer.invoke('revenue:getDashboard'");
    expect(preload).toContain("ipcRenderer.invoke('revenue:addEntry'");
    expect(main).toContain('registerRevenueOperationsHandlers();');
    expect(bundler).toContain("'revenueOperationsDashboard.js'");
    expect(analyticsTabs).toContain("subtab === 'serp-history' ? 'block' : 'none'");
  });
});
