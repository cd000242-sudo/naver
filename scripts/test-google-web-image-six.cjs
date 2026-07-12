/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

const SUPPORTED_PROVIDERS = new Set([
  'imagefx',
  'flow',
  'dropshot',
  'nano-banana-2',
  'gpt-image-2',
  'openai-image',
  'deepinfra',
  'leonardoai',
]);

const PROVIDER_TIMEOUT_MS = {
  imagefx: 25 * 60 * 1000,
  flow: 35 * 60 * 1000,
  dropshot: 35 * 60 * 1000,
  'nano-banana-2': 12 * 60 * 1000,
  'gpt-image-2': 12 * 60 * 1000,
  'openai-image': 12 * 60 * 1000,
  deepinfra: 12 * 60 * 1000,
  leonardoai: 18 * 60 * 1000,
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const providerArg = args.find((arg) => !arg.startsWith('--')) || 'imagefx,flow';
  const countArg = args.find((arg) => arg.startsWith('--count='));
  const stabilizeMsArg = args.find((arg) => arg.startsWith('--stabilize-ms='));
  const timeoutMinutesArg = args.find((arg) => arg.startsWith('--timeout-min='));
  const sequential = args.includes('--sequential');
  const count = countArg ? Math.max(1, Number(countArg.split('=')[1]) || 6) : 6;
  const stabilizeMs = stabilizeMsArg ? Math.max(0, Number(stabilizeMsArg.split('=')[1]) || 0) : undefined;
  const timeoutMinutes = timeoutMinutesArg ? Math.max(1, Number(timeoutMinutesArg.split('=')[1]) || 0) : undefined;
  const providers = providerArg
    .split(',')
    .map((provider) => provider.trim())
    .filter(Boolean)
    .map((provider) => (provider === 'gpt-image-2' ? 'openai-image' : provider));

  const unknown = providers.filter((provider) => !SUPPORTED_PROVIDERS.has(provider));
  if (unknown.length > 0) {
    throw new Error(`Unknown provider(s): ${unknown.join(', ')}`);
  }

  return { providers, count, sequential, stabilizeMs, timeoutMinutes };
}

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
  const dir = path.join(process.cwd(), 'tmp', 'image-six-smoke', stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function log(message) {
  const line = `[six-smoke] ${message}`;
  console.log(line);
}

function makePrompt(index) {
  const scenes = [
    'premium Korean lifestyle blog thumbnail, dehumidifier and air circulator near laundry rack, bright clean apartment, realistic photography, no logo',
    'close-up of indoor laundry drying setup with soft daylight and organized towels, editorial realistic photo, no readable text, no watermark',
    'modern Korean apartment utility room, airflow path from circulator to hanging laundry, calm practical mood, realistic photo, no logo',
    'minimal home appliance comparison scene, dehumidifier beside fan, clean composition, soft shadows, realistic editorial photography',
    'rainy season indoor drying scene, neat laundry rack and humidity control, warm natural light, premium blog image, no watermark',
    'safe home laundry drying checklist visual, clean apartment interior, dehumidifier, air circulation, realistic photography, no logo',
  ];
  return scenes[index % scenes.length];
}

function makeItems(provider, count) {
  return Array.from({ length: count }, (_, index) => {
    const prompt = makePrompt(index);
    return {
      heading: `${provider} six image ${String(index + 1).padStart(2, '0')}`,
      prompt,
      englishPrompt: prompt,
      isThumbnail: index === 0,
      allowText: index === 0,
      originalIndex: index,
      imageRatio: '1:1',
      aspectRatio: '1:1',
      category: '생활',
    };
  });
}

function getApiKeys(config) {
  return {
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    openaiImageApiKey: config.openaiImageApiKey || config.openaiApiKey,
    deepinfraApiKey: config.deepinfraApiKey,
    leonardoaiApiKey: config.leonardoaiApiKey,
  };
}

function summarizeImage(image, index) {
  const filePath = image?.savedToLocal || image?.filePath || '';
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
    index: index + 1,
    heading: image?.heading || '',
    provider: image?.provider || image?.actualProvider || '',
    filePath,
    exists,
    bytes,
    hasPreviewDataUrl: typeof image?.previewDataUrl === 'string' && image.previewDataUrl.length > 1024,
    url: image?.url || '',
  };
}

function getProviderTimeoutMs(provider, count, timeoutMinutes) {
  if (Number.isFinite(timeoutMinutes) && timeoutMinutes > 0) {
    return timeoutMinutes * 60 * 1000;
  }
  const base = PROVIDER_TIMEOUT_MS[provider] || 20 * 60 * 1000;
  if (provider === 'flow') {
    return Math.min(60 * 60 * 1000, Math.max(base, 120_000 + (count * 210_000)));
  }
  return base;
}

