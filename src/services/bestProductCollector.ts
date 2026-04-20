/**
 * 🛒 베스트 상품 자동 수집기
 * 쿠팡 베스트셀러 + 네이버 쇼핑 인기상품 실시간 수집
 * 
 * ✅ [2026-03-13] AdsPower + Playwright 연동
 * - AdsPower 실행 중 → Playwright로 실제 브라우저 렌더링 (완벽 수집)
 * - AdsPower 미실행 → axios HTTP 요청 (경량 fallback)
 * 
 * @module services/bestProductCollector
 * @created 2026-03-13
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, type Browser, type Page } from 'playwright';
import {
  checkAdsPowerStatus,
  openAdsPowerBrowser,
  closeAdsPowerBrowser
} from '../main/utils/adsPowerManager.js';
import { formatPriceOrEmpty } from './priceNormalizer.js';

/**
 * Normalize price fields on a collected product batch.
 * Any raw price that cannot be parsed to a positive integer KRW becomes "".
 * Callers downstream (promptLoader, sourceAssembler) skip empty prices.
 */
function normalizeProductPrices(products: BestProduct[]): BestProduct[] {
  return products.map((p) => ({
    ...p,
    price: formatPriceOrEmpty(p.price),
    originalPrice: p.originalPrice ? formatPriceOrEmpty(p.originalPrice) : undefined,
  }));
}

// =============================================
// 타입 정의
// =============================================

export interface BestProduct {
  rank: number;
  name: string;
  price: string;
  originalPrice?: string;
  discount?: string;
  imageUrl: string;
  productUrl: string;
  reviewCount?: number;
  rating?: number;
  platform: 'coupang' | 'naver';
  category: string;
  fetchedAt: string;
}

export interface BestProductResult {
  success: boolean;
  products: BestProduct[];
  platform: 'coupang' | 'naver';
  category: string;
  categoryName: string;
  fetchedAt: string;
  error?: string;
}

// =============================================
// 카테고리 정의
// =============================================

export const COUPANG_CATEGORIES: Record<string, { name: string; url: string; icon: string }> = {
  'all': { name: '전체 베스트', url: 'https://www.coupang.com/np/goldbox', icon: '🏆' },
  'electronics': { name: '가전·디지털', url: 'https://www.coupang.com/np/categories/393760', icon: '📱' },
  'fashion': { name: '패션의류', url: 'https://www.coupang.com/np/categories/115573', icon: '👗' },
  'beauty': { name: '뷰티', url: 'https://www.coupang.com/np/categories/393778', icon: '💄' },
  'food': { name: '식품', url: 'https://www.coupang.com/np/categories/393709', icon: '🍔' },
  'home': { name: '홈·인테리어', url: 'https://www.coupang.com/np/categories/393776', icon: '🏠' },
  'sports': { name: '스포츠·레저', url: 'https://www.coupang.com/np/categories/393756', icon: '⚽' },
  'baby': { name: '출산·유아동', url: 'https://www.coupang.com/np/categories/393734', icon: '👶' },
  'pet': { name: '반려동물', url: 'https://www.coupang.com/np/categories/393762', icon: '🐕' },
  'kitchen': { name: '주방용품', url: 'https://www.coupang.com/np/categories/393730', icon: '🍳' },
  'health': { name: '건강·의료', url: 'https://www.coupang.com/np/categories/393770', icon: '💊' },
};

export const NAVER_CATEGORIES: Record<string, { name: string; catId: string; icon: string }> = {
  'all': { name: '전체 인기상품', catId: 'ALL', icon: '🔥' },
  'fashion': { name: '패션의류', catId: '50000167', icon: '👗' },
  'beauty': { name: '화장품/미용', catId: '50000002', icon: '💄' },
  'digital': { name: '디지털/가전', catId: '50000001', icon: '📱' },
  'food': { name: '식품', catId: '50000006', icon: '🍔' },
  'living': { name: '생활/건강', catId: '50000003', icon: '🏠' },
  'baby': { name: '출산/육아', catId: '50000005', icon: '👶' },
  'sports': { name: '스포츠/레저', catId: '50000004', icon: '⚽' },
};

// =============================================
// User-Agent
// =============================================

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// =============================================
// AdsPower + Playwright 연동
// =============================================

