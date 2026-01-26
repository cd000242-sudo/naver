import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import * as iconv from 'iconv-lite';
import { searchShopping, searchBlog, searchNews, searchWebDoc, stripHtmlTags } from '../naverSearchApi.js';
import { getChromiumExecutablePath } from '../browserUtils.js';

// Puppeteer Stealth 플러그인 적용 (봇 탐지 회피)
puppeteer.use(StealthPlugin());

export type CrawlMode = 'fast' | 'standard' | 'perfect';

// ✅ 한국 사이트 인코딩 자동 감지 및 변환
// ✅ [FIX] URL 파라미터 추가 - 네이버 도메인은 강제 UTF-8
async function decodeResponseWithCharset(response: Response, url?: string): Promise<string> {
  // 1. Content-Type 헤더에서 charset 확인
  const contentType = response.headers.get('content-type') || '';
  let charset = 'utf-8';

  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  if (charsetMatch) {
    charset = charsetMatch[1].toLowerCase().replace(/['"]/g, '');
  }

  // 2. 바이너리로 받기
  const buffer = Buffer.from(await response.arrayBuffer());

  // 3. HTML 내 meta 태그에서 charset 재확인 (Content-Type보다 우선)
  const previewText = buffer.toString('utf-8').substring(0, 2000);

  // <meta charset="euc-kr"> 또는 <meta http-equiv="Content-Type" content="text/html; charset=euc-kr">
  const metaCharsetMatch = previewText.match(/<meta[^>]*charset=["']?([^"'\s>]+)/i);
  if (metaCharsetMatch) {
    charset = metaCharsetMatch[1].toLowerCase();
  }

  // 4. charset 정규화 (다양한 표기 대응)
  const charsetMap: Record<string, string> = {
    'euc-kr': 'euc-kr',
    'euckr': 'euc-kr',
    'ks_c_5601-1987': 'euc-kr',
    'korean': 'euc-kr',
    'cp949': 'cp949',
    'ms949': 'cp949',
    'windows-949': 'cp949',
    'utf-8': 'utf-8',
    'utf8': 'utf-8',
  };

  const normalizedCharset = charsetMap[charset] || charset;

  // 5. 인코딩 변환
  if (normalizedCharset !== 'utf-8' && iconv.encodingExists(normalizedCharset)) {
    console.log(`🔄 인코딩 변환: ${normalizedCharset} → UTF-8`);
    return iconv.decode(buffer, normalizedCharset);
  }

  // 6. UTF-8인 경우 또는 알 수 없는 인코딩
  let text = buffer.toString('utf-8');

  // ✅ [FIX] 네이버 도메인은 무조건 UTF-8 (EUC-KR 재시도 안 함)
  const isNaverDomain = url && url.includes('naver.com');
  if (isNaverDomain) {
    console.log('✅ 네이버 도메인 감지 → UTF-8 강제 사용 (EUC-KR 재시도 안 함)');
    return text;
  }

  // 7. UTF-8로 읽었는데 깨진 경우 (한글이 없거나 replacement char 있음) EUC-KR로 재시도
  const hasKorean = /[가-힣]/.test(text);
  const hasReplacementChar = text.includes('\ufffd') || text.includes('');

  if (!hasKorean || hasReplacementChar) {
    console.log('⚠️ UTF-8 인코딩 실패, EUC-KR로 재시도...');
    const eucKrText = iconv.decode(buffer, 'euc-kr');
    if (/[가-힣]/.test(eucKrText)) {
      console.log('✅ EUC-KR 인코딩으로 복구 성공!');
      return eucKrText;
    }

    // CP949로도 시도
    const cp949Text = iconv.decode(buffer, 'cp949');
    if (/[가-힣]/.test(cp949Text)) {
      console.log('✅ CP949 인코딩으로 복구 성공!');
      return cp949Text;
    }
  }

  return text;
}


export interface CrawlOptions {
  mode?: CrawlMode | 'auto';
  maxLength?: number;
  timeout?: number;
  extractImages?: boolean;
}

export class SmartCrawler {
  private cache = new Map<string, { content: string; timestamp: number }>();
  private cacheTTL = 1000 * 60 * 30;

  /**
   * ✅ [신규] naver.me, brandconnect 등 리다이렉트 URL을 최종 목적지까지 추적
   * - Puppeteer로 실제 리다이렉트를 따라가서 최종 URL 반환
   * - brandconnect → smartstore 리다이렉트까지 완전히 기다림
   */
  private async resolveRedirectUrl(url: string): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      // @ts-ignore
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await getChromiumExecutablePath(),
    });

    try {
      const page = await browser.newPage();

      // 모바일 User-Agent (더 빠른 리다이렉트)
      await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      );

      // 리소스 차단 (속도 최적화) - 스크립트는 허용해야 리다이렉트 됨
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // 리다이렉트 따라가기 (최대 15초)
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      // ✅ [핵심 수정] smartstore.naver.com이 나타날 때까지 최대 8초 대기
      let finalUrl = page.url();
      const maxWaitTime = 8000;
      const checkInterval = 500;
      let elapsed = 0;

      console.log(`   🔄 초기 URL: ${finalUrl.substring(0, 60)}...`);

      while (elapsed < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        elapsed += checkInterval;

        const currentUrl = page.url();

        // URL이 변경되었고, 쇼핑몰 URL인 경우 완료
        if (currentUrl !== finalUrl) {
          console.log(`   🔄 URL 변경됨: ${currentUrl.substring(0, 60)}...`);
          finalUrl = currentUrl;
        }

        // smartstore 또는 brand.naver.com/[스토어명]/products 패턴이면 성공
        if (finalUrl.includes('smartstore.naver.com') ||
          (finalUrl.includes('brand.naver.com') && finalUrl.includes('/products/'))) {
          console.log(`   ✅ 최종 상품 URL 확인!`);
          break;
        }

        // brandconnect에서 더 이상 변경 없으면 추가 대기
        if (finalUrl.includes('brandconnect.naver.com') && elapsed >= 4000) {
          console.log(`   ⏳ brandconnect에서 추가 리다이렉트 대기 중...`);
        }
      }

      await browser.close();
      return finalUrl;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }


  /**
   * ✅ 쇼핑 API로 상품 정보 빠르게 가져오기
   * - brand.naver.com, smartstore.naver.com URL 지원
   * - 크롤링 대비 10-30배 빠름 (0.5초 vs 5-30초)
   */
  private async tryShoppingApiForProductUrl(url: string): Promise<{
    title: string;
    content: string;
    meta: any;
    images?: string[];
  } | null> {
    try {
      // URL에서 상품명 추출 시도
      const decoded = decodeURIComponent(url);

      // URL 패턴에서 상품명 추출
      // 예: /products/12345/상품명 또는 쿼리스트링에서
      let productName = '';

      // 방법 1: URL 경로에서 상품명 추출 (한글이 있는 경우)
      const pathParts = decoded.split('/').filter(p => p && !/^\d+$/.test(p) && !p.includes('?'));
      const koreanParts = pathParts.filter(p => /[가-힣]/.test(p));
      if (koreanParts.length > 0) {
        productName = koreanParts[koreanParts.length - 1].split('?')[0];
      }

      // 방법 2: 쿼리스트링에서 상품명 추출
      if (!productName) {
        const urlObj = new URL(url);
        productName = urlObj.searchParams.get('productName') ||
          urlObj.searchParams.get('name') ||
          urlObj.searchParams.get('query') ||
          urlObj.searchParams.get('n_query') || // ✅ 추가: 네이버 광고 파라미터
          urlObj.searchParams.get('nt_keyword') || // ✅ 추가: 네이버 쇼핑 파라미터
          urlObj.searchParams.get('q') || '';
      }

      // ✅ [강화] 방법 3: 위 방법들로 실패할 경우, 가벼운 fetch로 타이틀 태그에서 추출
      if (!productName || productName.length < 2) {
        try {
          console.log('🔄 URL에서 상품명 추출 실패, 페이지 타이틀에서 추출 시도...');
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          const html = await response.text();
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            let titleText = titleMatch[1];
            // 불필요한 접두사/접미사 제거 (네이버 전용)
            titleText = titleText
              .replace(/\[[^\]]+\]/g, '') // [네이버 스토어] 등 제거
              .replace(/ : [^:]+$/, '')   // 브랜드명 등 제거
              .replace(/ \| [^|]+$/, '')  // 쇼핑몰명 등 제거
              .replace(/: 네이버 쇼핑$/, '')
              .replace(/: 네이버 스마트스토어$/, '')
              .trim();

            if (titleText.length >= 2) {
              // ✅ [100점 수정] 에러 페이지 감지 강화 - 더 많은 네이버 특화 에러 패턴
              // Knowledge Item 참조: "SmartStore Product Access Failures" - Section 2
              const errorPatterns = [
                '에러페이지', '에러', '시스템\\s*오류', '오류', '로그인이\\s*필요',
                '접근\\s*제한', '접근', '차단', '판매\\s*중지', '상품이\\s*존재하지',
                '접속이\\s*불가', '서비스\\s*접속', '페이지를\\s*찾을\\s*수',
                '주소가\\s*바르게', '점검\\s*중', '삭제된\\s*상품', '존재하지\\s*않',
                'error', 'system', 'access\\s*denied', 'not\\s*found', 'blocked',
                'captcha', 'security', 'verification', '404', '500'
              ];
              const errorRegex = new RegExp(errorPatterns.join('|'), 'i');
              const isErrorPage = errorRegex.test(titleText);

              // 쿠팡 파트너스 등의 리다이렉트 페이지 타이틀 필터링
              const isRedirectPage = /쿠팡|coupang|이동\s*중|잠시만\s*기다려/i.test(titleText) && titleText.length < 10;

              if (isErrorPage || isRedirectPage) {
                console.log(`⚠️ 에러/리다이렉트 페이지 감지 ("${titleText}"), 타이틀 사용 안 함`);
              } else {
                productName = titleText;
                console.log(`✨ 페이지 타이틀에서 추출 성공: "${productName}"`);
              }
            }
          }
        } catch (e) {
          console.log('⚠️ 타이틀 추출 폴백 실패:', e); // 에러 내용 로깅 추가
        }
      }

      // ✅ [추가] 방법 4: 네이버 스토어/브랜드스토어 특화 URL 분석
      if (!productName || productName.length < 2) {
        if (url.includes('naver.com') && url.includes('/products/')) {
          const productIdMatch = url.match(/\/products\/(\d+)/);
          if (productIdMatch) {
            console.log(`📡 네이버 상품 ID 감지: ${productIdMatch[1]}, 이를 기반으로 검색 시도`);
            // ID만으로는 상품명을 모르니, 검색 API 시 keyword를 ID로 할 순 없지만
            // 일단 크롤링으로 넘기는 게 안전함
          }
        }
      }

      if (!productName || productName.length < 2) {
        console.log('⚠️ URL에서 상품명 추출 실패, 크롤링으로 진행');
        return null;
      }

      console.log(`🔍 쇼핑 API 검색: "${productName}"`);

      // 쇼핑 API 호출
      const result = await searchShopping({ query: productName, display: 3 });

      if (!result.items || result.items.length === 0) {
        console.log('⚠️ 쇼핑 API 검색 결과 없음');
        return null;
      }

      // 첫 번째 결과 사용
      const product = result.items[0];
      const cleanTitle = stripHtmlTags(product.title);

      // 상품 정보를 콘텐츠 형태로 구성
      const content = [
        `상품명: ${cleanTitle}`,
        `브랜드: ${product.brand || '정보 없음'}`,
        `제조사: ${product.maker || '정보 없음'}`,
        `최저가: ${Number(product.lprice).toLocaleString()}원`,
        product.hprice ? `최고가: ${Number(product.hprice).toLocaleString()}원` : '',
        `판매처: ${product.mallName}`,
        `카테고리: ${[product.category1, product.category2, product.category3, product.category4].filter(Boolean).join(' > ')}`,
      ].filter(Boolean).join('\n');

      return {
        title: cleanTitle,
        content: content,
        meta: {
          price: product.lprice,
          brand: product.brand,
          mallName: product.mallName,
          productId: product.productId,
          productType: product.productType,
          category: [product.category1, product.category2, product.category3].filter(Boolean).join(' > '),
          source: 'naver_shopping_api',
        },
        images: product.image ? [product.image] : [],
      };
    } catch (error) {
      console.log('⚠️ 쇼핑 API 오류:', (error as Error).message);
      return null;
    }
  }

  /**
   * ✅ 검색 API 폴백: 크롤링 실패 시 URL에서 키워드 추출하여 검색
   * - 블로그, 뉴스, 웹문서 API로 관련 정보 수집
   * - 크롤링 100% 실패해도 글 생성 가능
   */
  private async trySearchApiFallback(url: string): Promise<{
    title: string;
    content: string;
    meta: any;
    images?: string[];
  } | null> {
    try {
      let targetUrl = url;

      // ✅ 단축 URL 처리: 원본 URL 추적하여 키워드 추출 정확도 향상
      if (url.includes('coupa.ng') || url.includes('bit.ly') || url.includes('goo.gl') || url.includes('t.co')) {
        try {
          console.log(`🔗 단축 URL 감지: 원본 주소 추적 중... (${url})`);
          const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
          targetUrl = response.url;
          console.log(`📍 원본 주소 확인: ${targetUrl}`);
        } catch (e) {
          console.log('⚠️ URL 추적 실패, 원본 주소로 진행');
        }
      }

      // URL에서 키워드 추출 (원본 주소 기준)
      const keyword = this.extractKeywordFromUrl(targetUrl);
      if (!keyword || keyword.length < 2) {
        console.log('⚠️ URL에서 키워드 추출 실패');
        return null;
      }

      console.log(`🔍 검색 API 폴백: "${keyword}" 키워드로 정보 수집 중...`);

      // 병렬로 블로그, 뉴스, 웹문서 검색
      const [blogResult, newsResult, webResult] = await Promise.all([
        searchBlog({ query: keyword, display: 3 }).catch(() => ({ items: [] })),
        searchNews({ query: keyword, display: 3 }).catch(() => ({ items: [] })),
        searchWebDoc({ query: keyword, display: 3 }).catch(() => ({ items: [] })),
      ]);

      const allItems = [
        ...blogResult.items.map((item: any) => ({ ...item, source: '블로그' })),
        ...newsResult.items.map((item: any) => ({ ...item, source: '뉴스' })),
        ...webResult.items.map((item: any) => ({ ...item, source: '웹문서' })),
      ];

      if (allItems.length === 0) {
        console.log('⚠️ 검색 API 결과 없음');
        return null;
      }

      // 검색 결과를 콘텐츠로 구성
      const contentParts: string[] = [];
      contentParts.push(`[키워드: ${keyword}]`);
      contentParts.push('');

      for (const item of allItems.slice(0, 6)) {
        const title = stripHtmlTags(item.title || '');
        const desc = stripHtmlTags(item.description || '');
        contentParts.push(`## ${title}`);
        contentParts.push(desc);
        contentParts.push(`출처: ${item.source}`);
        contentParts.push('');
      }

      console.log(`✅ 검색 API 폴백 성공: ${allItems.length}개 결과 수집`);

      return {
        title: `${keyword} 관련 정보`,
        content: contentParts.join('\n'),
        meta: {
          keyword: keyword,
          sourceCount: allItems.length,
          sources: ['blog', 'news', 'webdoc'],
          source: 'naver_search_api_fallback',
        },
        images: [],
      };
    } catch (error) {
      console.log('⚠️ 검색 API 폴백 오류:', (error as Error).message);
      return null;
    }
  }

  /**
   * URL에서 키워드 추출
   */
  private extractKeywordFromUrl(url: string): string {
    try {
      const decoded = decodeURIComponent(url);

      // URL 경로에서 한글 추출
      const pathParts = decoded.split('/').filter(p => p && /[가-힣]/.test(p));
      if (pathParts.length > 0) {
        // 가장 긴 한글 부분 사용
        const koreanPart = pathParts.reduce((a, b) =>
          a.replace(/[^가-힣\s]/g, '').length > b.replace(/[^가-힣\s]/g, '').length ? a : b
        );
        const keyword = koreanPart.split(/[?#&]/)[0].replace(/[^가-힣\s]/g, ' ').trim();
        if (keyword.length >= 2) return keyword.split(/\s+/).slice(0, 3).join(' ');
      }

      // 쿼리스트링에서 키워드 추출
      const urlObj = new URL(url);
      const queryKeyword = urlObj.searchParams.get('query') ||
        urlObj.searchParams.get('q') ||
        urlObj.searchParams.get('keyword') ||
        urlObj.searchParams.get('n_query') || // ✅ 추가
        urlObj.searchParams.get('nt_keyword') || // ✅ 추가
        urlObj.searchParams.get('search');
      if (queryKeyword) return queryKeyword;

      // 제목/이름 파라미터 확인
      const titleParam = urlObj.searchParams.get('title') || urlObj.searchParams.get('name');
      if (titleParam) return titleParam;

      return '';
    } catch {
      return '';
    }
  }

  async crawl(url: string, options: CrawlOptions = {}): Promise<{
    title: string;
    content: string;
    meta: any;
    images?: string[];
    mode: CrawlMode;
  }> {
    const {
      mode = 'auto',
      maxLength = 15000,
      timeout = 30000,
      extractImages = false,
    } = options;

    console.log('🌐 스마트 크롤링 시작:', url);
    const startTime = Date.now();

    const cached = this.getFromCache(url);
    if (cached) {
      console.log('💾 캐시 히트! (0.1초)');
      return { ...cached, mode: 'fast' as CrawlMode };
    }

    // ✅ [핵심 추가] naver.me, brandconnect 단축 URL → 최종 URL 추적
    let targetUrl = url;
    if (url.includes('naver.me') || url.includes('brandconnect.naver.com')) {
      try {
        console.log(`🔗 단축/리다이렉트 URL 감지: ${url.substring(0, 50)}...`);
        console.log('   ⏳ 최종 목적지 URL 추적 중 (Puppeteer)...');

        const redirectedUrl = await this.resolveRedirectUrl(url);
        if (redirectedUrl && redirectedUrl !== url) {
          console.log(`   ✅ 최종 URL 확인: ${redirectedUrl.substring(0, 80)}...`);
          targetUrl = redirectedUrl;

          // 최종 URL이 스마트스토어인 경우 캐시 확인
          const cachedFinal = this.getFromCache(targetUrl);
          if (cachedFinal) {
            console.log('💾 최종 URL 캐시 히트!');
            return { ...cachedFinal, mode: 'fast' as CrawlMode };
          }
        }
      } catch (e) {
        console.log('   ⚠️ URL 추적 실패, 원본 URL로 진행:', (e as Error).message);
      }
    }

    // ✅ 상품 URL 감지: 쇼핑 API로 빠르게 처리 시도
    // 네이버 스토어뿐만 아니라 주요 쇼핑몰도 지원
    const shoppingSites = [
      'brand.naver.com',
      'smartstore.naver.com',
      'coupang.com',
      'coupa.ng', // ✅ 쿠팡 파트너스 링크 추가
      '11st.co.kr',
      'gmarket.co.kr',
      'auction.co.kr',
      'aliexpress.com',
      'aliexpress.co.kr',
      'tmon.co.kr',
      'wemakeprice.com',
      'interpark.com',
      'ssg.com',
      'lotteon.com',
      'kurly.com',
      'shopping.naver.com',
    ];
    const isProductUrl = shoppingSites.some(site => targetUrl.includes(site));

    if (isProductUrl) {
      console.log('🛒 쇼핑몰 URL 감지: 쇼핑 API로 빠른 처리 시도...');
      try {
        const productResult = await this.tryShoppingApiForProductUrl(targetUrl);
        if (productResult) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ 쇼핑 API 성공! ${elapsed}ms (크롤링 없이 완료)`);
          this.saveToCache(targetUrl, productResult);
          return { ...productResult, mode: 'fast' as CrawlMode };
        }
      } catch (e) {
        console.log('⚠️ 쇼핑 API 실패, 크롤링으로 폴백:', (e as Error).message);
      }
    }

    let selectedMode: CrawlMode = mode === 'auto' ? this.selectMode(targetUrl) : (mode as CrawlMode);

    // 사용자가 '비용 상관없음'을 선언했으므로, 품질을 위해 과감하게 perfect 모드 우선 적용
    // 특히 뉴스 사이트는 standard로도 막히는 경우가 많아짐
    if (targetUrl.includes('news') || targetUrl.includes('article')) {
      console.log('📰 뉴스/기사 감지: 품질 확보를 위해 Perfect 모드(Puppeteer) 우선 적용');
      selectedMode = 'perfect';
    }

    console.log(`🎯 선택된 모드: ${selectedMode}`);

    let result;
    try {
      switch (selectedMode) {
        case 'fast':
          result = await this.crawlFast(targetUrl, maxLength);
          break;
        case 'standard':
          result = await this.crawlStandard(targetUrl, maxLength, extractImages);
          break;
        case 'perfect':
          result = await this.crawlPerfect(targetUrl, maxLength, extractImages, timeout);
          break;
        default:
          result = await this.crawlStandard(url, maxLength, extractImages);
      }

      this.saveToCache(url, result);

      const elapsed = Date.now() - startTime;
      console.log(`✅ 크롤링 완료: ${elapsed}ms (모드: ${selectedMode}, 길이: ${result.content.length}자)`);

      return { ...result, mode: selectedMode };

    } catch (error) {
      console.error(`❌ ${selectedMode} 모드 실패, 폴백 시도...`);

      // 실패 시 폴백 전략: 크롤링 모드 간 폴백 + 최종 검색 API 폴백
      if (selectedMode === 'standard') {
        console.log('⚠️ Standard 실패 → Perfect 모드로 재시도 (Puppeteer)');
        return this.crawl(url, { ...options, mode: 'perfect' });
      } else if (selectedMode === 'perfect') {
        console.log('⚠️ Perfect 실패 → Fast 모드로 재시도 (가벼운 요청)');
        return this.crawl(url, { ...options, mode: 'fast' });
      } else {
        // Fast도 실패한 경우 → 검색 API 폴백 시도 (최후의 수단)
        console.log('⚠️ 모든 크롤링 실패 → 검색 API로 관련 정보 수집 시도');
        const searchFallback = await this.trySearchApiFallback(url);
        if (searchFallback) {
          console.log('✅ 검색 API 폴백 성공! 관련 정보로 글 생성 가능');
          this.saveToCache(url, searchFallback);
          return { ...searchFallback, mode: 'fast' as CrawlMode };
        }

        // 검색 API도 실패하면 Standard로 마지막 시도
        console.log('⚠️ 검색 API도 실패 → Standard 모드로 마지막 시도');
        return this.crawl(url, { ...options, mode: 'standard' });
      }
    }
  }

  private selectMode(url: string): CrawlMode {
    const urlLower = url.toLowerCase();

    // ✅ 정적 텍스트 위주 사이트만 fast 사용
    if (
      urlLower.includes('wikipedia') ||
      urlLower.includes('namu.wiki') ||
      urlLower.endsWith('.txt') ||
      urlLower.endsWith('.md')
    ) {
      return 'fast';
    }

    // ✅ JavaScript 렌더링 필요한 사이트들 (perfect 모드)
    if (
      urlLower.includes('notion.so') ||
      urlLower.includes('medium.com') ||
      urlLower.includes('velog.io') ||
      urlLower.includes('instagram.com') ||
      urlLower.includes('imweb.me') ||      // ✅ imweb 쇼핑몰
      urlLower.includes('cafe24.com') ||    // ✅ cafe24 쇼핑몰
      urlLower.includes('sixshop.com') ||   // ✅ sixshop
      urlLower.includes('shopify.com') ||   // ✅ Shopify
      urlLower.includes('smartstore.naver') || // ✅ 네이버 스마트스토어
      urlLower.includes('brand.naver') ||   // ✅ 네이버 브랜드스토어
      urlLower.includes('brandconnect.naver') || // ✅ [추가] 브랜드커넥트 (리다이렉트)
      urlLower.includes('naver.me') ||      // ✅ [추가] 네이버 단축 URL (리다이렉트)
      urlLower.includes('coupang.com') ||   // ✅ 쿠팡
      urlLower.includes('youtube.com') ||   // ✅ 유튜브
      urlLower.includes('brunch.co.kr')     // ✅ 브런치
    ) {
      return 'perfect';
    }

    // 나머지는 Standard (헤더 위장 Fetch)
    return 'standard';
  }

  private async crawlFast(url: string, maxLength: number): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
      });

      clearTimeout(timeout);
      // ✅ [FIX] URL 전달하여 네이버 도메인 강제 UTF-8 적용
      const html = await decodeResponseWithCharset(response, url);
      return this.parseHTML(html, maxLength);

    } finally {
      clearTimeout(timeout);
    }
  }

  private async crawlStandard(url: string, maxLength: number, extractImages: boolean): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      // 랜덤 UA 생성
      const agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];
      const ua = agents[Math.floor(Math.random() * agents.length)];

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
        },
      });

      clearTimeout(timeout);
      // ✅ [FIX] URL 전달하여 네이버 도메인 강제 UTF-8 적용
      const html = await decodeResponseWithCharset(response, url);
      return this.parseHTMLAdvanced(html, maxLength, extractImages);

    } finally {
      clearTimeout(timeout);
    }
  }

  private async crawlPerfect(
    url: string,
    maxLength: number,
    extractImages: boolean,
    timeout: number
  ): Promise<any> {
    console.log('🚀 Puppeteer(Stealth) 실행 (JavaScript 렌더링)', extractImages ? '+ 이미지 추출' : '');

    // ✅ 스마트스토어/브랜드스토어: 모바일 URL로 변환 (CAPTCHA 우회 + 빠른 로딩)
    // ✅ [FIX] m.m. 중복 방지 조건 추가
    let crawlUrl = url;
    const isSmartStore = url.includes('smartstore.naver.com') && !url.includes('m.smartstore.naver.com');
    const isBrandStore = url.includes('brand.naver.com') && !url.includes('m.brand.naver.com');

    if (isSmartStore) {
      crawlUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
      console.log(`[스마트스토어] 📱 모바일 URL로 변환: ${crawlUrl.substring(0, 60)}...`);
    } else if (isBrandStore) {
      // ✅ 브랜드스토어도 모바일 버전 사용 (더 빠름)
      crawlUrl = url.replace('brand.naver.com', 'm.brand.naver.com');
      console.log(`[브랜드스토어] 📱 모바일 URL로 변환: ${crawlUrl.substring(0, 60)}...`);
    }

    // Stealth Plugin으로 브라우저 실행
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--mute-audio',
      ],
      // @ts-ignore
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await getChromiumExecutablePath(),
    });

    try {
      const page = await browser.newPage();

      // ✅ 스마트스토어/브랜드스토어: 모바일 User-Agent
      if (isSmartStore || isBrandStore) {
        await page.setUserAgent(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        );
        await page.setViewport({ width: 390, height: 844 });
      } else {
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
      }

      // ✅ 리소스 차단 (속도 최적화)
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        // 이미지 추출 모드가 아니면 이미지 차단
        if (!extractImages && type === 'image') {
          req.abort();
        } else if (['font', 'media'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(crawlUrl, {
        waitUntil: 'networkidle2',
        timeout: timeout,
      });

      // 페이지 로딩 대기 (✅ 2초 → 1초)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ✅ [강화] 노이즈 제거 및 본문 추출
      const result = await page.evaluate((shouldExtractImages: boolean) => {
        // 노이즈 선택자 (여기가 핵심)
        // ✅ [2026-01-24 FIX] 네이버 스포츠/뉴스 특화 노이즈 셀렉터 대폭 강화
        const noiseSelectors = [
          // 기본 노이즈
          'header', 'footer', 'nav', 'aside',
          'script', 'style', 'noscript', 'iframe',
          '.ad', '.ads', '.advertisement', '.banner',
          '#header', '#footer', '#nav', '#gnb', '#lnb',
          '.comment', '.comments', '#comments',
          '.related', '.related-news', '.popular-news', '.related_article', // 관련 기사 강력 제거
          '.sidebar', '.right-box', '.left-box', '.article-sidebar',
          '.menu', '.gnb', '.lnb',
          '.popup', '.modal', '.cookie-consent',
          '.copyright', '.btn-area', '.share-area',
          '.login', '.signup', '.auth',
          // ✅ [2026-01-24 FIX] 네이버 스포츠 특화 노이즈 셀렉터
          '.ranking_list', '.ranking_area', '.ranking',  // 실시간 순위
          '.popular_area', '.hot_issue', '.hot_news',    // 인기 기사
          '.news_list', '.article_list', '.list_area',   // 다른 기사 목록
          '.recommend_area', '.recommend', '.suggested', // 추천 기사
          '.more_news', '.other_news', '.related_list',  // 더보기 기사
          '.reporter_area', '.byline', '.author_info',   // 기자 정보
          '.subscribe_area', '.journalist',              // 구독 영역
          '.sports_report', '.liverank',                 // 스포츠 실시간
          '.aside_wrap', '.sub_content', '.aside_g',     // 서브 콘텐츠
          '.end_btn', '.end_ad', '.article_end',         // 기사 끝 광고
          '[class*="recommend"]', '[class*="popular"]',  // 클래스명에 포함된 경우
          '[class*="ranking"]', '[class*="related"]',
          '[class*="other_news"]', '[class*="more_"]'
        ];

        const title =
          document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
          document.querySelector('title')?.textContent ||
          '';

        const description =
          document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
          document.querySelector('meta[name="description"]')?.getAttribute('content') ||
          '';

        // 노이즈 제거 (Display None 처리)
        // 전체 문서에서 노이즈를 먼저 찾아서 숨김
        document.querySelectorAll(noiseSelectors.join(',')).forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });

        // ✅ [2026-01-24 FIX] 네이버 스포츠/뉴스 전용 본문 셀렉터 우선 적용
        let content = '';
        const naverSportsArticle = document.querySelector('#newsEndContents, .news_end, .article_body, ._article_content, .newsct_article, #dic_area, .article_view');
        const article = document.querySelector('article');
        const mainContent = document.querySelector('#main-content, .post-content, .article-content, .view_content, .news_view, #articleBody, .article_body, .contents_view');
        const main = document.querySelector('main');

        // ✅ 네이버 뉴스/스포츠 본문을 최우선으로 사용
        const targetElement = naverSportsArticle || article || mainContent || main || document.body;

        if (targetElement) {
          // 본문 내에서도 혹시 남아있는 노이즈 다시 확인
          targetElement.querySelectorAll(noiseSelectors.join(',')).forEach(el => {
            (el as HTMLElement).style.display = 'none';
          });
          content = targetElement.textContent || '';
        }

        // ✅ 이미지 추출
        let images: string[] = [];
        if (shouldExtractImages) {
          const imgElements = document.querySelectorAll('img');
          imgElements.forEach((img) => {
            // 숨겨진 이미지는 제외
            if (img.offsetParent === null) return;

            const src = img.src || img.getAttribute('data-src') || '';
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
              const width = img.naturalWidth || img.width || 0;
              const height = img.naturalHeight || img.height || 0;
              if ((width >= 200 && height >= 200) || (width === 0 && height === 0)) {
                images.push(src);
              }
            }
          });

          const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
          if (ogImage && ogImage.startsWith('http')) {
            images.unshift(ogImage);
          }
        }

        return {
          title: title.trim(),
          content: content.trim(),
          meta: { description },
          images: images.slice(0, 20),
        };
      }, extractImages);

      await browser.close();

      result.content = this.cleanText(result.content);
      result.content = result.content.slice(0, maxLength);

      console.log(`✅ Perfect 모드 완료: ${result.images?.length || 0}개 이미지 발견`);
      return result;

    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  private parseHTML(html: string, maxLength: number): any {
    const $ = cheerio.load(html);

    // ✅ 노이즈 제거
    $('script, style, iframe, noscript, header, footer, nav, aside, .ad, .ads, .comment, .related-news, .sidebar').remove();

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text() ||
      '';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    let content = '';

    const article = $('article').text();
    if (article.length > 200) {
      content = article;
    } else {
      const main = $('main').text();
      if (main.length > 200) {
        content = main;
      } else {
        content = $('body').text();
      }
    }

    content = this.cleanText(content).slice(0, maxLength);

    return {
      title: title.slice(0, 100),
      content,
      meta: { description: description.slice(0, 200) },
    };
  }

  private parseHTMLAdvanced(html: string, maxLength: number, extractImages: boolean): any {
    const $ = cheerio.load(html);

    // ✅ [2026-01-24 FIX] 강력한 노이즈 제거: 네이버 스포츠/뉴스 특화 셀렉터 포함
    const noiseSelectors = [
      'script', 'style', 'iframe', 'noscript',
      'header', 'footer', 'nav', 'aside',
      '.ad', '.ads', '.advertisement', '.banner',
      '#header', '#footer', '#nav',
      '.comment', '.comments', '#comments',
      '.related', '.related-news', '.popular-news', '.related_article',
      '.sidebar', '.right-box', '.left-box',
      '.menu', '.gnb', '.lnb',
      '.popup', '.modal', '.cookie-consent',
      '.copyright', '.btn-area', '.share-area',
      '.login', '.signup', '.auth',
      // ✅ 네이버 스포츠/뉴스 특화 노이즈
      '.ranking_list', '.ranking_area', '.ranking',
      '.popular_area', '.hot_issue', '.hot_news',
      '.news_list', '.article_list', '.list_area',
      '.recommend_area', '.recommend', '.suggested',
      '.more_news', '.other_news', '.related_list',
      '.reporter_area', '.byline', '.author_info',
      '.subscribe_area', '.journalist',
      '.sports_report', '.liverank',
      '.aside_wrap', '.sub_content', '.aside_g',
      '.end_btn', '.end_ad', '.article_end',
      '[class*="recommend"]', '[class*="popular"]',
      '[class*="ranking"]', '[class*="related"]',
      '[class*="other_news"]', '[class*="more_"]'
    ];
    $(noiseSelectors.join(',')).remove();

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text() ||
      '';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    let content = '';

    // ✅ [2026-01-24 FIX] 네이버 스포츠/뉴스 전용 본문 셀렉터 최우선
    const naverSportsArticle = $('#newsEndContents, .news_end, .article_body, ._article_content, .newsct_article, #dic_area, .article_view');
    // 1순위: article 태그
    const article = $('article');
    // 2순위: 본문 컨테이닝 요소 (일반적인 클래스명)
    const mainContent = $('#main-content, .post-content, .article-content, .view_content, .news_view, #articleBody, .article_body, .contents_view');

    // ✅ 네이버 뉴스/스포츠 본문 최우선
    let target = naverSportsArticle.length ? naverSportsArticle : (article.length ? article : (mainContent.length ? mainContent : $('main')));
    if (!target.length) target = $('body');

    if (target.length) {
      const paragraphs: string[] = [];
      target.find('p, h1, h2, h3, h4, li, div').each((i, elem) => {
        if (elem.tagName === 'div' && $(elem).children().length > 5) return; // 컨테이너 제외

        const text = $(elem).text().trim();
        // 10글자 미만은 노이즈일 확률 높음 (단, h태그는 허용)
        const isHeader = /^h[1-6]$/i.test(elem.tagName);
        if (text.length > 10 || (isHeader && text.length > 2)) {
          paragraphs.push(text);
        }
      });
      content = paragraphs.join('\n\n');
    }

    if (!content || content.length < 200) {
      content = $('body').text();
    }

    content = this.cleanText(content).slice(0, maxLength);

    let images: string[] = [];
    if (extractImages) {
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage && ogImage.startsWith('http')) {
        images.push(ogImage);
      }

      $('img').each((i, elem) => {
        // ... (이미지 추출 로직 유지)
        const src = $(elem).attr('src') || $(elem).attr('data-src') || '';
        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
          images.push(src);
        }
      });

      images = [...new Set(images)].slice(0, 20);
    }

    return {
      title: title.slice(0, 100),
      content,
      meta: { description: description.slice(0, 200) },
      images: extractImages ? images : undefined,
    };
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  private getFromCache(url: string): any | null {
    const cached = this.cache.get(url);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(url);
      return null;
    }

    return JSON.parse(cached.content);
  }

  private saveToCache(url: string, data: any): void {
    this.cache.set(url, {
      content: JSON.stringify(data),
      timestamp: Date.now(),
      // @ts-ignore
      size: data.content.length
    });

    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }
}

export const smartCrawler = new SmartCrawler();
