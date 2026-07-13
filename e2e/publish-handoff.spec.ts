import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeElectronApp,
  createElectronTestProfile,
  type ElectronTestProfile,
  waitForMainWindow,
} from './electronTestUtils';

let app: ElectronApplication;
let mainWindow: Page;
let testProfile: ElectronTestProfile;
let captureFile: string;
const rendererLogs: string[] = [];
const dialogMessages: string[] = [];

function rememberRendererLog(message: string): void {
  rendererLogs.push(message);
  if (rendererLogs.length > 100) rendererLogs.shift();
}

function rememberDialog(message: string): void {
  dialogMessages.push(message);
  if (dialogMessages.length > 20) dialogMessages.shift();
}

async function waitForCapture(timeoutMs = 45_000): Promise<Record<string, any>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(captureFile, 'utf8');
      const lines = raw.split(/\r?\n/).filter(Boolean);
      if (lines.length > 0) return JSON.parse(lines.at(-1)!).payload;
    } catch {
      // The renderer has not crossed the main-process boundary yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const state = await mainWindow.evaluate(() => ({
    automationDispatched: (window as any)._publishAutomationDispatched,
    lastPipelineError: (window as any)._lastPipelineError,
    currentAutomationMode: (window as any).currentAutomationMode,
    pipelineRunOwner: (window as any).__pipelineRunOwner,
    stopRequested: (window as any).stopFullAutoPublish,
    buttonDisabled: (document.getElementById('semi-auto-publish-btn') as HTMLButtonElement | null)?.disabled,
    progressText: document.getElementById('unified-progress-text')?.textContent,
    title: (document.getElementById('unified-generated-title') as HTMLInputElement | null)?.value,
    contentLength: (document.getElementById('unified-generated-content') as HTMLTextAreaElement | null)?.value?.length,
    skipImages: (document.getElementById('unified-skip-images') as HTMLInputElement | null)?.checked,
    currentStructuredContent: Boolean((window as any).currentStructuredContent),
    visibleLog: document.getElementById('unified-log-content')?.textContent?.slice(-2_000),
  })).catch((error) => ({ stateReadError: String(error) }));
  throw new Error(
    `semi-auto publish payload was not captured\nstate=${JSON.stringify(state)}\n` +
    `dialogs=${dialogMessages.join(' | ')}\n` +
    `rendererLogs=${rendererLogs.slice(-50).join('\n')}`,
  );
}

test.beforeAll(async () => {
  rendererLogs.length = 0;
  dialogMessages.length = 0;
  testProfile = await createElectronTestProfile('bln-publish-e2e-');
  captureFile = path.join(testProfile.root, 'publish-captures.ndjson');

  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist', 'main.js')],
    cwd: path.join(__dirname, '..'),
    timeout: 60_000,
    env: {
      ...process.env,
      ...testProfile.env,
      E2E_PUBLISH_CAPTURE_FILE: captureFile,
    },
  });
  mainWindow = await waitForMainWindow(app);
  mainWindow.on('console', (message) => {
    rememberRendererLog(`[${message.type()}] ${message.text()}`);
  });
  mainWindow.on('pageerror', (error) => {
    rememberRendererLog(`[pageerror] ${error.message}`);
  });
  mainWindow.on('dialog', async (dialog) => {
    rememberDialog(`${dialog.type()}:${dialog.message()}`);
    await dialog.dismiss();
  });
});

test.afterAll(async () => {
  await closeElectronApp(app);
  await testProfile?.cleanup();
});

test('semi-auto UI preserves pasted article order through the main IPC handoff', async () => {
  const body = [
    '준비물 안내입니다.',
    '',
    '1. 첫 번째 준비',
    '첫 번째 설명입니다.',
    '',
    '2. 두 번째 준비',
    '두 번째 설명입니다.',
    '',
    '3. 세 번째 준비',
    '세 번째 설명입니다.',
  ].join('\n');

  await mainWindow.locator('#semi-auto-publish-btn').waitFor({ state: 'attached', timeout: 20_000 });
  await mainWindow.evaluate(({ articleBody }) => {
    const setValue = (id: string, value: string) => {
      const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!element) throw new Error(`missing E2E field: ${id}`);
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('naver-id', 'e2e-runtime');
    setValue('naver-password', 'not-a-real-password');
    setValue('unified-generated-title', '반자동 순서 보존 테스트');
    setValue('unified-generated-content', articleBody);
    setValue('unified-publish-mode', 'publish');
    const skipImages = document.getElementById('unified-skip-images') as HTMLInputElement | null;
    if (skipImages) skipImages.checked = true;
    (window as any).currentStructuredContent = null;
    document.getElementById('semi-auto-publish-btn')?.click();
  }, { articleBody: body });

  const payload = await waitForCapture();
  expect(payload._publishFlow).toBe('semi_auto');
  expect(payload.publishMode).toBe('publish');
  expect(payload.title).toBe('반자동 순서 보존 테스트');

  const content = String(payload.content || '');
  const first = content.indexOf('1. 첫 번째 준비');
  const second = content.indexOf('2. 두 번째 준비');
  const third = content.indexOf('3. 세 번째 준비');
  expect(first).toBeGreaterThan(-1);
  expect(second).toBeGreaterThan(first);
  expect(third).toBeGreaterThan(second);
  expect(payload.structuredContent.bodyPlain).toBe(content);
});