/** AdsPower 실행 중이면 Playwright 브라우저 연결 */
async function getAdsPowerPlaywright(): Promise<{ browser: Browser; page: Page; profileId: string } | null> {
  try {
    const status = await checkAdsPowerStatus();
    if (!status.running) {
      console.log('[BestProduct] AdsPower 미실행 — HTTP fallback 사용');
      return null;
    }

    // ✅ [2026-03-13] AdsPower API로 프로필 목록 조회하여 첫 번째 프로필 자동 선택
    let profileId: string = '';
    try {
      const axios = (await import('axios')).default;
      const listRes = await axios.get('http://local.adspower.com:50325/api/v1/user/list?page=1&page_size=10', { timeout: 5000 });
      if (listRes.data?.data?.list && listRes.data.data.list.length > 0) {
        const profile = listRes.data.data.list[0];
        // ✅ openAdsPowerBrowser는 serial_number를 사용함 (user_id가 아님!)
        profileId = profile.serial_number || profile.user_id;
        console.log(`[BestProduct] AdsPower 프로필 자동 선택: serial_number=${profileId}, name=${profile.name || 'unnamed'}, user_id=${profile.user_id}`);
      } else {
        console.warn('[BestProduct] AdsPower에 프로필이 없습니다. 프로필을 먼저 생성하세요.');
        return null;
      }
    } catch (listErr) {
      console.warn('[BestProduct] AdsPower 프로필 목록 조회 실패, 기본 프로필 시도:', (listErr as Error).message);
      profileId = '1'; // fallback
    }

    const result = await openAdsPowerBrowser(profileId);
    if (!result.success || !result.ws) {
      console.warn('[BestProduct] AdsPower 브라우저 열기 실패:', result.message);
      return null;
    }

    console.log('[BestProduct] ✅ AdsPower Playwright 연결 성공');
    const browser = await chromium.connectOverCDP(result.ws);
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();

    return { browser, page, profileId };
  } catch (error) {
    console.warn('[BestProduct] AdsPower 연결 실패:', (error as Error).message);
    return null;
  }
}

/** Playwright 페이지에서 상품 추출 (쿠팡) */
async function extractCoupangProductsFromPage(page: Page, maxCount: number): Promise<BestProduct[]> {
  const raw = await extractCoupangProductsFromPageRaw(page, maxCount);
  return normalizeProductPrices(raw);
}

async function extractCoupangProductsFromPageRaw(page: Page, maxCount: number): Promise<BestProduct[]> {
  // 페이지 로드 대기
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await sleep(2000); // 동적 렌더링 대기

  return page.evaluate((max: number) => {
    const products: any[] = [];
    
    // ✅ [2026-03-13] 쿠팡 골드박스 실제 DOM 구조 기반 셀렉터
    // 구조: div.discount-product-unit > a[href*="/vp/"] > div.info_section
    const productLinks = document.querySelectorAll('a[href*="/vp/"], a[href*="/products/"]');
    
    for (const link of Array.from(productLinks).slice(0, max)) {
      const container = link.closest('.discount-product-unit') || link.closest('.weblog') || link.parentElement || link;
      
      // 1. 상품명 추출: info_section__title 또는 info-section__title-wrap
      const nameEl = container.querySelector('.info_section__title') 
        || container.querySelector('.info-section__title-wrap')
        || container.querySelector('[class*="title"]');
      const name = nameEl?.textContent?.trim() || '';
      if (!name || name.length < 3) continue;

      // 2. 대표 이미지: 첫 번째 non-badge img (className에 'badge' 없는 것)
      const allImgs = container.querySelectorAll('img');
      let imageUrl = '';
      for (const img of Array.from(allImgs)) {
        const cls = img.className || '';
        const src = img.src || img.getAttribute('data-src') || '';
        // 로켓배송 배지 아이콘 제외 (current-price__rocket-badge)
        if (!cls.includes('badge') && !cls.includes('rocket') && src && src.includes('coupangcdn.com')) {
          imageUrl = src;
          break;
        }
      }
      // 이미지 고해상도로 변환
      if (imageUrl && imageUrl.includes('230x230')) {
        imageUrl = imageUrl.replace('230x230ex', '492x492ex');
      }

      // 3. 가격 추출: info_section 내 텍스트에서 "N,NNN원" 패턴 추출
      const infoSection = container.querySelector('.info_section') || container;
      const infoText = infoSection?.textContent || '';
      // 가격 패턴: "15,370원" 또는 "32,900원"
      const priceMatches = infoText.match(/[\d,]+원/g);
      let price = '';
      if (priceMatches && priceMatches.length > 0) {
        // 첫 번째가 판매가 (할인가), 두 번째가 원가
        price = priceMatches[0];
      }

      // 4. 할인율 추출
      const discountMatch = infoText.match(/(\d+)%/);
      const discountRate = discountMatch ? discountMatch[1] + '%' : '';

      // 5. 상품 URL
      let href = (link as HTMLAnchorElement).href || '';
      if (href && !href.startsWith('http')) {
        href = 'https://www.coupang.com' + href;
      }

      if (name.length > 2 && href) {
        products.push({
          rank: products.length + 1,
          name: name.substring(0, 100),
          price: price || '가격 정보 없음',
          discountRate,
          imageUrl,
          productUrl: href,
          platform: 'coupang',
        });
      }
    }

    return products;
  }, maxCount);
}

