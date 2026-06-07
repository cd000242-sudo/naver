/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

const PROVIDERS = {
  'nano-banana-2': {
    label: 'Nano Banana 2',
    keyName: 'geminiApiKey',
    envName: 'GEMINI_API_KEY',
    timeoutMs: 8 * 60 * 1000,
  },
  'gpt-image-2': {
    label: 'GPT Image 2',
    keyName: 'openaiImageApiKey',
    fallbackKeyName: 'openaiApiKey',
    envName: 'OPENAI_API_KEY',
    timeoutMs: 5 * 60 * 1000,
  },
  deepinfra: {
    label: 'DeepInfra',
    keyName: 'deepinfraApiKey',
    envName: 'DEEPINFRA_API_KEY',
    timeoutMs: 5 * 60 * 1000,
  },
  leonardoai: {
    label: 'Leonardo AI',
    keyName: 'leonardoaiApiKey',
    envName: 'LEONARDOAI_API_KEY',
    timeoutMs: 8 * 60 * 1000,
  },
};

function getUserDataDir() {
  const base =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  if (process.env.BETTER_LIFE_NAVER_USER_DATA) {
    return process.env.BETTER_LIFE_NAVER_USER_DATA;
  }
  const current = path.join(base, 'better-life-naver');
  const legacy = path.join(base, 'naver-blog-automation');
  return fs.existsSync(current) ? current : legacy;
}

function makeOutputDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'tmp', 'image-provider-smoke', stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getKey(config, spec) {
  const primary = typeof config?.[spec.keyName] === 'string' ? config[spec.keyName].trim() : '';
  if (primary) return primary;
  if (!spec.fallbackKeyName) return '';
  const fallback = typeof config?.[spec.fallbackKeyName] === 'string'
    ? config[spec.fallbackKeyName].trim()
    : '';
  return fallback;
}

function maskKey(key) {
  if (!key) return 'missing';
  return `${key.slice(0, 4)}...len=${key.length}`;
}

function makeItem(label) {
  const prompt = [
    'A clean premium Korean blog editorial image',
    'minimal modern workspace, soft daylight, tasteful composition',
    'realistic photography, no text, no logo, no watermark',
  ].join(', ');

  return {
    heading: `${label} smoke image`,
    prompt,
    englishPrompt: prompt,
    isThumbnail: true,
    allowText: false,
    originalIndex: 0,
    imageRatio: '1:1',
  };
}

function summarizeImage(image) {
  const filePath = image?.savedToLocal || image?.filePath || '';
  const url = image?.url || '';
  const previewBytes = image?.previewDataUrl ? image.previewDataUrl.length : 0;
  let exists = false;
  let bytes = 0;

  if (filePath) {
    try {
      const stat = fs.statSync(filePath);
      exists = stat.isFile();
      bytes = stat.size;
    } catch {
      exists = false;
    }
  }

  return {
    heading: image?.heading || '',
    provider: image?.provider || image?.actualProvider || '',
    filePath,
    url,
    exists,
    bytes,
    hasPreviewDataUrl: previewBytes > 1024,
  };
}

