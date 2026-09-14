import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import {
  closeElectronTestSession,
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
  await closeElectronTestSession(app, testProfile);
});

test('manual heading removal updates the built preview and publish reset clears per-post inputs', async () => {
  await mainWindow.locator('#heading-apply-to-preview').waitFor({ state: 'attached', timeout: 20_000 });
  await mainWindow.evaluate(() => {
    const textarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement;
    textarea.value = ['첫 번째 제목', '두 번째 제목', '세 번째 제목', '네 번째 제목']
      .map(title => `## ${title}\n\n이 구간의 자세한 본문입니다.`).join('\n\n');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelectorAll('[data-heading-unmark]')[3] as HTMLButtonElement).click();
    document.getElementById('heading-apply-to-preview')!.click();
  });
  await expect(mainWindow.locator('#heading-list [data-heading-unmark]')).toHaveCount(3);
  await expect(mainWindow.locator('#unified-integrated-preview')).toContainText('📝 세 번째 제목');
  await expect(mainWindow.locator('#unified-integrated-preview')).not.toContainText('📝 네 번째 제목');
  expect(await mainWindow.evaluate(() => (window as any).currentStructuredContent.headings.length)).toBe(3);
  await mainWindow.evaluate(() => {
    while (document.querySelector('[data-heading-unmark]')) {
      (document.querySelector('[data-heading-unmark]') as HTMLButtonElement).click();
    }
    document.getElementById('heading-apply-to-preview')!.click();
  });
  await expect(mainWindow.locator('#heading-list [data-heading-unmark]')).toHaveCount(0);
  const plainPreview = await mainWindow.locator('#unified-integrated-preview').innerText();
  expect(plainPreview.match(/네 번째 제목/g)).toHaveLength(1);
  expect(await mainWindow.evaluate(() => (window as any).currentStructuredContent.headings.length)).toBe(0);
  await mainWindow.evaluate(() => {
    (document.getElementById('unified-extra-request') as HTMLTextAreaElement).value = '이번 글만의 요청';
    (window as any).resetAllFields();
  });
  await expect(mainWindow.locator('#unified-extra-request')).toHaveValue('');
  await expect(mainWindow.locator('#unified-generated-content')).toHaveValue('');
  await expect(mainWindow.locator('#heading-lock-badge')).toHaveCSS('display', 'none');
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