/** ✅ [2026-03-14] Playwright 페이지에서 상품 추출 (네이버 snxbest.naver.com) */
async function extractNaverProductsFromPage(page: Page, maxCount: number): Promise<BestProduct[]> {
  const raw = await extractNaverProductsFromPageRaw(page, maxCount);
  return normalizeProductPrices(raw);
}

async function extractNaverProductsFromPageRaw(page: Page, maxCount: number): Promise<BestProduct[]> {
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  await sleep(5000); // 네이버 SPA 렌더링 대기

  // 스크롤로 지연 로딩 트리거 (여러 번)
  for (let i = 0; i < 3; i++) {
    await page.evaluate((step) => {
      window.scrollTo(0, (document.body.scrollHeight / 4) * (step + 1));
    }, i);
    await sleep(1500);
  }
  // 다시 상단으로
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1000);

  // 3회 재시도
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const products = await page.evaluate((max: number) => {
        const results: any[] = [];
        
        // ✅ snxbest.naver.com DOM 구조: li.productCardResponsive_product_card_responsive
        const selectors = [
          'li[class*="productCardResponsive_product_card_responsive"]',
          'li[class*="product_card_responsive"]',
          'li[data-shp-contents-type="chnl_prod_no"]',
          'li[class*="productCard"]',
        ];

        let items: Element[] = [];
        for (const sel of selectors) {
          items = Array.from(document.querySelectorAll(sel));
          if (items.length > 0) break;
        }

        for (const el of items.slice(0, max)) {
          const text = (el.textContent || '').trim();
          if (!text || text.length < 5) continue;

          // ✅ 상품명: data-shp-contents-dtl에서 추출 또는 텍스트
          let name = '';
          const dtlAttr = el.getAttribute('data-shp-contents-dtl') || '';
          if (dtlAttr) {
            try {
              const dtl = JSON.parse(dtlAttr);
              const nameEntry = dtl.find((d: any) => d.key === 'chnl_prod_nm');
              if (nameEntry) name = nameEntry.value;
            } catch(e) { /* ignore */ }
          }
          // 텍스트 폴백: 가격 전 부분
          if (!name) {
            const priceIdx = text.search(/원가[\d,]+원|[\d,]+원/);
            name = priceIdx > 0 ? text.substring(0, priceIdx).trim() : text.substring(0, 60).trim();
          }
          if (!name || name.length < 3) continue;

          // ✅ 이미지: img.productCardResponsive_image
          const imgEl = el.querySelector('img[class*="productCardResponsive_image"], img[class*="image"]');
          let imageUrl = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';
          // 고해상도 변환
          if (imageUrl && imageUrl.includes('?type=')) {
            imageUrl = imageUrl.replace(/\?type=f\d+/, '?type=f660');
          }

          // ✅ 가격: N,NNN원 패턴
          const priceMatches = text.match(/([\d,]+)원/g) || [];
          let price = '';
          let originalPrice = '';
          let discount = '';
          
          if (priceMatches.length >= 2) {
            // 첫번째=원가, 두번째=할인가
            originalPrice = priceMatches[0] || '';
            price = priceMatches[1] || '';
          } else if (priceMatches.length === 1) {
            price = priceMatches[0] || '';
          }

          // ✅ 할인율: N% 패턴
          const discountMatch = text.match(/(\d+)%/);
          if (discountMatch) discount = discountMatch[1] + '%';

          // ✅ 리뷰: 리뷰 N 패턴
          const reviewMatch = text.match(/리뷰\s*([\d,]+)/);
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

          // ✅ 상품 링크
          const linkEl = el.querySelector('a');
          let href = linkEl?.getAttribute('href') || '';
          // contents-id에서 상품 링크 생성
          if (!href || href.includes('adclk.nhn')) {
            const contentsId = el.getAttribute('data-shp-contents-id');
            if (contentsId) {
              href = `https://search.shopping.naver.com/product/${contentsId}`;
            }
          }

          if (name.length > 2) {
            results.push({
              rank: results.length + 1,
              name: name.substring(0, 100),
              price: price || '',
              originalPrice: originalPrice || undefined,
              discount: discount || undefined,
              imageUrl: imageUrl || '',
              productUrl: href,
              reviewCount,
              platform: 'naver',
            });
          }
        }

        return results;
      }, maxCount);

      if (products.length > 0) return products;
      console.log(`[BestProduct] 네이버 추출 시도 ${attempt + 1}/3 - 0개, 재시도...`);
      await sleep(2000);
    } catch (e) {
      console.warn(`[BestProduct] 네이버 evaluate 실패 (${attempt + 1}/3):`, (e as Error).message);
      await sleep(2000);
    }
  }

  return [];
}

