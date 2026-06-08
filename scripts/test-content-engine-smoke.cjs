/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

const PROVIDERS = ['gemini', 'openai', 'claude', 'perplexity'];
const TIMEOUT_MS = Number(process.env.CONTENT_ENGINE_APP_TEST_TIMEOUT_MS || 4 * 60 * 1000);
const PROVIDER_DELAY_MS = Number(process.env.CONTENT_ENGINE_APP_TEST_PROVIDER_DELAY_MS || 3000);

function parseProviders(argv) {
  const arg = argv[2] || 'all';
  const providers = arg === 'all'
    ? PROVIDERS
    : arg.split(',').map((provider) => provider.trim().toLowerCase()).filter(Boolean);
  const unknown = providers.filter((provider) => !PROVIDERS.includes(provider));
  if (unknown.length > 0) {
    throw new Error(`Unknown content provider(s): ${unknown.join(', ')}`);
  }
  return providers;
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
  const dir = path.join(process.cwd(), 'tmp', 'content-engine-smoke', stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function maskSecret(value) {
  if (typeof value !== 'string' || !value.trim()) return 'missing';
  return `present(len=${value.trim().length})`;
}

function summarizeConfig(config) {
  return {
    defaultAiProvider: config.defaultAiProvider || '',
    primaryGeminiTextModel: config.primaryGeminiTextModel || config.geminiModel || '',
    geminiApiKey: maskSecret(config.geminiApiKey),
    geminiApiKeys: Array.isArray(config.geminiApiKeys) ? `${config.geminiApiKeys.length} extra key(s)` : '0 extra key(s)',
    openaiApiKey: maskSecret(config.openaiApiKey),
    claudeApiKey: maskSecret(config.claudeApiKey),
    perplexityApiKey: maskSecret(config.perplexityApiKey),
  };
}

function buildSource(provider) {
  const title = `콘텐츠 엔진 점검 ${provider}`;
  const rawText = [
    '네이버 블로그 모바일 가독성을 높이려면 문단을 짧게 나누고 핵심 문장만 강조해야 한다.',
    '독자는 긴 문단보다 한눈에 이해되는 흐름을 선호한다.',
    '표, 체크리스트, Q&A는 필요한 주제에서만 자연스럽게 넣는 것이 좋다.',
    '이 테스트는 실제 앱 설정의 AI 엔진이 한국어 글 구조를 정상 생성하는지 확인하기 위한 짧은 원문이다.',
  ].join('\n');

  return {
    title,
    rawText,
    contentMode: 'seo',
    sourceType: 'custom_text',
    metadata: {
      keywords: ['네이버 블로그 모바일 가독성', '문단 정리', provider],
    },
  };
}

function classifyExternal(error) {
  const message = `${error?.message || error || ''}`.toLowerCase();
  if (/api 키|api key|unauthorized|forbidden|invalid_api_key|invalid api key|incorrect api key|401|403|not configured|설정되지/.test(message)) {
    return 'auth';
  }
  if (/billing|payment|insufficient_quota|credit|balance|결제|크레딧|safety lock|예산 한도/.test(message)) {
    return 'billing';
  }
  if (/429|rate limit|too many requests|quota|resource_exhausted|rpm|tpm|요청 한도|토큰 한도|분당/.test(message)) {
    return 'quota';
  }
  return '';
}

function summarizeContent(content) {
  const body = String(content?.bodyPlain || content?.bodyHtml || '');
  return {
    selectedTitle: String(content?.selectedTitle || content?.title || '').slice(0, 80),
    bodyChars: body.length,
    headingCount: Array.isArray(content?.headings) ? content.headings.length : 0,
    hashtagCount: Array.isArray(content?.hashtags) ? content.hashtags.length : 0,
    hasKorean: /[가-힣]/.test(body),
  };
}

async function runWithTimeout(label, task) {
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(TIMEOUT_MS / 1000)}s`)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testProvider(provider, generateStructuredContent) {
  const startedAt = Date.now();
  const report = {
    provider,
    status: 'pending',
    elapsedSeconds: 0,
    externalReason: '',
    error: '',
    content: null,
  };

  try {
    const content = await runWithTimeout(provider, () =>
      generateStructuredContent(buildSource(provider), {
        provider,
        minChars: Number(process.env.CONTENT_ENGINE_APP_TEST_MIN_CHARS || 700),
        contentMode: 'seo',
      }),
    );
    report.content = summarizeContent(content);
    report.status = report.content.bodyChars >= 300 && report.content.headingCount >= 1 && report.content.hasKorean
      ? 'passed'
      : 'failed';
    if (report.status === 'failed') {
      report.error = `Unexpected content shape: ${JSON.stringify(report.content)}`;
    }
  } catch (error) {
    const externalReason = classifyExternal(error);
    report.status = externalReason ? 'external' : 'failed';
    report.externalReason = externalReason;
    report.error = String(error?.message || error).slice(0, 1200);
  } finally {
    report.elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  }

  return report;
}

async function main() {
  const providers = parseProviders(process.argv);
  const outDir = makeOutputDir();
  const userDataDir = getUserDataDir();
  const tempDir = path.join(outDir, 'electron-temp');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  app.setName(path.basename(userDataDir));
  app.setPath('userData', userDataDir);
  app.setPath('temp', tempDir);
  process.env.TEST_MODE = '1';

  await app.whenReady();

  const { loadConfig, applyConfigToEnv } = require('../dist/configManager.js');
  const { generateStructuredContent } = require('../dist/contentGenerator.js');
  const config = await loadConfig();
  applyConfigToEnv(config);

  console.log('[content-app-smoke] config', JSON.stringify(summarizeConfig(config), null, 2));
  console.log(`[content-app-smoke] providers=${providers.join(', ')} output=${outDir}`);

  const results = [];
  for (const [index, provider] of providers.entries()) {
    console.log(`[content-app-smoke] RUN ${index + 1}/${providers.length} ${provider}`);
    const result = await testProvider(provider, generateStructuredContent);
    results.push(result);
    console.log(`[content-app-smoke] ${provider}: ${result.status} (${result.elapsedSeconds}s)`);
    if (result.externalReason || result.error) {
      console.log(`[content-app-smoke] ${provider} detail: ${result.externalReason || result.error}`);
    }
    if (index < providers.length - 1 && PROVIDER_DELAY_MS > 0) {
      await sleep(PROVIDER_DELAY_MS);
    }
  }

  const reportPath = path.join(outDir, `report-${providers.join('-')}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`[content-app-smoke] report=${reportPath}`);
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((result) => result.status === 'failed');
  app.quit();
  process.exit(failed.length > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error('[content-app-smoke] fatal');
  console.error(error?.stack || error?.message || error);
  try { app.quit(); } catch {}
  process.exit(1);
});
