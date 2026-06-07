/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const distBrowserPath = path.join(process.cwd(), 'dist', 'image', 'dropshotBrowser.js');
if (!fs.existsSync(distBrowserPath)) {
  console.error('[dropshot-diagnose] dist files are missing. Run npm run build first.');
  process.exit(1);
}

const {
  BOARD_URL,
  getProfileDir,
  launchBrowser,
  isLoggedIn,
  isImageWorkspaceReady,
  openDropshotImageWorkspace,
  ensureDropshotControls,
} = require(distBrowserPath);

function simplify(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function main() {
  const outputDir = path.join(process.cwd(), 'tmp', 'dropshot-diagnostics');
  fs.mkdirSync(outputDir, { recursive: true });
  process.env.VISIBLE_BROWSER = 'true';

  const ctx = await launchBrowser(getProfileDir(), false, { allowForceVisible: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  try {
    await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const loggedIn = await isLoggedIn(page);
    const workspaceReadyBefore = await isImageWorkspaceReady(page);
    const opened = await openDropshotImageWorkspace(page, console.log);
    await ensureDropshotControls(page, console.log);
    await page.waitForTimeout(2000);
    const workspaceReadyAfter = await isImageWorkspaceReady(page);

    const snapshot = await page.evaluate(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0';
      };
      const rectOf = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      };
      return {
        url: location.href,
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 2500) || '',
        inputs: Array.from(
          document.querySelectorAll('textarea, input, [contenteditable="true"], div[role="textbox"]'),
        ).map((el) => ({
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          role: el.getAttribute('role') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          placeholder: el.getAttribute('placeholder') || '',
          text: el.textContent || '',
          value: el.value || '',
          visible: visible(el),
          rect: rectOf(el),
        })),
        buttons: Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
          tag: el.tagName,
          role: el.getAttribute('role') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          text: el.innerText || el.textContent || '',
          disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
          visible: visible(el),
          rect: rectOf(el),
        })),
        images: Array.from(document.querySelectorAll('img')).map((el) => ({
          src: el.currentSrc || el.src || '',
          alt: el.alt || '',
          naturalWidth: el.naturalWidth || 0,
          naturalHeight: el.naturalHeight || 0,
          visible: visible(el),
          rect: rectOf(el),
        })),
      };
    });

    const screenshotPath = path.join(outputDir, `dropshot-page-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const report = {
      loggedIn,
      workspaceReadyBefore,
      opened,
      workspaceReadyAfter,
      url: snapshot.url,
      title: snapshot.title,
      visibleInputs: snapshot.inputs
        .filter((input) => input.visible)
        .map((input) => ({
          ...input,
          text: simplify(input.text),
          value: simplify(input.value),
        })),
      visibleButtons: snapshot.buttons
        .filter((button) => button.visible)
        .map((button) => ({
          ...button,
          text: simplify(button.text),
        })),
      visibleImages: snapshot.images
        .filter((image) => image.visible && image.naturalWidth >= 80)
        .slice(0, 20),
      bodyText: simplify(snapshot.bodyText),
      screenshotPath,
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('[dropshot-diagnose] FAILED');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