// =============================================
// 메인 클래스
// =============================================

export class BestProductCollector {
  private cache: Map<string, { data: BestProductResult; expiry: number }> = new Map();
  private cacheExpiry = 30 * 60 * 1000; // 30분 캐시

  /**
   * 🛒 쿠팡 베스트 상품 수집
   */
  async fetchCoupangBest(categoryId: string = 'all', maxCount: number = 20, useAdsPower: boolean = false): Promise<BestProductResult> {
    const cacheKey = `coupang:${categoryId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`[BestProduct] 캐시 사용: ${cacheKey}`);
      return cached.data;
    }

    const category = COUPANG_CATEGORIES[categoryId];
    if (!category) {
      return {
        success: false,
        products: [],
        platform: 'coupang',
        category: categoryId,
        categoryName: '알 수 없음',
        fetchedAt: new Date().toISOString(),
        error: '유효하지 않은 카테고리',
      };
    }

    console.log(`[BestProduct] 🛒 쿠팡 ${category.name} 베스트 수집 시작... (AdsPower: ${useAdsPower ? 'ON' : 'OFF'})`);

    try {
      // ✅ 1차 시도: AdsPower + Playwright (useAdsPower가 true일 때만)
      if (useAdsPower) {
        const pw = await getAdsPowerPlaywright();
        if (pw) {
        try {
          console.log(`[BestProduct] 🎭 Playwright로 쿠팡 접속: ${category.url}`);
          
          // ✅ [2026-03-13] 네비게이션 완료 + 리다이렉트 안정화 대기
          await pw.page.goto(category.url, { waitUntil: 'load', timeout: 30000 });
          // 쿠팡은 초기 로딩 후 리다이렉트가 발생하므로 충분히 대기
          await sleep(5000);
          // 리다이렉트가 끝났는지 확인 — 추가 네비게이션 대기
          await pw.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await sleep(2000);
          
          console.log(`[BestProduct] 📄 현재 URL: ${pw.page.url()}`);
          
          // ✅ evaluate 실패 시 재시도 (리다이렉트로 인한 context destroyed 대비)
          let products: BestProduct[] = [];
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              products = await extractCoupangProductsFromPage(pw.page, maxCount);
              break;
            } catch (evalErr) {
              console.warn(`[BestProduct] 상품 추출 시도 ${attempt + 1}/3 실패: ${(evalErr as Error).message}`);
              if (attempt < 2) {
                await sleep(3000); // 재시도 전 대기
              }
            }
          }
          
          // 카테고리/날짜 보완
          products.forEach(p => {
            p.category = categoryId;
            p.fetchedAt = new Date().toISOString();
            if (p.imageUrl) p.imageUrl = this.enhanceCoupangImage(p.imageUrl);
          });

          console.log(`[BestProduct] ✅ Playwright 쿠팡 ${category.name}: ${products.length}개 수집`);

          if (products.length > 0) {
            const result: BestProductResult = {
              success: true,
              products,
              platform: 'coupang',
              category: categoryId,
              categoryName: `${category.icon} ${category.name}`,
              fetchedAt: new Date().toISOString(),
            };
            this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.cacheExpiry });
            return result;
          }
        } catch (pwError) {
          console.warn(`[BestProduct] Playwright 쿠팡 실패, HTTP fallback:`, (pwError as Error).message);
        }
      } else {
          // AdsPower가 켜져있는데 연결 실패
          console.error('[BestProduct] ❌ AdsPower 연결 실패! AdsPower가 실행 중이고 프로필이 있는지 확인하세요.');
          return {
            success: false,
            products: [],
            platform: 'coupang',
            category: categoryId,
            categoryName: `${category.icon} ${category.name}`,
            fetchedAt: new Date().toISOString(),
            error: 'AdsPower 연결 실패. AdsPower가 실행 중이고 프로필이 존재하는지 확인하세요.',
          };
        }
      }

      // ✅ 2차 시도: 모바일 URL로 접근 (봇 탐지 낮음)
      const mobileUrl = category.url.replace('www.coupang.com', 'm.coupang.com');
      
      const response = await axios.get(mobileUrl, {
        headers: {
          'User-Agent': MOBILE_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://m.coupang.com/',
        },
        timeout: 15000,
        maxRedirects: 5,
      });

      const html = response.data;
      
      // Access Denied 체크
      if (html.includes('Access Denied') || html.includes('차단')) {
        console.warn('[BestProduct] ⚠️ 쿠팡 모바일 접근 차단 — PC 모드 시도');
        return this.fetchCoupangBestPC(categoryId, maxCount);
      }

      const $ = cheerio.load(html);
      const products: BestProduct[] = [];

      // ✅ 골드박스 (오늘의 특가) 상품 추출
      $('[class*="product"], [class*="item"], [class*="deal"]').each((i, el) => {
        if (products.length >= maxCount) return false;

        const $el = $(el);
        const name = $el.find('[class*="name"], [class*="title"], [class*="product-name"]').first().text().trim();
        const price = $el.find('[class*="price"], [class*="sale"]').first().text().trim();
        
        // 이미지 URL
        let imageUrl = '';
        const img = $el.find('img').first();
        imageUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
        
        // 상품 링크
        let productUrl = '';
        const link = $el.find('a').first();
        const href = link.attr('href') || '';
        if (href) {
          productUrl = href.startsWith('http') ? href :
            href.startsWith('//') ? `https:${href}` : `https://www.coupang.com${href}`;
        }