async function runWithHardTimeout(label, timeoutMs, task) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} smoke timeout after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function testProvider(provider, config, outDir) {
  const spec = PROVIDERS[provider];
  if (!spec) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const key = getKey(config, spec);
  const report = {
    provider,
    label: spec.label,
    status: 'pending',
    startedAt: new Date().toISOString(),
    key: maskKey(key),
    outputDir: outDir,
    callbackCount: 0,
    images: [],
    error: '',
    elapsedSeconds: 0,
  };

  if (!key) {
    report.status = 'skipped';
    report.error = `${spec.keyName}${spec.fallbackKeyName ? ` or ${spec.fallbackKeyName}` : ''} is not configured`;
    return report;
  }

  process.env[spec.envName] = key;
  if (provider === 'gpt-image-2') {
    process.env.OPENAI_API_KEY = key;
  }

  const started = Date.now();
  try {
    if (provider === 'gpt-image-2') {
      const { generateWithOpenAIImage } = require('../dist/image/openaiImageGenerator.js');
      const images = await runWithHardTimeout(spec.label, spec.timeoutMs, () =>
        generateWithOpenAIImage(
          [makeItem(spec.label)],
          'image provider smoke test',
          `smoke-${provider}-${Date.now()}`,
          false,
          key,
          false,
          (image, index, total) => {
            report.callbackCount += 1;
            console.log(`[${provider}] callback ${index + 1}/${total}: ${image?.filePath || image?.savedToLocal || image?.url || ''}`);
          },
          undefined,
          'gpt-image-2',
          config.openaiApiKey,
        ),
      );
      report.images = images.map(summarizeImage);
    } else {
      const { generateImages } = require('../dist/imageGenerator.js');
      const apiKeys = {
        geminiApiKey: provider === 'nano-banana-2' ? key : config.geminiApiKey,
        openaiImageApiKey: config.openaiImageApiKey || config.openaiApiKey,
        deepinfraApiKey: provider === 'deepinfra' ? key : config.deepinfraApiKey,
        leonardoaiApiKey: provider === 'leonardoai' ? key : config.leonardoaiApiKey,
      };
      const images = await runWithHardTimeout(spec.label, spec.timeoutMs, () =>
        generateImages(
          {
            provider,
            items: [makeItem(spec.label)],
            postTitle: 'image provider smoke test',
            postId: `smoke-${provider}-${Date.now()}`,
            isFullAuto: false,
            imageFallbackPolicy: 'engine-only',
            thumbnailTextInclude: false,
          },
          apiKeys,
          (image, index, total) => {
            report.callbackCount += 1;
            console.log(`[${provider}] callback ${index + 1}/${total}: ${image?.filePath || image?.savedToLocal || image?.url || ''}`);
          },
        ),
      );
      report.images = images.map(summarizeImage);
    }

    const hasRealImage = report.images.some((image) =>
      (image.exists && image.bytes > 1024) || image.hasPreviewDataUrl || /^https?:\/\//i.test(image.url),
    );
    report.status = hasRealImage ? 'passed' : 'failed';
    if (!hasRealImage) {
      report.error = 'Generation returned no usable image file/url/preview data.';
    }
  } catch (error) {
    report.status = 'failed';
    report.error = error?.stack || error?.message || String(error);
  } finally {
    report.elapsedSeconds = Math.round((Date.now() - started) / 1000);
    report.finishedAt = new Date().toISOString();
  }

  return report;
}

async function main() {
  const target = process.argv[2] || 'all';
  const providers = target === 'all' ? Object.keys(PROVIDERS) : [target];
  const unknown = providers.filter((provider) => !PROVIDERS[provider]);
  if (unknown.length > 0) {
    console.error(`Unknown provider(s): ${unknown.join(', ')}`);
    process.exit(64);
  }

  const outDir = makeOutputDir();
  const userDataDir = getUserDataDir();
  const tempDir = path.join(outDir, 'electron-temp');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  app.setName(path.basename(userDataDir));
  app.setPath('userData', userDataDir);
  app.setPath('temp', tempDir);

  process.env.TEST_MODE = '1';
  process.env.GENERATED_IMAGES_DIR = outDir;

  await app.whenReady();

  const { loadConfig } = require('../dist/configManager.js');
  const config = await loadConfig();
  const results = [];

  for (const provider of providers) {
    console.log(`[smoke] testing ${provider} (${PROVIDERS[provider].label})`);
    const result = await testProvider(provider, config, outDir);
    results.push(result);
    console.log(`[smoke] ${provider}: ${result.status} (${result.elapsedSeconds}s)`);
    if (result.error) {
      console.log(`[smoke] ${provider} detail: ${String(result.error).slice(0, 800)}`);
    }
  }

  const reportPath = path.join(outDir, `report-${target}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`[smoke] report: ${reportPath}`);
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((result) => result.status === 'failed');
  app.quit();
  process.exit(failed.length > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error('[smoke] fatal');
  console.error(error?.stack || error?.message || error);
  try { app.quit(); } catch {}
  process.exit(1);
});
