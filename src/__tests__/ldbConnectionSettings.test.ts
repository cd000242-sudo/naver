import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
it('receives connection request through window.api when electronAPI only exposes unrelated APIs', () => {
 const source = readFileSync('src/renderer/renderer.ts', 'utf8');
 const start = source.indexOf('  const ldbConnectApi =');
 const end = source.indexOf('  // ✅ [LDB] 확장 연결 사용 여부.', start);
 expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
 let callback: (() => void) | undefined;
 let sectionVisible = false;
 const openSettingsModal = vi.fn(() => { sectionVisible = false; }); const nav = { click: vi.fn(() => { sectionVisible = true; }) }; const field = { focus: vi.fn(() => { expect(sectionVisible).toBe(true); }), scrollIntoView: vi.fn() }; const status = { textContent: '' };
 runInNewContext(source.slice(start, end).replaceAll('(window as any)', 'window'), {
  window: { electronAPI: { getVersion: vi.fn() }, api: { onLdbConnectRequest: (value: () => void) => { callback = value; } }, openSettingsModal },
  document: { getElementById: (id: string) => id === 'ldb-bridge-status' ? status : id === 'nav-api-keys-btn' ? nav : field },
 });
 expect(callback).toBeTypeOf('function'); callback!(); expect(openSettingsModal).toHaveBeenCalledOnce(); expect(field.focus).toHaveBeenCalledOnce(); expect(status.textContent).toContain('확장 연결 사용');
});
