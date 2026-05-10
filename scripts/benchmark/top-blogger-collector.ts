/**
 * SPEC-CONVERSION-001 L2-4.2 — 네이버 블로그 검색 상위 글 수집기
 *
 * 실행: npm run build && npx ts-node scripts/benchmark/top-blogger-collector.ts
 *      옵션: --category food --topN 5 --dryRun
 *
 * 흐름:
 *   1. categories.json 로드 → 카테고리별 시드 키워드 순회
 *   2. 각 키워드로 search.naver.com (블로그 탭) 검색
 *   3. 상위 N건의 (제목·URL·블로거·발행일·요약) 수집
 *   4. 글 본문 fetch → benchmarkAnalyzer.analyzeBenchmark
 *   5. data/benchmarks/raw/<cat>/<hash>.html (TTL 7일) + analyses/<cat>/<hash>.json 저장
 *
 * 메모리 [silent 폴백 금지]: 셀렉터 매칭 실패는 명시 로그.
 * 메모리 [추정 효과 금지]: 수집률·정확도 약속 X — 실측만.
 *
 * 본 스크립트는 운영 투입 전 spike 검증 필수 (TOP_BLOGGER_SELECTORS 매칭률 ≥80%).
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { TOP_BLOGGER_SELECTORS } from '../../src/automation/selectors/topBloggerSelectors';
import { analyzeBenchmark } from '../../src/content/benchmarkAnalyzer';

interface CategorySeed {
  category: string;
  label: string;
  seeds: string[];
}

interface CategoriesConfig {
  perCategoryTarget: number;
  totalTarget: number;
  categories: CategorySeed[];
}

interface CollectedItem {
  url: string;
  title: string;
  bloggerId: string;
  postDate: string;
  summary: string;
  category: string;
  query: string;
}

interface CliOptions {
  category?: string;
  topN: number;
  dryRun: boolean;
  outDir: string;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CATEGORIES_PATH = path.join(PROJECT_ROOT, 'scripts', 'benchmark', 'categories.json');
const DEFAULT_OUT_DIR = path.join(PROJECT_ROOT, 'data', 'benchmarks');
const SEARCH_URL = 'https://search.naver.com/search.naver?where=blog&query=';
const TIMEOUT_MS = 20_000;

function parseCli(): CliOptions {
  const argv = process.argv.slice(2);
  let category: string | undefined;
  let topN = 5;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--category') category = argv[++i];
    else if (a === '--topN') topN = parseInt(argv[++i], 10) || 5;
    else if (a === '--dryRun') dryRun = true;
  }
  return { category, topN, dryRun, outDir: DEFAULT_OUT_DIR };
}

function loadCategories(): CategoriesConfig {
  const raw = fs.readFileSync(CATEGORIES_PATH, 'utf-8');
  return JSON.parse(raw);
}

function urlHash(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
}

async function searchBlogList(page: any, query: string, topN: number): Promise<CollectedItem[]> {
  const url = SEARCH_URL + encodeURIComponent(query);
  await page.goto(url, { timeout: TIMEOUT_MS, waitUntil: 'load' });
  try {
    await page.waitForSelector(TOP_BLOGGER_SELECTORS.resultItem.primary, { timeout: TIMEOUT_MS });
  } catch {
    for (const fb of TOP_BLOGGER_SELECTORS.resultItem.fallbacks) {
      try {
        await page.waitForSelector(fb, { timeout: 3000 });
        break;
      } catch { /* continue */ }
    }
  }

  const items = await page.evaluate(
    ({ selectorMap, topN }: { selectorMap: any; topN: number }) => {
      const tryQuery = (root: Element | Document, candidates: string[]): Element | null => {
        for (const sel of candidates) {
          const el = root.querySelector(sel);
          if (el) return el;
        }
        return null;
      };
      const tryQueryAll = (root: Element | Document, candidates: string[]): Element[] => {
        for (const sel of candidates) {
          const els = root.querySelectorAll(sel);
          if (els.length > 0) return Array.from(els);
        }
        return [];
      };
      const cards = tryQueryAll(document, [
        selectorMap.resultItem.primary, ...selectorMap.resultItem.fallbacks,
      ]).slice(0, topN);

      return cards.map((card) => {
        const title = tryQuery(card, [
          selectorMap.postTitle.primary, ...selectorMap.postTitle.fallbacks,
        ]);
        const link = tryQuery(card, [
          selectorMap.postLink.primary, ...selectorMap.postLink.fallbacks,
        ]) as HTMLAnchorElement | null;
        const blogger = tryQuery(card, [
          selectorMap.bloggerId.primary, ...selectorMap.bloggerId.fallbacks,
        ]);
        const dateEl = tryQuery(card, [
          selectorMap.postDate.primary, ...selectorMap.postDate.fallbacks,
        ]);
        const summary = tryQuery(card, [
          selectorMap.postSummary.primary, ...selectorMap.postSummary.fallbacks,
        ]);
        return {
          title: (title?.textContent ?? '').trim(),
          url: link?.href ?? '',
          bloggerId: (blogger?.textContent ?? '').trim(),
          postDate: (dateEl?.textContent ?? '').trim(),
          summary: (summary?.textContent ?? '').trim(),
        };
      });
    },
    { selectorMap: TOP_BLOGGER_SELECTORS, topN },
  );

  return (items as any[])
    .filter((i) => i.url && i.title)
    .map((i) => ({ ...i, query: '', category: '' } as CollectedItem));
}

