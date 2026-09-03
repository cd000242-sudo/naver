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

const KEYWORD = process.env.ONE_ARTICLE_INPUT || process.argv[2];
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

  /*
   * [2026-09-01] 엔진만 바꾸고 모델을 안 바꾸면 TEXT_MODEL_PROVIDER_MISMATCH 로 죽는다.
   *   expected=openai, selected=gemini-3.1-flash-lite, actual=gemini
   * 앱에서는 엔진 라디오가 모델까지 같이 정하는데, 이 하네스는 provider 만 넘겼다.
   * ONE_ARTICLE_MODEL 로 모델을 함께 지정한다 — 원본 스모크는 건드리지 않는다.
   */
  const provider = process.env.ONE_ARTICLE_PROVIDER || config.defaultAiProvider || 'gemini';
  if (process.env.ONE_ARTICLE_MODEL) {
    /*
     * 메모리의 config 만 바꾸면 안 먹는다 — 생성기가 loadConfig() 로 파일에서 다시 읽는다
     * (contentGenerator.ts:4222). 설정 파일에 직접 쓰고, 끝나면 원래 값으로 되돌린다.
     */
    const settingsFile = (() => {
      try {
        const dir = process.env.ONE_ARTICLE_USERDATA || userDataDir();
        const f = fs.readdirSync(dir).find((x) => x.startsWith('settings_') && x.endsWith('.json'));
        return f ? path.join(dir, f) : null;
      } catch { return null; }
    })();
    if (settingsFile) {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      global.__ONE_ARTICLE_RESTORE__ = { file: settingsFile, model: saved.primaryGeminiTextModel };
      saved.primaryGeminiTextModel = process.env.ONE_ARTICLE_MODEL;
      fs.writeFileSync(settingsFile, JSON.stringify(saved, null, 2), 'utf-8');
      console.log('[one-article] 설정 파일에 텍스트 모델 기록: ' + process.env.ONE_ARTICLE_MODEL
        + ' (원래 값: ' + (global.__ONE_ARTICLE_RESTORE__.model || '(없음)') + ')');
    }
    config.primaryGeminiTextModel = process.env.ONE_ARTICLE_MODEL;
  }
  console.log(`[one-article] keyword="${KEYWORD}" mode=${MODE} provider=${provider}`);
  console.log(`[one-article] factCheckEngine=${config.factCheckEngine ?? '(미설정→auto)'}`);

  const { assembleContentSource } = require('../dist/sourceAssembler.js');
  const { validateFactCheckSource } = require('../dist/naverFactCheckRAG.js');

  const isUrl = /^https?:\/\//i.test(KEYWORD);
  const { source, warnings } = await assembleContentSource({
    ...(isUrl ? { rssUrl: KEYWORD } : {}),
    keywords: isUrl ? [] : (process.env.ONE_ARTICLE_KEYWORDS ? process.env.ONE_ARTICLE_KEYWORDS.split(',').map((s) => s.trim()).filter(Boolean) : [KEYWORD]),
    targetAge: 'all',
    generator: provider,
    naverClientId: config.naverClientId,
    naverClientSecret: config.naverClientSecret,
    minChars: Number(config.minCharCount) || 2500,
  });
  source.contentMode = MODE;
  // [2026-09-03] 쇼핑 비평용 — main.ts 의 쇼핑커넥트 플로우와 같은 플래그를 세운다.
  if (isUrl && MODE === 'affiliate') {
    source.affiliateLink = KEYWORD;
    source.aiExperienceGeneration = process.env.ONE_ARTICLE_EXPERIENCE !== 'off';
    console.log(`[one-article] 쇼핑커넥트: affiliateLink 설정, AI 경험 옵트인=${source.aiExperienceGeneration ? 'ON' : 'OFF'} · 리뷰 ${Array.isArray(source.productReviews) ? source.productReviews.length : 0}건 · 스펙 ${source.productSpec ? '있음' : '없음'}`);
  }
  // main.ts 와 동일: URL 상위노출 글이면 1단 노출 분석을 붙인다.
  try {
    const { attachParaphraseUpgradeBrief } = require('../dist/main/paraphraseUpgradeForUrl.js');
    const up = await attachParaphraseUpgradeBrief(source, config, provider);
    if (up.attached) {
      source.paraphraseUpgradeBrief = up.brief;
      if (up.mainKeyword) source.metadata = { ...(source.metadata || {}), keywords: [up.mainKeyword, ...up.subKeywords].slice(0, 5) };
      console.log(`[one-article] ⬆️ 상위호환 1단 분석 완료 (${up.reason}) — 메인키워드=${up.mainKeyword}`);
    } else {
      console.log(`[one-article] ⬆️ 상위호환 분석 생략 — ${up.reason}`);
    }
  } catch (e) { console.warn('[one-article] 상위호환 분석 예외:', e.message); }
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
  // 설정 파일을 건드렸으면 반드시 되돌린다 — 사장님 앱 설정이 바뀌면 안 된다.
  try {
    const R = global.__ONE_ARTICLE_RESTORE__;
    if (R && R.file) {
      const cur = JSON.parse(fs.readFileSync(R.file, 'utf-8'));
      if (R.model === undefined) delete cur.primaryGeminiTextModel;
      else cur.primaryGeminiTextModel = R.model;
      fs.writeFileSync(R.file, JSON.stringify(cur, null, 2), 'utf-8');
      console.log('[one-article] 설정 원복 완료: ' + (R.model || '(삭제)'));
    }
  } catch (e) { console.warn('[one-article] 설정 원복 실패:', e && e.message); }
  await new Promise((r) => logStream.end(r));   // 로그 flush 후 종료 — 잘리면 원인 추적이 불가능하다
  app.quit();
  process.exit(0);
}

main().catch((e) => {
  console.error('[one-article] fatal:', e?.stack || e?.message || e);
  try { app.quit(); } catch {}
  process.exit(1);
});