async function runWithHardTimeout(provider, count, timeoutMinutes, task) {
  const timeoutMs = getProviderTimeoutMs(provider, count, timeoutMinutes);
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${provider} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function cleanupProvider(provider) {
  if (provider !== 'flow') return;
  try {
    const { resetFlowState } = require('../dist/image/flowGenerator.js');
    await resetFlowState();
    log('flow: browser state cleaned up');
  } catch (error) {
    log(`flow: cleanup warning ${error?.message || error}`);
  }
}

async function testProvider(provider, count, config, timeoutMinutes) {
  const normalizedProvider = provider === 'gpt-image-2' ? 'openai-image' : provider;
  const { generateImages } = require('../dist/imageGenerator.js');
  const startedAt = Date.now();
  const callbackTimes = [];
  const callbackImages = [];

  log(`${normalizedProvider}: start ${count} images`);

  const images = await runWithHardTimeout(normalizedProvider, count, timeoutMinutes, () =>
    generateImages(
      {
        provider: normalizedProvider,
        items: makeItems(normalizedProvider, count),
        postTitle: '제습기와 서큘레이터 같이 쓰면 빨래가 더 빨리 마를까',
        postId: `six-smoke-${normalizedProvider}-${Date.now()}`,
        isFullAuto: true,
        forceSequential: true,
        thumbnailTextInclude: true,
        category: '생활',
        imageFallbackPolicy: 'engine-only',
      },
      getApiKeys(config),
      (image, index, total) => {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        const savedPath = image?.savedToLocal || image?.filePath || image?.url || '';
        callbackTimes.push({ index: index + 1, total, elapsedSeconds, savedPath });
        callbackImages.push(image);
        log(`${normalizedProvider}: callback ${index + 1}/${total} at ${elapsedSeconds}s ${savedPath}`);
      },
    )
  );

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  const imageSummaries = images.map(summarizeImage);
  const usableCount = imageSummaries.filter((image) =>
    (image.exists && image.bytes > 1024) ||
    image.hasPreviewDataUrl ||
    /^https?:\/\//i.test(image.url),
  ).length;

  return {
    provider: normalizedProvider,
    requestedCount: count,
    status: usableCount === count ? 'passed' : 'failed',
    elapsedSeconds,
    averageSecondsPerUsableImage: usableCount > 0 ? Math.round(elapsedSeconds / usableCount) : null,
    callbackCount: callbackTimes.length,
    usableCount,
    callbackTimes,
    images: imageSummaries,
    callbackImageCount: callbackImages.length,
  };
}

async function main() {
  const { providers, count, sequential, stabilizeMs, timeoutMinutes } = parseArgs(process.argv);
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
  if (sequential) {
    process.env.FLOW_SEQUENTIAL = '1';
  }
  if (Number.isFinite(stabilizeMs) && stabilizeMs >= 0) {
    process.env.FLOW_SEQUENTIAL_IMAGE_STABILIZE_MS = String(stabilizeMs);
  }

  await app.whenReady();

  const { loadConfig } = require('../dist/configManager.js');
  const config = await loadConfig();
  const results = [];

  log(`providers=${providers.join(', ')} count=${count} sequential=${sequential} stabilizeMs=${process.env.FLOW_SEQUENTIAL_IMAGE_STABILIZE_MS || '(default)'} timeoutMin=${timeoutMinutes || '(auto)'}`);
  log(`output=${outDir}`);

  for (const provider of providers) {
    try {
      const result = await testProvider(provider, count, config, timeoutMinutes);
      results.push(result);
      log(`${result.provider}: ${result.status} ${result.usableCount}/${result.requestedCount} in ${result.elapsedSeconds}s`);
    } catch (error) {
      const failed = {
        provider,
        requestedCount: count,
        status: 'failed',
        elapsedSeconds: 0,
        usableCount: 0,
        error: error?.stack || error?.message || String(error),
      };
      results.push(failed);
      log(`${provider}: failed ${String(failed.error).slice(0, 500)}`);
    } finally {
      await cleanupProvider(provider);
    }
  }

  const reportPath = path.join(outDir, `report-${providers.join('-')}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  log(`report=${reportPath}`);
  console.log(JSON.stringify(results, null, 2));

  const failedCount = results.filter((result) => result.status !== 'passed').length;
  app.quit();
  process.exit(failedCount > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error('[six-smoke] fatal');
  console.error(error?.stack || error?.message || error);
  app.quit();
  process.exit(1);
});