async function fetchBlogBody(page: any, url: string): Promise<string> {
  await page.goto(url, { timeout: TIMEOUT_MS, waitUntil: 'load' });
  // 네이버 블로그는 iframe 안에 본문 — mainFrame 후 frame[name=mainFrame].
  try {
    const frameElement = await page.$('iframe#mainFrame, iframe[name="mainFrame"]');
    if (frameElement) {
      const frame = await frameElement.contentFrame();
      if (frame) {
        const text = await frame.evaluate(() => {
          const root = document.querySelector('div.se-main-container, div#postViewArea, div.post_ct');
          return root ? root.textContent ?? '' : '';
        });
        return text.trim();
      }
    }
  } catch { /* fallback to top-level */ }

  return page.evaluate(() => {
    const root = document.querySelector('div.se-main-container, div#postViewArea, div.post_ct, body');
    return root ? root.textContent ?? '' : '';
  });
}

async function main(): Promise<void> {
  const opts = parseCli();
  console.log('🐙 SPEC-CONVERSION-001 L2-4.2: 상위 블로거 수집');
  console.log(`   category=${opts.category ?? 'ALL'} topN=${opts.topN} dryRun=${opts.dryRun}\n`);

  const cfg = loadCategories();
  const targetCats = opts.category
    ? cfg.categories.filter((c) => c.category === opts.category)
    : cfg.categories;
  if (targetCats.length === 0) {
    console.error(`❌ 카테고리 매칭 없음: ${opts.category}`);
    process.exit(1);
  }

  const { chromium } = require('playwright-extra');
  const stealth = require('puppeteer-extra-plugin-stealth')();
  chromium.use(stealth);
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await ctx.newPage();

  let totalSaved = 0;
  for (const cat of targetCats) {
    console.log(`📂 ${cat.category} (${cat.label})`);
    for (const seed of cat.seeds) {
      console.log(`  🔎 "${seed}"`);
      const items = await searchBlogList(page, seed, opts.topN);
      console.log(`     ${items.length}건 수집`);
      for (const raw of items) {
        const item: CollectedItem = { ...raw, category: cat.category, query: seed };
        const hash = urlHash(item.url);
        const rawDir = path.join(opts.outDir, 'raw', cat.category);
        const analysesDir = path.join(opts.outDir, 'analyses', cat.category);
        if (!opts.dryRun) {
          fs.mkdirSync(rawDir, { recursive: true });
          fs.mkdirSync(analysesDir, { recursive: true });
        }
        try {
          const body = await fetchBlogBody(page, item.url);
          if (!opts.dryRun) {
            fs.writeFileSync(path.join(rawDir, `${hash}.txt`), body, 'utf-8');
            const analysis = analyzeBenchmark({
              url: item.url, category: cat.category, title: item.title, bodyText: body,
            });
            fs.writeFileSync(
              path.join(analysesDir, `${hash}.json`),
              JSON.stringify(analysis, null, 2),
              'utf-8',
            );
          }
          totalSaved++;
        } catch (err) {
          console.warn(`     ⚠️ ${item.url} fetch 실패: ${(err as Error).message}`);
        }
      }
    }
  }

  await browser.close();
  console.log(`\n✅ 완료: ${totalSaved}건 저장 (목표 ${cfg.totalTarget}건)`);
}

main().catch((err) => {
  console.error('❌ 수집 실패:', err);
  process.exit(99);
});
