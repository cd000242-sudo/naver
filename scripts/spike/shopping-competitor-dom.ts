/**
 * SPEC-CONVERSION-001 L2-2.1 — Spike: 네이버쇼핑 경쟁 제품 DOM 셀렉터 실증
 *
 * 실행: npm run build && npx ts-node scripts/spike/shopping-competitor-dom.ts <검색어>
 *      예: npx ts-node scripts/spike/shopping-competitor-dom.ts "무선청소기"
 *
 * 전제:
 *   - 네이버 로그인 불요 (search.shopping.naver.com 익명 검색)
 *   - playwright-extra 설치됨 (puppeteer 기반 자동화 환경)
 *
 * 검증 항목:
 *   1. shoppingCompetitorSelectors의 10개 entry × (primary + fallbacks) 매칭률
 *   2. 페이지당 수집 가능 제품 수 (max 30)
 *   3. 가격 텍스트의 한국어 정규화 가능성 (parseKoreanPrice)
 *   4. 평점·리뷰 수 매칭 안정성
 *
 * 출력:
 *   - 콘솔: 셀렉터별 매칭 통계 + sample 결과 5건
 *   - 파일: debug-dumps/shopping-competitor-spike-<timestamp>.json
 *           (raw HTML 일부 + selector 결과)
 *
 * 메모리 [silent 폴백 금지]: 셀렉터 매칭 실패 셀렉터는 명시 카운트.
 * 메모리 [추정 효과 금지]: "성공률 X%" 가정 X — 실측만.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { SHOPPING_COMPETITOR_SELECTORS } from '../../src/automation/selectors/shoppingCompetitorSelectors';
import {
  parseKoreanPrice,
  parseRating,
  parseReviewCount,
  type CompetitorProduct,
} from '../../src/crawler/competitorDataCollector';

interface SelectorMatchStats {
  key: string;
  primary: string;
  primaryHits: number;
  fallbackHits: Record<string, number>;
  totalCards: number;
  matchRate: number;
}

const TIMEOUT_MS = 20_000;
const TOP_N = 20;

async function main(): Promise<void> {
  const query = process.argv[2] ?? '무선청소기';
  console.log('🐙 SPIKE L2-2.1: 네이버쇼핑 경쟁 셀렉터 실증');
  console.log(`   검색어: "${query}"\n`);

  const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`;

  // playwright-extra 또는 puppeteer-extra 모두 OK
  let browser: any;
  let page: any;
  try {
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);
    browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      locale: 'ko-KR',
      viewport: { width: 1280, height: 800 },
    });
    page = await ctx.newPage();
  } catch (err) {
    console.error('❌ 브라우저 초기화 실패:', (err as Error).message);
    console.error('   playwright-extra + puppeteer-extra-plugin-stealth 설치 확인 필요');
    process.exit(1);
  }

  console.log(`📡 네이버쇼핑 접속: ${url}`);
  try {
    await page.goto(url, { timeout: TIMEOUT_MS, waitUntil: 'load' });
  } catch (err) {
    console.error('❌ goto 실패:', (err as Error).message);
    await browser.close();
    process.exit(2);
  }

  // 카드 컨테이너 대기
  const productCardSel = SHOPPING_COMPETITOR_SELECTORS.productCard.primary;
  console.log(`⏳ 제품 카드 대기 (selector=${productCardSel})...`);
  try {
    await page.waitForSelector(productCardSel, { timeout: TIMEOUT_MS });
  } catch {
    console.warn('⚠️ primary card 셀렉터 매칭 실패 — fallback 시도');
    for (const fb of SHOPPING_COMPETITOR_SELECTORS.productCard.fallbacks) {
      try {
        await page.waitForSelector(fb, { timeout: 3000 });
        console.log(`   ✅ fallback "${fb}" 매칭`);
        break;
      } catch { /* 다음 fallback */ }
    }
  }

  // 셀렉터별 매칭 통계 수집
  const stats: SelectorMatchStats[] = [];
  const products: CompetitorProduct[] = [];

  const result = await page.evaluate(
    ({ selectorMap, topN }: { selectorMap: Record<string, { primary: string; fallbacks: string[] }>; topN: number }) => {
      const tryQueryAll = (root: Element | Document, candidates: string[]): { sel: string; els: Element[] } | null => {
        for (const sel of candidates) {
          const els = root.querySelectorAll(sel);
          if (els.length > 0) return { sel, els: Array.from(els) };
        }
        return null;
      };
      const tryQuery = (root: Element | Document, candidates: string[]): { sel: string; el: Element } | null => {
        for (const sel of candidates) {
          const el = root.querySelector(sel);
          if (el) return { sel, el };
        }
        return null;
      };

      const cardCandidates = [selectorMap.productCard.primary, ...selectorMap.productCard.fallbacks];
      const cardsResult = tryQueryAll(document, cardCandidates);
      if (!cardsResult) {
        return { stats: [], products: [], cardSelectorUsed: null, totalCards: 0 };
      }
      const cards = cardsResult.els.slice(0, topN);

      // selector 키별로 카드별 매칭 시도
      const fields: (keyof typeof selectorMap)[] = [
        'productName',
        'productPrice',
        'productRating',
        'productReviewCount',
        'productSeller',
        'productThumbnail',
        'productLink',
      ];
      const fieldStats: Record<string, { primaryHits: number; fallbackHits: Record<string, number> }> = {};
      for (const f of fields) {
        fieldStats[f as string] = { primaryHits: 0, fallbackHits: {} };
      }

      const productList: any[] = [];
      cards.forEach((card, idx) => {
        const product: any = { rank: idx + 1 };
        for (const f of fields) {
          const candidates = [selectorMap[f].primary, ...selectorMap[f].fallbacks];
          const found = tryQuery(card, candidates);
          if (!found) continue;
          if (found.sel === selectorMap[f].primary) {
            fieldStats[f as string].primaryHits++;
          } else {
            fieldStats[f as string].fallbackHits[found.sel] =
              (fieldStats[f as string].fallbackHits[found.sel] ?? 0) + 1;
          }
          if (f === 'productThumbnail') {
            product.thumbnailRaw = (found.el as HTMLImageElement).src;
          } else if (f === 'productLink') {
            product.linkRaw = (found.el as HTMLAnchorElement).href;
          } else {
            product[`${f}Raw`] = (found.el.textContent ?? '').trim();
          }
        }
        productList.push(product);
      });

      return {
        stats: fieldStats,
        products: productList,
        cardSelectorUsed: cardsResult.sel,
        totalCards: cards.length,
      };
    },
    {
      selectorMap: Object.fromEntries(
        Object.entries(SHOPPING_COMPETITOR_SELECTORS).map(([k, v]) => [
          k,
          { primary: v.primary, fallbacks: v.fallbacks },
        ]),
      ),
      topN: TOP_N,
    },
  );

  console.log(`\n📊 카드 컨테이너 매칭: ${result.cardSelectorUsed} (${result.totalCards}건 수집)\n`);

  for (const [key, fStat] of Object.entries(result.stats)) {
    const stat = fStat as { primaryHits: number; fallbackHits: Record<string, number> };
    const fallbackTotal = Object.values(stat.fallbackHits).reduce((a, b) => a + b, 0);
    const total = stat.primaryHits + fallbackTotal;
    const rate = result.totalCards > 0 ? (total / result.totalCards) * 100 : 0;
    stats.push({
      key,
      primary: SHOPPING_COMPETITOR_SELECTORS[key as keyof typeof SHOPPING_COMPETITOR_SELECTORS].primary,
      primaryHits: stat.primaryHits,
      fallbackHits: stat.fallbackHits,
      totalCards: result.totalCards,
      matchRate: rate,
    });
    console.log(`  ${key}: ${rate.toFixed(0)}% (primary ${stat.primaryHits}, fallback ${fallbackTotal})`);
    if (fallbackTotal > 0) {
      for (const [fb, n] of Object.entries(stat.fallbackHits)) {
        console.log(`     ↳ fallback ${fb}: ${n}`);
      }
    }
  }

  // raw → 정규화 시도
  console.log('\n🧪 가격·평점·리뷰 정규화 sample (상위 5건):');
  for (const raw of result.products.slice(0, 5) as any[]) {
    const normalized: CompetitorProduct = {
      rank: raw.rank,
      name: raw.productNameRaw ?? '',
      priceWon: parseKoreanPrice(raw.productPriceRaw),
      rating: parseRating(raw.productRatingRaw),
      reviewCount: parseReviewCount(raw.productReviewCountRaw),
      seller: raw.productSellerRaw || null,
      thumbnailUrl: raw.thumbnailRaw ?? null,
      productUrl: raw.linkRaw ?? null,
    };
    products.push(normalized);
    console.log(
      `  #${normalized.rank} ${normalized.name.slice(0, 40)} | ${normalized.priceWon.toLocaleString()}원 | ` +
      `★${normalized.rating ?? '-'} | 리뷰 ${normalized.reviewCount ?? '-'}`,
    );
  }

  // 결과 파일 저장
  const dumpDir = path.resolve(__dirname, '..', '..', 'debug-dumps');
  fs.mkdirSync(dumpDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpPath = path.join(dumpDir, `shopping-competitor-spike-${ts}.json`);
  fs.writeFileSync(
    dumpPath,
    JSON.stringify(
      { query, url, cardSelectorUsed: result.cardSelectorUsed, stats, products: products.slice(0, 10) },
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`\n💾 dump 저장: ${dumpPath}`);

  // 통과 기준 평가
  const allOk = stats.every((s) => s.matchRate >= 80) && (result.totalCards >= 10);
  console.log('\n────────────────────────────');
  console.log(allOk ? '✅ SPIKE 통과 (모든 셀렉터 ≥80%, 카드 ≥10건)' : '⚠️ SPIKE 부분 실패 — 셀렉터 재조정 필요');
  console.log('────────────────────────────\n');

  await browser.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Spike 실패:', err);
  process.exit(99);
});
