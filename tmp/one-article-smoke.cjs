/* eslint-disable no-console */
/**
 * 키워드 하나로 실제 앱 경로(팩트체크 포함)를 태워 글 한 편을 뽑는다.
 *   electron tmp/one-article-smoke.cjs "키워드"
 * 전체 콘솔 로그와 본문을 tmp/one-article/ 에 저장한다.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

const KEYWORD = process.argv[2];
const MODE = process.argv[3] || 'seo';
if (!KEYWORD) { console.error('키워드를 주세요'); process.exit(1); }

function userDataDir() {
  const base = process.env.APPDATA
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  const cur = path.join(base, 'better-life-naver');
  return fs.existsSync(cur) ? cur : path.join(base, 'naver-blog-automation');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(process.cwd(), 'tmp', 'one-article', stamp);
fs.mkdirSync(outDir, { recursive: true });

// 콘솔을 전부 파일로도 받는다 — 팩트체크가 무엇을 했는지 봐야 한다.
const logPath = path.join(outDir, 'console.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    try { logStream.write(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'); } catch {}
    orig(...args);
  };
}

async function main() {
  const dir = process.env.ONE_ARTICLE_USERDATA || userDataDir();
  app.setName(path.basename(dir));
  app.setPath('userData', dir);
  app.setPath('temp', path.join(outDir, 'electron-temp'));
  fs.mkdirSync(path.join(outDir, 'electron-temp'), { recursive: true });
  await app.whenReady();

  const { loadConfig, applyConfigToEnv } = require('../dist/configManager.js');
  const { generateStructuredContent } = require('../dist/contentGenerator.js');
  const config = await loadConfig();
  applyConfigToEnv(config);
  // 모델 비교용 오버라이드 — applyConfigToEnv 가 config 값으로 덮으므로 그 뒤에 다시 세운다.
  if (process.env.FORCE_GEMINI_MODEL) {
    process.env.GEMINI_MODEL = process.env.FORCE_GEMINI_MODEL;
    config.primaryGeminiTextModel = process.env.FORCE_GEMINI_MODEL;
    config.geminiModel = process.env.FORCE_GEMINI_MODEL;
    console.log('[one-article] GEMINI_MODEL 강제: ' + process.env.FORCE_GEMINI_MODEL);
  }

  const provider = process.env.ONE_ARTICLE_PROVIDER || config.defaultAiProvider || 'gemini';
  console.log(`[one-article] keyword="${KEYWORD}" mode=${MODE} provider=${provider}`);
  console.log(`[one-article] factCheckEngine=${config.factCheckEngine ?? '(미설정→auto)'}`);

  const { assembleContentSource } = require('../dist/sourceAssembler.js');
  const { validateFactCheckSource } = require('../dist/naverFactCheckRAG.js');

  const { source, warnings } = await assembleContentSource({
    keywords: [KEYWORD],
    targetAge: 'all',
    generator: provider,
    naverClientId: config.naverClientId,
    naverClientSecret: config.naverClientSecret,
    minChars: Number(config.minCharCount) || 2500,
  });
  source.contentMode = MODE;
  source.toneStyle = 'friendly';
  for (const w of warnings) console.warn(`[one-article] assembly warning: ${w}`);
  console.log(`[one-article] assemble 후 rawText=${(source.rawText || '').length}자`);

  // main.ts 와 동일한 조건: rawText 200자 미만이면 네이버 RAG 로 보강
  if (!source.rawText || source.rawText.trim().length < 200) {
    const validation = await validateFactCheckSource(KEYWORD);
    console.log(`[one-article] RAG 검증: passed=${validation.passed} ${validation.totalChars}자 매칭률=${Math.round(validation.keywordCoverage * 100)}% ${validation.reason || ''}`);
    if (validation.rawText) {
      const wrapped = `<source id="naver-rag">
${validation.rawText}
</source>`;
      source.rawText = source.rawText && source.rawText.trim().length >= 50
        ? `${source.rawText}

=== 네이버 검색 자료 ===
${wrapped}`
        : wrapped;
      if (validation.passed) {
        source.hasFactCheckSource = true;
        source.factCheckRawSource = validation.rawText;
      }
    }
  }
  console.log(`[one-article] 최종 rawText=${(source.rawText || '').length}자 hasFactCheckSource=${!!source.hasFactCheckSource}`);
  fs.writeFileSync(path.join(outDir, 'material.txt'), String(source.rawText || ''), 'utf-8');

  const started = Date.now();
  const content = await generateStructuredContent(source, {
    provider,
    contentMode: MODE,
    minChars: Number(config.minCharCount) || 2500,
    ...(process.env.ONE_ARTICLE_MODEL ? { modelOverride: process.env.ONE_ARTICLE_MODEL } : {}),
  });
  const elapsed = Math.round((Date.now() - started) / 1000);

  const body = String(content?.bodyPlain || '');
  const article = [
    `제목: ${content?.selectedTitle || content?.title || ''}`,
    '',
    String(content?.introduction || ''),
    '',
    ...(Array.isArray(content?.headings) ? content.headings.map((h) => `## ${h?.title || ''}\n${h?.content || ''}`) : []),
    '',
    String(content?.conclusion || ''),
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'article.md'), article, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'content.json'), JSON.stringify(content, null, 2), 'utf-8');
  console.log(`[one-article] 완료 ${elapsed}s · 본문 ${body.length}자 · 소제목 ${(content?.headings || []).length}개`);
  console.log(`[one-article] out=${outDir}`);
  await new Promise((r) => logStream.end(r));   // 로그 flush 후 종료 — 잘리면 원인 추적이 불가능하다
  app.quit();
  process.exit(0);
}

main().catch((e) => {
  console.error('[one-article] fatal:', e?.stack || e?.message || e);
  try { app.quit(); } catch {}
  process.exit(1);
});
