import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test';
import { closeElectronTestSession, createElectronTestProfile, waitForMainWindow } from './electronTestUtils';

test('image replacement and addition offer large previews without changing selection until confirmed', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const profile = await createElectronTestProfile('bln-image-picker-preview-');
  let app: ElectronApplication | undefined;
  const root = path.resolve(__dirname, '..');
  const heading = '크게 확인할 소제목';
  const folder = '미리보기 테스트 이미지';
  // Match the isolated profile's real default. Renderer startup initializes
  // account settings asynchronously; this does not race an unrelated override.
  const imageBase = path.join(profile.env.USERPROFILE!, 'Downloads', 'naver-blog-images');
  const imageFolder = path.join(imageBase, folder);
  const errors: string[] = [];
  try {
    await fs.mkdir(imageFolder, { recursive: true });
    const images = await Promise.all(['#2563eb', '#16a34a', '#c2410c'].map((color, index) =>
      sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="${color}"/><circle cx="450" cy="400" r="230" fill="white"/><text x="450" y="465" text-anchor="middle" font-size="200" font-family="sans-serif" fill="${color}">${index + 1}</text><text x="450" y="790" text-anchor="middle" font-size="55" font-family="sans-serif" fill="white">IMAGE PREVIEW</text></svg>`)).png().toBuffer(),
    ));
    for (let index = 0; index < images.length; index += 1) {
      await fs.writeFile(path.join(imageFolder, `0${index + 1}.png`), images[index]);
    }
    app = await electron.launch({
      args: [path.join(root, 'dist/main.js')], cwd: root,
      env: { ...process.env, ...profile.env, E2E_PUBLISH_CAPTURE_FILE: path.join(profile.root, 'must-not-publish.ndjson') },
    });
    const page = await waitForMainWindow(app);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { void dialog.dismiss(); });
    await expect(page.locator('#refresh-posts-list-btn')).toHaveAttribute('data-listener-added', 'true', { timeout: 45_000 });
    await page.waitForFunction(() => (window as any).__ldbPostsBound === true);
    const imageSetup = await page.evaluate(async imagePath => {
      const api = (window as any).api;
      const license = await api.getLicense();
      const userId = license?.license?.userId || await api.getDeviceId();
      await api.saveConfig({ __userId: userId, customImageSavePath: imagePath });
      return { configured: (await api.getConfig()).customImageSavePath,
        files: await api.readDir(imagePath), folders: await api.readDirWithStats(imagePath) };
    }, imageBase);
    expect(imageSetup.configured).toBe(imageBase);
    expect(imageSetup.files).toContain(folder);
    expect(imageSetup.folders.some((entry: any) => entry.name === folder && entry.isDirectory)).toBe(true);
    await app.evaluate(({ BrowserWindow }, post) => {
      BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html'))!
        .webContents.send('ldb:import-posts', [post], 'image-preview-fixture');
    }, {
      id: 'ldb_image_preview_fixture', title: '이미지 확대 확인용 원고',
      content: `이미지를 확인합니다.\n\n## ${heading}\n본문에 배치할 사진을 선택합니다.`,
      headings: [{ title: heading, content: '본문에 배치할 사진을 선택합니다.', prompt: 'A clear preview' }],
      images: [{ heading, previewDataUrl: `data:image/png;base64,${images[0].toString('base64')}`, prompt: 'A clear preview' }],
      publishMode: 'draft',
    });
    await expect(page.locator('.tab-button[data-tab="images"]')).toHaveClass(/active/);
    const row = page.locator('#prompts-container .prompt-item').filter({ has: page.locator('.heading-title-pure', { hasText: heading }) });
    await expect(row).toHaveCount(1);
    const assigned = () => page.evaluate(title => (window as any).ImageManager.getImages(title).map((image: any) => image.filePath || image.url || image.previewDataUrl), heading);
    const before = await assigned();
    expect(await page.evaluate(() => (window as any).api.getConfig().then((config: any) => config.customImageSavePath))).toBe(imageBase);
    await row.locator('.select-local-image-btn').click();
    await page.locator('.folder-item').filter({ hasText: folder }).click();
    const choices = page.locator('.replace-image-pick');
    await expect(choices).toHaveCount(3);
    const replacePreview = choices.nth(1).locator('..').getByRole('button', { name: /크게 보기/ });
    await replacePreview.click();
    const dialog = page.locator('[data-image-picker-preview]');
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(900);
    expect(await assigned()).toEqual(before);
    const viewport = await dialog.locator('[data-preview-viewport]').boundingBox();
    expect(viewport?.height).toBeGreaterThan(300);
    await page.screenshot({ path: testInfo.outputPath('image-picker-large-preview.png') });
    await dialog.getByRole('button', { name: '＋ 확대', exact: true }).click();
    await expect(dialog.locator('[data-preview-scale]')).toHaveText('150%');
    await dialog.getByRole('button', { name: '✕ 닫기', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.locator('[data-preview-viewport]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => dialog.locator('[data-preview-viewport]').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: '화면에 맞춤', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(replacePreview).toBeFocused();
    expect(await assigned()).toEqual(before);
    await replacePreview.click();
    await dialog.getByRole('button', { name: '이 이미지 선택', exact: true }).click();
    await expect(choices).toHaveCount(0);
    await expect.poll(assigned).toEqual([path.join(imageFolder, '02.png').replace(/\\/g, '/')]);

    await row.locator('.add-multiple-images-btn').click();
    await page.locator('#folder-selection-modal .folder-item').filter({ hasText: folder }).click();
    const add = page.locator('#multiple-image-selection-modal');
    await expect(add.locator('.multi-img-item')).toHaveCount(3);
    await add.locator('.image-picker-preview-button').nth(2).click();
    await expect(add.locator('#selected-count')).toHaveText('0개 선택됨');
    await dialog.getByRole('button', { name: '이 이미지 선택', exact: true }).click();
    await expect(add.locator('#selected-count')).toHaveText('1개 선택됨');
    expect((await assigned()).length).toBe(1);
    await add.locator('.image-picker-preview-button').nth(2).click();
    await expect(dialog.getByRole('button', { name: '✓ 이미 선택됨', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '✕ 닫기', exact: true }).click();
    await expect(add.locator('#selected-count')).toHaveText('1개 선택됨');
    await page.screenshot({ path: testInfo.outputPath('image-picker-add-grid.png') });
    await add.getByRole('button', { name: '선택 완료', exact: true }).click();
    await expect(add).toHaveCount(0);
    await expect.poll(async () => (await assigned()).length).toBe(2);
    expect(await fs.stat(path.join(profile.root, 'must-not-publish.ndjson')).then(() => true, () => false)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await closeElectronTestSession(app, profile);
  }
});