        if (name && name.length > 3 && productUrl) {
          // 이미지 최적화
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : `https:${imageUrl}`;
          }

          products.push({
            rank: products.length + 1,
            name: name.substring(0, 100),
            price: this.cleanPrice(price),
            imageUrl: this.enhanceCoupangImage(imageUrl),
            productUrl,
            platform: 'coupang',
            category: categoryId,
            fetchedAt: new Date().toISOString(),
          });
        }
      });

      // 결과가 없으면 더 넓은 셀렉터로 재시도
      if (products.length === 0) {
        console.log('[BestProduct] 1차 시도 결과 없음, 넓은 셀렉터로 재시도...');
        $('a[href*="/vp/"], a[href*="/products/"]').each((i, el) => {
          if (products.length >= maxCount) return false;

          const $el = $(el);
          const href = $el.attr('href') || '';
          const name = $el.text().trim();
          const img = $el.find('img').first();
          const imageUrl = img.attr('src') || img.attr('data-src') || '';
          
          if (name.length > 5 && name.length < 100 && href) {
            const productUrl = href.startsWith('http') ? href : `https://www.coupang.com${href}`;
            
            products.push({
              rank: products.length + 1,
              name: name.substring(0, 100),
              price: '',
              imageUrl: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
              productUrl,
              platform: 'coupang',
              category: categoryId,
              fetchedAt: new Date().toISOString(),
            });
          }
        });
      }

      console.log(`[BestProduct] ✅ 쿠팡 ${category.name}: ${products.length}개 수집`);

      const result: BestProductResult = {
        success: products.length > 0,
        products,
        platform: 'coupang',
        category: categoryId,
        categoryName: `${category.icon} ${category.name}`,
        fetchedAt: new Date().toISOString(),
      };

      // 캐시 저장
      this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.cacheExpiry });

      return result;
    } catch (error: any) {
      console.error(`[BestProduct] ❌ 쿠팡 수집 실패:`, error.message);
      return {
        success: false,
        products: [],
        platform: 'coupang',
        category: categoryId,
        categoryName: `${category.icon} ${category.name}`,
        fetchedAt: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * 쿠팡 PC 버전 폴백
   */
  private async fetchCoupangBestPC(categoryId: string, maxCount: number): Promise<BestProductResult> {
    const category = COUPANG_CATEGORIES[categoryId] || COUPANG_CATEGORIES['all'];
    
    try {
      const response = await axios.get(category.url, {
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://www.coupang.com/',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const products: BestProduct[] = [];

      // ✅ PC 골드박스 셀렉터
      $('.baby-product-wrap, .product-item, .goldbox-item, [class*="best-item"]').each((i, el) => {
        if (products.length >= maxCount) return false;

        const $el = $(el);
        const name = $el.find('.descriptions .name, .product-name, .title').first().text().trim();
        const price = $el.find('.price-value, .total-price, .sale-price').first().text().trim();
        const originalPrice = $el.find('.origin-price, .base-price').first().text().trim();
        const discount = $el.find('.discount-rate, .discount-percentage').first().text().trim();
        
        const img = $el.find('img').first();
        let imageUrl = img.attr('src') || img.attr('data-img-src') || '';
        
        const link = $el.find('a').first();
        let href = link.attr('href') || '';
        if (href && !href.startsWith('http')) {
          href = `https://www.coupang.com${href}`;
        }

        if (name && name.length > 3) {
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
          }

          products.push({
            rank: products.length + 1,
            name: name.substring(0, 100),
            price: this.cleanPrice(price),
            originalPrice: originalPrice || undefined,
            discount: discount || undefined,
            imageUrl: this.enhanceCoupangImage(imageUrl),
            productUrl: href,
            platform: 'coupang',
            category: categoryId,
            fetchedAt: new Date().toISOString(),
          });
        }
      });

      console.log(`[BestProduct] ✅ 쿠팡 PC ${category.name}: ${products.length}개 수집`);

      return {
        success: products.length > 0,
        products,
        platform: 'coupang',
        category: categoryId,
        categoryName: `${category.icon} ${category.name}`,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error(`[BestProduct] ❌ 쿠팡 PC 폴백 실패:`, error.message);
      return {
        success: false,
        products: [],
        platform: 'coupang',
        category: categoryId,
        categoryName: `${category.icon} ${category.name}`,
        fetchedAt: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * 🔍 네이버 쇼핑 인기상품 수집
   */
  async fetchNaverBest(categoryId: string = 'all', maxCount: number = 20, useAdsPower: boolean = false): Promise<BestProductResult> {
    const cacheKey = `naver:${categoryId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`[BestProduct] 캐시 사용: ${cacheKey}`);
      return cached.data;
    }

    const category = NAVER_CATEGORIES[categoryId];
    if (!category) {
      return {
        success: false,
        products: [],
        platform: 'naver',
        category: categoryId,
        categoryName: '알 수 없음',
        fetchedAt: new Date().toISOString(),
        error: '유효하지 않은 카테고리',
      };
    }

    console.log(`[BestProduct] 🔍 네이버 ${category.name} 인기상품 수집 시작... (AdsPower: ${useAdsPower ? 'ON' : 'OFF'})`);

    try {
      // ✅ [2026-03-14] 네이버 쇼핑 베스트 URL (snxbest.naver.com으로 이전됨)
      const url = categoryId === 'all'
        ? 'https://snxbest.naver.com/home'
        : `https://snxbest.naver.com/category/${category.catId}`;

      // ✅ 1차 시도: AdsPower + Playwright (useAdsPower가 true일 때만)
      if (useAdsPower) {
        const pw = await getAdsPowerPlaywright();
        if (pw) {
        try {
          console.log(`[BestProduct] 🎭 Playwright로 네이버 쇼핑 접속: ${url}`);
          await pw.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          
          const products = await extractNaverProductsFromPage(pw.page, maxCount);
          
          products.forEach(p => {
            p.category = categoryId;
            p.fetchedAt = new Date().toISOString();
          });

          console.log(`[BestProduct] ✅ Playwright 네이버 ${category.name}: ${products.length}개 수집`);

          if (products.length > 0) {
            const result: BestProductResult = {
              success: true,
              products,
              platform: 'naver',
              category: categoryId,
              categoryName: `${category.icon} ${category.name}`,
              fetchedAt: new Date().toISOString(),
            };
            this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.cacheExpiry });
            return result;
          }
        } catch (pwError) {
          console.warn(`[BestProduct] Playwright 네이버 실패, HTTP fallback:`, (pwError as Error).message);
        }
      } else {
          // AdsPower가 켜져있는데 연결 실패
          console.error('[BestProduct] ❌ AdsPower 연결 실패!');
          return {
            success: false,
            products: [],
            platform: 'naver',
            category: categoryId,
            categoryName: `${category.icon} ${category.name}`,
            fetchedAt: new Date().toISOString(),
            error: 'AdsPower 연결 실패. AdsPower가 실행 중이고 프로필이 존재하는지 확인하세요.',
          };
        }
      }

      // ✅ 2차 시도: HTTP 요청 (경량)
      const response = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://shopping.naver.com/',
        },
        timeout: 15000,
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const products: BestProduct[] = [];

      // ✅ SSR 렌더링된 상품 데이터 추출 (script __NEXT_DATA__)
      const nextDataScript = $('script#__NEXT_DATA__').html();
      if (nextDataScript) {
        try {
          const nextData = JSON.parse(nextDataScript);
          const productList = this.extractNaverProductsFromNextData(nextData, categoryId, maxCount);
          products.push(...productList);
        } catch (e) {
          console.warn('[BestProduct] __NEXT_DATA__ 파싱 실패, HTML 파싱으로 폴백');
        }
      }

      // HTML 파싱 폴백
      if (products.length === 0) {
        $('[class*="item"], [class*="product"], [class*="best"]').each((i, el) => {
          if (products.length >= maxCount) return false;

          const $el = $(el);
          const name = $el.find('[class*="name"], [class*="title"]').first().text().trim();
          const price = $el.find('[class*="price"]').first().text().trim();
          
          const img = $el.find('img').first();
          const imageUrl = img.attr('src') || img.attr('data-src') || '';
          
          const link = $el.find('a[href*="product"]').first();
          const href = link.attr('href') || '';

          if (name && name.length > 3 && href) {
            const productUrl = href.startsWith('http') ? href : `https://shopping.naver.com${href}`;

            products.push({
              rank: products.length + 1,
              name: name.substring(0, 100),
              price: this.cleanPrice(price),
              imageUrl,
              productUrl,
              platform: 'naver',
              category: categoryId,
              fetchedAt: new Date().toISOString(),
            });
          }
        });
      }

      // ✅ 3차 폴백: 네이버 쇼핑 검색 API로 인기순 조회
      if (products.length === 0) {
        console.log('[BestProduct] HTML 파싱 결과 없음, 검색 API 폴백...');
        const fallbackProducts = await this.fetchNaverShoppingSearchBest(categoryId, maxCount);
        products.push(...fallbackProducts);
      }

      console.log(`[BestProduct] ✅ 네이버 ${category.name}: ${products.length}개 수집`);

      const result: BestProductResult = {
        success: products.length > 0,
        products,
        platform: 'naver',
        category: categoryId,
        categoryName: `${category.icon} ${category.name}`,
        fetchedAt: new Date().toISOString(),
      };

      this.cache.set(cacheKey, { data: result, expiry: Date.now() + this.cacheExpiry });
      return result;
    } catch (error: any) {
      console.error(`[BestProduct] ❌ 네이버 수집 실패:`, error.message);
      return {
        success: false,
        products: [],
        platform: 'naver',
        category: categoryId,
        categoryName: `${category.icon} ${category.name}`,
        fetchedAt: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * __NEXT_DATA__ JSON에서 상품 추출
   */
  private extractNaverProductsFromNextData(data: any, categoryId: string, maxCount: number): BestProduct[] {
    const products: BestProduct[] = [];
    
    try {
      // 다양한 경로에서 상품 데이터 탐색
      const paths = [
        data?.props?.pageProps?.dehydratedState?.queries,
        data?.props?.pageProps?.initialData,
        data?.props?.pageProps,
      ];

      for (const path of paths) {
        if (!path) continue;

        const items = this.findProductArrayInObject(path);
        if (items && items.length > 0) {
          for (const item of items.slice(0, maxCount)) {
            const name = item.productName || item.name || item.title || '';
            const price = item.price || item.salePrice || item.discountedPrice || '';
            const imageUrl = item.imageUrl || item.image || item.thumbnailUrl || '';
            const productUrl = item.productUrl || item.linkUrl || item.url || '';
            const reviewCount = item.reviewCount || item.reviewCnt || 0;
            const rating = item.rating || item.scoreInfo || 0;

            if (name && name.length > 2) {
              products.push({
                rank: products.length + 1,
                name: name.substring(0, 100),
                price: formatPriceOrEmpty(price),
                imageUrl,
                productUrl: productUrl.startsWith('http') ? productUrl : `https://shopping.naver.com${productUrl}`,
                reviewCount: typeof reviewCount === 'number' ? reviewCount : parseInt(String(reviewCount)) || 0,
                rating: typeof rating === 'number' ? rating : parseFloat(String(rating)) || 0,
                platform: 'naver',
                category: categoryId,
                fetchedAt: new Date().toISOString(),
              });
            }
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[BestProduct] NextData 파싱 중 오류:', (e as Error).message);
    }

    return products;
  }

  /**
   * 재귀적으로 상품 배열 찾기
   */
  private findProductArrayInObject(obj: any, depth: number = 0): any[] | null {
    if (depth > 5 || !obj) return null;
    
    if (Array.isArray(obj)) {
      if (obj.length > 0 && obj[0] && (obj[0].productName || obj[0].name || obj[0].title)) {
        return obj;
      }
    }
    
    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        const result = this.findProductArrayInObject(obj[key], depth + 1);
        if (result) return result;
      }
    }
    
    return null;
  }

  /**
   * 네이버 쇼핑 검색 API로 인기상품 폴백
   */
  private async fetchNaverShoppingSearchBest(categoryId: string, maxCount: number): Promise<BestProduct[]> {
    const products: BestProduct[] = [];
    const category = NAVER_CATEGORIES[categoryId] || NAVER_CATEGORIES['all'];

    // 카테고리별 인기 검색어
    const categoryKeywords: Record<string, string> = {
      'all': '인기상품',
      'fashion': '여성 의류 인기',
      'beauty': '화장품 베스트',
      'digital': '전자기기 인기',
      'food': '맛있는 간식 인기',
      'living': '생활용품 인기',
      'baby': '육아용품 인기',
      'sports': '운동용품 인기',
    };

    try {
      const keyword = categoryKeywords[categoryId] || '인기상품';
      const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}&sort=review`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);

      // __NEXT_DATA__ 우선
      const nextData = $('script#__NEXT_DATA__').html();
      if (nextData) {
        try {
          const parsed = JSON.parse(nextData);
          const items = this.findProductArrayInObject(parsed);
          if (items) {
            for (const item of items.slice(0, maxCount)) {
              const name = item.productName || item.name || item.productTitle || '';
              const price = item.price || item.lowPrice || '';
              const imageUrl = item.imageUrl || item.image || '';
              const productUrl = item.mallProductUrl || item.productUrl || item.crUrl || '';

              if (name && name.length > 2) {
                products.push({
                  rank: products.length + 1,
                  name: name.substring(0, 100),
                  price: formatPriceOrEmpty(price),
                  imageUrl,
                  productUrl: productUrl.startsWith('http') ? productUrl : '',
                  reviewCount: item.reviewCount || 0,
                  rating: item.scoreInfo || 0,
                  platform: 'naver',
                  category: categoryId,
                  fetchedAt: new Date().toISOString(),
                });
              }
            }
          }
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn('[BestProduct] 네이버 쇼핑 검색 폴백 실패:', (e as Error).message);
    }

    return products;
  }

  /**
   * 🎯 통합 베스트 수집 (쿠팡 + 네이버 동시)
   */
  async fetchAllBest(categoryId: string = 'all', maxCount: number = 10): Promise<{
    coupang: BestProductResult;
    naver: BestProductResult;
  }> {
    const _settled = await Promise.allSettled([
      this.fetchCoupangBest(categoryId, maxCount),
      this.fetchNaverBest(categoryId, maxCount),
    ]);
    const failResult = (platform: 'coupang' | 'naver'): BestProductResult => ({
      success: false, products: [], platform, category: categoryId,
      categoryName: categoryId, fetchedAt: new Date().toISOString(),
      error: 'Promise rejected',
    });
    const coupang = _settled[0].status === 'fulfilled' ? _settled[0].value : failResult('coupang');
    const naver   = _settled[1].status === 'fulfilled' ? _settled[1].value : failResult('naver');

    return { coupang, naver };
  }

  /**
   * 카테고리 목록 반환
   */
  getCategories(platform: 'coupang' | 'naver' | 'all' = 'all'): { id: string; name: string; icon: string; platform: string }[] {
    const results: { id: string; name: string; icon: string; platform: string }[] = [];

    if (platform === 'coupang' || platform === 'all') {
      for (const [id, cat] of Object.entries(COUPANG_CATEGORIES)) {
        results.push({ id, name: cat.name, icon: cat.icon, platform: 'coupang' });
      }
    }

    if (platform === 'naver' || platform === 'all') {
      for (const [id, cat] of Object.entries(NAVER_CATEGORIES)) {
        results.push({ id, name: cat.name, icon: cat.icon, platform: 'naver' });
      }
    }

    return results;
  }

  /**
   * 캐시 초기화
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[BestProduct] 캐시 초기화 완료');
  }

  // =============================================
  // 유틸리티
  // =============================================

  private cleanPrice(price: string): string {
    return formatPriceOrEmpty(price);
  }

  private enhanceCoupangImage(url: string): string {
    if (!url) return '';
    return url
      .replace(/\/thumbnails\//, '/product/')
      .replace(/_[0-9]+x[0-9]+\./, '.')
      .replace(/\/remote\/.*?\//, '/');
  }
}
