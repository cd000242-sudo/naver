import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';
import { findReadyEditorFrame, waitForInitialEditorReadiness } from '../src/automation/initialEditorReadiness';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow } from './electronTestUtils';

test('recognizes a real cross-origin nested editor without navigating or entering content', async () => {
  const profile = await createElectronTestProfile('bln-editor-frames-');
  const app = await electron.launch({ args: [path.join(__dirname, '..', 'dist/main.js')], cwd: path.join(__dirname, '..'), env: { ...process.env, ...profile.env } });
  try {
    await waitForMainWindow(app);
    await app.context().route('https://**/*', async route => {
      const url = new URL(route.request().url());
      const html = url.pathname === '/fixture-shell'
        ? '<iframe id="mainFrame" src="https://m.blog.naver.com/fixture-wrapper"></iframe>'
        : url.pathname === '/fixture-wrapper'
          ? '<iframe src="https://blog.naver.com/PostWriteForm.naver?blogId=fixture"></iframe>'
          : '<main class="se-main-container"><div class="se-documentTitle" contenteditable="true"></div><p class="se-text-paragraph" contenteditable="true"></p></main>';
      await route.fulfill({ contentType: 'text/html', body: html });
    });
    const [page] = await Promise.all([
      app.waitForEvent('window'),
      app.evaluate(({ BrowserWindow }) => { const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } }); void window.loadURL('https://blog.naver.com/fixture-shell'); }),
    ]);
    await page.waitForURL('https://blog.naver.com/fixture-shell');
    await waitForInitialEditorReadiness(page as never, { timeoutMs: 10000 });
    const shellCanReadEditor = await page.evaluate(() => {
      try { return Boolean(document.querySelector('iframe')?.contentDocument?.querySelector('.se-main-container')); } catch { return false; }
    });
    expect(shellCanReadEditor).toBe(false);
    expect(page.frames().length).toBe(3);
    const editor = page.frames().find(frame => frame.url().includes('PostWriteForm.naver'))!;
    expect(await findReadyEditorFrame(page as never)).toBe(editor);
    expect(await editor.locator('.se-documentTitle').textContent()).toBe('');
    expect(page.url()).toBe('https://blog.naver.com/fixture-shell');
  } finally { await closeElectronTestSession(app, profile); }
});
