/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

process.env.TEST_MODE = process.env.TEST_MODE || '1';
process.env.GENERATED_IMAGES_DIR =
  process.env.GENERATED_IMAGES_DIR ||
  path.join(process.cwd(), 'tmp', 'dropshot-sequential');

fs.mkdirSync(process.env.GENERATED_IMAGES_DIR, { recursive: true });

const distLoginPath = path.join(process.cwd(), 'dist', 'image', 'dropshotLogin.js');
const distGeneratorPath = path.join(process.cwd(), 'dist', 'image', 'dropshotGenerator.js');
const distCorePath = path.join(process.cwd(), 'dist', 'image', 'dropshotCore.js');

if (!fs.existsSync(distLoginPath) || !fs.existsSync(distGeneratorPath) || !fs.existsSync(distCorePath)) {
  console.error('[dropshot-seq] dist files are missing. Run npm run build first.');
  process.exit(1);
}

const { checkDropshotLogin, dropshotLogin } = require(distLoginPath);
const { generateWithDropshot } = require(distGeneratorPath);
const { closeBrowserCache } = require(distCorePath);

const prompts = [
  'Premium Korean blog thumbnail photo, clean modern desk, blue notebook, warm daylight, realistic, no text, no logo',
  'Minimal productivity workspace with laptop, paper planner, soft green plant, realistic editorial photo, no text, no logo',
  'Korean small business owner checking analytics on tablet, bright office, natural light, realistic, no text, no logo',
  'Elegant blog illustration style, mobile phone beside coffee and memo cards, clean composition, no text, no logo',
  'Realistic close-up of organized notes and calendar on white desk, calm professional mood, no text, no logo',
  'Premium lifestyle blog image, laptop screen glow, tidy workspace, soft neutral background, realistic, no text, no logo',
];

function log(message) {
  console.log(`[dropshot-seq] ${message}`);
}

async function ensureLogin() {
  log('checking saved Dropshot login session...');
  let status = await checkDropshotLogin(log);
  if (status && status.loggedIn) {
    log(`login OK: ${status.message || 'session found'}`);
    return;
  }

  log('login is required. A browser window will open now.');
  log('After login is detected, the visible window will close and generation continues hidden.');
  status = await dropshotLogin(log);
  if (!status || !status.loggedIn) {
    throw new Error(status?.message || 'Dropshot login failed');
  }
  log(`login OK: ${status.message || 'session saved'}`);
}

async function main() {
  log('starting 6-image sequential Dropshot/Nano Banana Pro test');
  log(`output dir: ${process.env.GENERATED_IMAGES_DIR}`);
  await ensureLogin();

  const results = [];
  for (let index = 0; index < prompts.length; index += 1) {
    const item = {
      heading: `dropshot-sequential-${index + 1}`,
      prompt: prompts[index],
      englishPrompt: prompts[index],
      isThumbnail: index === 0,
      originalIndex: index,
      imageRatio: '1:1',
    };

    const started = Date.now();
    log(`${index + 1}/${prompts.length} generating one image...`);
    const generated = await generateWithDropshot(
      [item],
      'dropshot sequential smoke test',
      `dropshot-seq-${Date.now()}-${index + 1}`,
      true,
      false,
      undefined,
      (img, generatedIndex, total) => {
        const savedPath = img.savedToLocal || img.filePath;
        log(`callback ${generatedIndex + 1}/${total}: ${savedPath}`);
      },
    );

    if (!Array.isArray(generated) || generated.length !== 1) {
      throw new Error(
        `Expected exactly 1 image for item ${index + 1}, got ${generated?.length || 0}`,
      );
    }

    const image = generated[0];
    const savedPath = image.savedToLocal || image.filePath;
    if (!savedPath || !fs.existsSync(savedPath)) {
      throw new Error(`Generated file does not exist for item ${index + 1}: ${savedPath}`);
    }

    const size = fs.statSync(savedPath).size;
    if (size < 1024) {
      throw new Error(`Generated file is too small for item ${index + 1}: ${size} bytes`);
    }

    const elapsed = Math.round((Date.now() - started) / 1000);
    log(`${index + 1}/${prompts.length} done in ${elapsed}s: ${savedPath} (${size} bytes)`);
    results.push({ index: index + 1, savedPath, size, elapsedSeconds: elapsed });
  }

  log('SUCCESS: 6/6 images generated sequentially');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .then(async () => {
    if (typeof closeBrowserCache === 'function') await closeBrowserCache();
  })
  .catch(async (error) => {
    if (typeof closeBrowserCache === 'function') {
      await closeBrowserCache().catch(() => undefined);
    }
    console.error('[dropshot-seq] FAILED');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
