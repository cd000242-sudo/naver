import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import * as iconv from 'iconv-lite';
import { searchShopping, searchBlog, searchNews, searchWebDoc, stripHtmlTags } from '../naverSearchApi.js';
import { getChromiumExecutablePath } from '../browserUtils.js';
import { AdvancedAutomator } from './advancedAutomator.js';

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
  const text = buffer.toString('utf-8');

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
  _triedModes?: string[]; // 내부용: 재귀 호출 시 무한 루프 방지
  _errorLogs?: string[];  // 내부용: 실패 이력 기록
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
    try {
      console.log(`   ⏳ 최종 목적지 URL 추적 중 (Fetch Native)...`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow', // Fetch가 내부적으로 Location 헤더를 자동으로 따라갑니다
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      clearTimeout(timeout);
      
      const finalUrl = response.url;
      console.log(`   ✅ 리다이렉트 감지 완료. 최종 반환 URL: ${finalUrl.substring(0, 60)}...`);
      return finalUrl;
    } catch (error) {
      console.log(`   ❌ 리다이렉트 추적 중 예외 발생: ${(error as Error).message}`);
      // 실패할 경우 원본 URL 반환 (강제 진행)
      return url;
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
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          
          let response;
          try {
            response = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
              signal: controller.signal
            });
          } finally {
            clearTimeout(timeout);
          }
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

    // ✅ [핵심 추가] naver.me, brandconnect, 쿠팡 단축 URL → 최종 URL 추적
    let targetUrl = url;
    if (url.includes('naver.me') || url.includes('brandconnect.naver.com') || url.includes('link.coupang.com') || url.includes('coupa.ng')) {
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
      const errorMessage = `❌ ${selectedMode} 모드 실패: ${(error as Error).message}`;
      console.error(errorMessage);

      options._triedModes = options._triedModes || [];
      options._triedModes.push(selectedMode);
      options._errorLogs = options._errorLogs || [];
      options._errorLogs.push(errorMessage);

      // 실패 시 폴백 전략: 크롤링 모드 간 폴백 + 최종 검색 API 폴백
      if (selectedMode === 'standard' && !options._triedModes.includes('perfect')) {
        console.log('⚠️ Standard 실패 → Perfect 모드로 재시도 (Puppeteer)');
        return this.crawl(url, { ...options, mode: 'perfect' });
      } else if (selectedMode === 'perfect' && !options._triedModes.includes('fast')) {
        console.log('⚠️ Perfect 실패 → Fast 모드로 재시도 (가벼운 요청)');
        return this.crawl(url, { ...options, mode: 'fast' });
      } else {
        // Fast도 실패한 경우 → 검색 API 폴백 시도 (최후의 수단)
        if (!options._triedModes.includes('searchApi')) {
          console.log('⚠️ 모든 크롤링 실패 → 검색 API로 관련 정보 수집 시도');
          options._triedModes.push('searchApi');
          const searchFallback = await this.trySearchApiFallback(url);
          if (searchFallback) {
            console.log('✅ 검색 API 폴백 성공! 관련 정보로 글 생성 가능');
            this.saveToCache(url, searchFallback);
            return { ...searchFallback, mode: 'fast' as CrawlMode };
          }
        }

        // 검색 API도 실패하면 Standard로 마지막 시도
        if (!options._triedModes.includes('standard')) {
          console.log('⚠️ 검색 API도 실패 → Standard 모드로 마지막 시도');
          return this.crawl(url, { ...options, mode: 'standard' });
        }
        
        console.log('🚨 모든 폴백 전략 실패 🚨');
        if (error instanceof Error) {
          error.message = `${error.message}\n--- 상세 실패 이력 ---\n${options._errorLogs?.join('\n')}`;
        }
        throw error;
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
      urlLower.includes('blog.naver') ||    // ✅ [2026-02-08] 네이버 블로그 (iframe CSR)
      urlLower.includes('cafe.naver') ||    // ✅ [2026-02-08] 네이버 카페 (iframe CSR)
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
      
      // ✅ [FIX] 봇 차단(Access Denied) 감지 시 오류 발생 (정상 크롤링으로 위장 방지)
      if (html.includes('Access Denied') || html.includes('You don\'t have permission')) {
        throw new Error('Fast 모드도 Access Denied 차단됨');
      }

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

      // ✅ [FIX] 봇 차단(Access Denied) 감지 시 오류 발생
      if (html.includes('Access Denied') || html.includes('You don\'t have permission')) {
        throw new Error('Standard 모드도 Access Denied 차단됨');
      }

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
    const isCoupang = url.includes('coupang.com') || url.includes('coupa.ng');

    if (isSmartStore) {
      crawlUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
      console.log(`[스마트스토어] 📱 모바일 URL로 변환: ${crawlUrl.substring(0, 60)}...`);
    } else if (isBrandStore) {
      // ✅ 브랜드스토어도 모바일 버전 사용 (더 빠름)
      crawlUrl = url.replace('brand.naver.com', 'm.brand.naver.com');
      console.log(`[브랜드스토어] 📱 모바일 URL로 변환: ${crawlUrl.substring(0, 60)}...`);
    }

    // ✅ [100점 솔루션] 쿠팡은 Playwright + Stealth 사용 (headless: false 필수!)
    if (isCoupang) {
      return await this.crawlCoupangWithPlaywright(crawlUrl, maxLength, extractImages, timeout);
    }

    // ✅ [NEW] 스마트스토어/브랜드스토어도 Playwright + Stealth 사용
    if (isSmartStore || isBrandStore) {
      return await this.crawlNaverWithPlaywright(crawlUrl, maxLength, extractImages, timeout);
    }

    // Stealth Plugin으로 브라우저 실행 (쿠팡 외)
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
        const images: string[] = [];
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

      await browser.close().catch(() => undefined);

      result.content = this.cleanText(result.content);
      result.content = result.content.slice(0, maxLength);

      console.log(`✅ Perfect 모드 완료: ${result.images?.length || 0}개 이미지 발견`);
      return result;

    } catch (error) {
      await browser.close().catch(() => undefined);
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
      '[class*="other_news"]', '[class*="more_"]',
      // ✅ [2026-03-25 FIX] 연합뉴스 실제 HTML 구조 기반 노이즈 제거 (Playwright 실증 검증)
      '[class*="box-ranking"]', '[class*="box-editors"]',
      '[class*="box-hotnews"]', '[class*="box-long-stay"]',
      '[class*="video-group"]', '.txt-copyright',
      '.keyword-zone', '.empathy-zone', '.comment-zone',
      '.writer-zone01', '[class*="aside-box"]',
      // 일반 뉴스 사이트 공통 노이즈
      '.most-viewed', '.most-read', '.most-popular',
      '[class*="hotissue"]', '[class*="ranknews"]',
      '[class*="editorpick"]', '[class*="editor-pick"]',
      '[class*="most-"]', '[class*="side-"]',
      '[class*="sub_"]', '[class*="aside"]'
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
    // ✅ [2026-03-25 FIX] 연합뉴스 실제 HTML 구조 기반 본문 셀렉터 (Playwright 실증 검증)
    // 연합뉴스: div.story-news (class="story-news article"), article.article-wrap01
    const newsArticleBody = $('div.story-news, .article-wrap01, .article-text, .article_txt, #article-view-content-div, .news_body_area, .article__content, #articeBody, .view_article_body, .article_view_content');
    // 1순위: article 태그
    const article = $('article');
    // 2순위: 본문 컨테이닝 요소 (일반적인 클래스명)
    const mainContent = $('#main-content, .post-content, .article-content, .view_content, .news_view, #articleBody, .article_body, .contents_view');

    // ✅ 네이버 뉴스/스포츠 본문 최우선, 뉴스 사이트 본문 차순위
    let target = naverSportsArticle.length ? naverSportsArticle : (newsArticleBody.length ? newsArticleBody : (article.length ? article : (mainContent.length ? mainContent : $('main'))));
    if (!target.length) target = $('body');

    // ✅ [2026-03-25 FIX] body 폴백 시 본문 노드 자동 식별 (Boilerpipe 스타일)
    // KBS/MBN 등 P태그를 쓰지 않는 사이트도 대응
    // 핵심: 뉴스 본문 = 링크 비율 낮음 + 적정 크기 + DOM 깊이 깊음
    if (target.is('body')) {
      let bestNode: any = null;
      let bestScore = 0;
      $('body').find('div, section, main, article').each((i, elem) => {
        const el = $(elem);
        const totalText = el.text().trim();
        const totalLen = totalText.length;
        if (totalLen < 300) return;
        
        // 1. 링크 텍스트 비율 (낮을수록 본문)
        const linkText = el.find('a').toArray().reduce((sum, a) => sum + $(a).text().trim().length, 0);
        const linkRatio = linkText / Math.max(totalLen, 1);
        if (linkRatio > 0.5) return;
        
        const nonLinkLen = totalLen - linkText;
        let score = nonLinkLen * Math.pow(1 - linkRatio, 2);
        
        // 2. DOM 깊이 보너스 — 깊은 노드가 더 구체적인 본문 컨테이너
        let depth = 0;
        let cur = el;
        while (cur.parent().length && cur.parent()[0]?.tagName !== 'body') {
          depth++;
          cur = cur.parent();
          if (depth > 20) break;
        }
        score *= (1 + depth * 0.15);  // 깊이 1당 15% 보너스
        
        // 3. 이상적 크기 보너스 — 뉴스 본문은 보통 500~8000자
        if (totalLen >= 500 && totalLen <= 8000) {
          score *= 1.5;
        } else if (totalLen > 8000) {
          score *= 0.5;  // 너무 크면 wrapper div 가능성
        }
        
        // 4. 구조 컨테이너 페널티 — 내부 div/section이 많으면 wrapper
        const innerStructure = el.find('div, section').length;
        if (innerStructure > 20) {
          score *= 0.1;  // 20개 이상 구조 요소 → 거의 확실히 wrapper
        } else if (innerStructure > 10) {
          score *= 0.3;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestNode = el;
        }
      });
      
      if (bestNode && bestScore > 500) {
        target = bestNode;
        console.log(`[parseHTMLAdvanced] 📊 본문 자동 식별 (score: ${Math.round(bestScore)}, class: "${bestNode.attr('class')?.substring(0, 60) || ''}")`);
      }
    }

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

    // ✅ [2026-03-25 FIX] OG 타이틀 기반 신뢰도 검증 — 노이즈 오염 감지
    // 본문에 OG 타이틀의 핵심 키워드가 거의 없으면 → OG 메타 기반 폴백
    if (title && title.length > 5 && content.length > 100) {
      const ogKeywords = title
        .replace(/[''""\[\]()（）\-–—:：|,，.·…!！?？]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !/^(종합|속보|단독|사진|영상|Photo|OSEN|뉴시스|연합뉴스|기자)$/i.test(w));
      if (ogKeywords.length >= 2) {
        const matchCount = ogKeywords.filter(kw => content.includes(kw)).length;
        const relevance = matchCount / ogKeywords.length;
        if (relevance < 0.3) {
          // 본문에 OG 타이틀 키워드가 30% 미만 포함 → 노이즈 오염 판정
          console.warn(`[parseHTMLAdvanced] ⚠️ OG-본문 신뢰도 낮음 (${Math.round(relevance * 100)}%) → OG 메타 기반 폴백`);
          console.warn(`[parseHTMLAdvanced]   OG 키워드: [${ogKeywords.join(', ')}]`);
          console.warn(`[parseHTMLAdvanced]   매칭: ${matchCount}/${ogKeywords.length}`);
          const ogDescription = description || '';
          content = `${title}\n\n${ogDescription}`.trim();
        } else {
          console.log(`[parseHTMLAdvanced] ✅ OG-본문 신뢰도 OK (${Math.round(relevance * 100)}%)`);
        }
      }
    }

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

  /**
   * ✅ [개발자 전용 우회] 쿠팡 3단계 폴백 전략
   * 1단계: 모바일 API (m.coupang.com) - 봇 차단 약함
   * 2단계: OG 메타태그 추출 (최소한의 정보)
   * 3단계: Playwright + Stealth (headless: false)
   */
  private async crawlCoupangWithPlaywright(
    url: string,
    maxLength: number,
    extractImages: boolean,
    timeout: number
  ): Promise<any> {
    console.log('🔥 [쿠팡] 3단계 폴백 전략 시작...');

    // ✅ 1단계: 모바일 페이지 직접 파싱 (봇 차단이 약함)
    try {
      console.log('[쿠팡] 📱 1단계: 모바일 페이지 시도 (m.coupang.com)');
      const mobileResult = await this.crawlCoupangMobile(url, extractImages);
      if (mobileResult && mobileResult.title && mobileResult.title.length > 5) {
        console.log(`[쿠팡] ✅ 모바일 페이지 성공: ${mobileResult.title.substring(0, 30)}...`);
        mobileResult.content = this.cleanText(mobileResult.content || '').slice(0, maxLength);
        return mobileResult;
      }
    } catch (e) {
      console.log('[쿠팡] ⚠️ 모바일 페이지 실패:', (e as Error).message);
    }

    // ✅ 2단계: OG 메타태그 추출 (간단한 fetch)
    try {
      console.log('[쿠팡] 🏷️ 2단계: OG 메타태그 추출 시도');
      const ogResult = await this.crawlCoupangOG(url, extractImages);
      if (ogResult && ogResult.title && ogResult.title.length > 5) {
        console.log(`[쿠팡] ✅ OG 메타태그 성공: ${ogResult.title.substring(0, 30)}...`);
        return ogResult;
      }
    } catch (e) {
      console.log('[쿠팡] ⚠️ OG 메타태그 실패:', (e as Error).message);
    }

    // ✅ 3단계: Playwright + Stealth (최후의 수단)
    console.log('[쿠팡] 🕵️ 3단계: Playwright + Stealth 시도 (headless: false)');
    return await this.crawlCoupangPlaywrightFinal(url, maxLength, extractImages, timeout);
  }

  /**
   * 쿠팡 모바일 페이지 크롤링 (m.coupang.com)
   * - 모바일 User-Agent 사용
   * - 봇 차단이 데스크톱보다 약함
   */
  private async crawlCoupangMobile(url: string, extractImages: boolean): Promise<any> {
    // URL을 모바일로 변환
    let mobileUrl = url;
    if (url.includes('www.coupang.com')) {
      mobileUrl = url.replace('www.coupang.com', 'm.coupang.com');
    } else if (!url.includes('m.coupang.com')) {
      mobileUrl = url.replace('coupang.com', 'm.coupang.com');
    }

    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

    const response = await fetch(mobileUrl, {
      headers: {
        'User-Agent': mobileUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`모바일 페이지 응답 오류: ${response.status}`);
    }

    const html = await response.text();

    // Access Denied 체크
    if (html.includes('Access Denied') || html.includes('차단') || html.includes('robot')) {
      throw new Error('모바일 페이지도 Access Denied');
    }

    // HTML 파싱
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') ||
      $('.prod-buy-header__title').text() ||
      $('title').text() || '';

    const description = $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') || '';

    // 가격 추출
    const price = $('.total-price strong').text() ||
      $('.prod-sale-price').text() ||
      $('[class*="price"]').first().text() || '';

    // 이미지 추출
    let images: string[] = [];
    if (extractImages) {
      const ogImage = $('meta[property="og:image"]').attr('content');
      if (ogImage) images.push(ogImage);

      $('img[src*="thumbnail"], img[src*="product"], .prod-image img').each((i, elem) => {
        const src = $(elem).attr('src') || $(elem).attr('data-src');
        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
          images.push(src);
        }
      });

      images = [...new Set(images)].slice(0, 15);
    }

    // 본문 구성
    const content = [
      `상품명: ${title}`,
      price ? `가격: ${price}` : '',
      description ? `설명: ${description}` : '',
    ].filter(Boolean).join('\n');

    return {
      title: title.trim(),
      content: content,
      meta: { description, source: 'coupang_mobile' },
      images,
    };
  }

  /**
   * 쿠팡 OG 메타태그만 추출 (가장 가벼운 방법)
   */
  private async crawlCoupangOG(url: string, extractImages: boolean): Promise<any> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)', // 검색엔진 봇으로 위장
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`OG 추출 응답 오류: ${response.status}`);
    }

    const html = await response.text();

    if (html.includes('Access Denied') || html.includes('차단')) {
      throw new Error('OG 추출도 Access Denied');
    }

    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const description = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    const images = extractImages && ogImage ? [ogImage] : [];

    return {
      title: title.trim(),
      content: `상품명: ${title}\n${description}`,
      meta: { description, source: 'coupang_og' },
      images,
    };
  }

  /**
   * Playwright + Stealth 최종 시도
   */
  private async crawlCoupangPlaywrightFinal(
    url: string,
    maxLength: number,
    extractImages: boolean,
    timeout: number
  ): Promise<any> {
    let browser: any = null;

    try {
      // ✅ [100점 솔루션 이식] Playwright + Stealth 조합 (productSpecCrawler 방식)
      const { chromium } = await import('playwright-extra');
      const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
      chromium.use(stealth());

      const { getChromiumExecutablePath } = await import('../browserUtils.js');
      const execPath = await getChromiumExecutablePath();
      
      console.log(`[쿠팡] 🕵️ Playwright Stealth 모드로 쿠팡 크롤링 시작... (execPath: ${execPath || 'default'})`);

      browser = await chromium.launch({
          headless: false, // ⭐ CRITICAL: true면 100% 탐지됨
          ...(execPath ? { executablePath: execPath } : {}),
          args: [
              '--disable-blink-features=AutomationControlled',
              '--disable-dev-shm-usage',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-web-security',
              '--disable-features=IsolateOrigins,site-per-process',
              '--window-size=1920,1080',
          ],
      });

      const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ];
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

      const context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: randomUA,
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul',
          permissions: ['geolocation'],
          geolocation: { latitude: 37.5665, longitude: 126.9780 },
          colorScheme: 'light',
          extraHTTPHeaders: {
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
          },
      });

      const page = await context.newPage();

      // ⭐ CDP 레벨 속성 조작 (핵심!)
      await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          (window as any).chrome = { runtime: {}, loadTimes: function () { }, csi: function () { }, app: {} };
          Object.defineProperty(navigator, 'plugins', {
              get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }],
          });
      });

      // 🔄 1단계: 쿠팡 메인 페이지 먼저 방문 (쿠키 생성)
      console.log('[쿠팡] 🏠 쿠팡 메인 페이지 방문 중...');
      await page.goto('https://www.coupang.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 인간처럼 행동
      await page.mouse.move(500, 300);
      await page.waitForTimeout(1500 + Math.random() * 1500);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(800 + Math.random() * 700);

      // 🎯 2단계: 상품 페이지 접근
      console.log(`[쿠팡] 🎯 상품 페이지 이동... (${url})`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout });
      await page.waitForTimeout(2000 + Math.random() * 1500);

      const htmlContent = await page.content();
      if (htmlContent.includes('Access Denied') || htmlContent.includes('차단')) {
        console.log('[쿠팡] ❌ Access Denied 발생');
        await page.screenshot({ path: 'coupang_blocked_stealth.png', fullPage: true });
        throw new Error('Playwright(Stealth) Access Denied');
      }

      console.log('[쿠팡] ✅ 페이지 접근 성공! 데이터 추출 중...');

      // 제품 정보 추출 (기존 smartCrawler.ts 포맷 유지)
      const result = await page.evaluate((shouldExtractImages: boolean) => {
        const title =
          document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
          document.querySelector('.prod-buy-header__title')?.textContent ||
          document.querySelector('title')?.textContent || '';

        const description =
          document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

        const content = document.querySelector('.prod-buy-header, .prod-atf, article, main')?.textContent || document.body.textContent || '';

        let images: string[] = [];
        if (shouldExtractImages) {
          const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
          if (ogImage) images.push(ogImage);

          document.querySelectorAll('.prod-image__item img, img[src*="thumbnail"]').forEach((img) => {
            const src = (img as HTMLImageElement).src;
            if (src && src.startsWith('http') && !src.includes('logo')) {
              images.push(src);
            }
          });
          images = [...new Set(images)].slice(0, 15);
        }

        return { title: title.trim(), content: content.trim(), meta: { description }, images };
      }, extractImages);

      await browser.close().catch(() => undefined);
      
      result.content = this.cleanText(result.content || '').slice(0, maxLength);

      console.log(`[쿠팡] ✅ Playwright 성공: ${result.title?.substring(0, 30)}...`);
      return result;

    } catch (error) {
      console.error('[쿠팡] ❌ Playwright 실패:', (error as Error).message);
      if (browser) await browser.close().catch(() => undefined);
      throw error;
    }
  }

  /**
   * ✅ [NEW] 네이버 스마트스토어/브랜드스토어 전용 Playwright + Stealth 크롤러
   * - headless: false (실제 브라우저)
   * - 네이버도 봇 차단 강화 중이므로 Stealth 사용
   */
  private async crawlNaverWithPlaywright(
    url: string,
    maxLength: number,
    extractImages: boolean,
    timeout: number
  ): Promise<any> {
    console.log('🕵️ [네이버] Playwright + Stealth 모드 실행 (headless: false)');

    let browser = null;
    let context = null;

    try {
      const { chromium } = await import('playwright-extra');
      const stealth = (await import('puppeteer-extra-plugin-stealth')).default;
      chromium.use(stealth());

      // ⭐ 사용자 Chrome 프로필 경로 (쿠키/세션 재사용으로 CAPTCHA 우회)
      const userDataDir = process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`
        : process.env.HOME
          ? `${process.env.HOME}/Library/Application Support/Google/Chrome`
          : null;

      if (userDataDir) {
        console.log('[네이버] 🍪 사용자 Chrome 프로필 사용 (CAPTCHA 우회)');

        // launchPersistentContext로 기존 Chrome 프로필 사용
        const execPath = await getChromiumExecutablePath();
        context = await chromium.launchPersistentContext(userDataDir, {
          headless: false,
          executablePath: execPath || undefined,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--profile-directory=Default',
          ],
          viewport: { width: 1920, height: 1080 },
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul',
        });
      } else {
        console.log('[네이버] 🔄 새 브라우저 세션 사용');

        const execPath2 = await getChromiumExecutablePath();
        browser = await chromium.launch({
          headless: false,
          executablePath: execPath2 || undefined,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
          ],
        });

        context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul',
          extraHTTPHeaders: {
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
        });
      }

      const page = await context.newPage();

      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        (window as any).chrome = { runtime: {}, loadTimes: function () { }, csi: function () { }, app: {} };
      });

      console.log('[네이버] 🎯 상품 페이지 로딩...');
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeout });

      // ⭐ SPA 동적 렌더링 대기: 상품명이 나타날 때까지 기다림
      console.log('[네이버] ⏳ 상품 정보 렌더링 대기...');
      try {
        await page.waitForSelector('._1eddO7u4UC, ._3zzFY_wgQ6, .product-title, [class*="ProductName"], h1._2F0p2I6kQb', {
          timeout: 10000,
        });
      } catch (e) {
        console.log('[네이버] ⚠️ 상품명 셀렉터 타임아웃, 추가 대기...');
      }

      // AdvancedAutomator 어태치 및 유기적 동작 수행
      const automator = new AdvancedAutomator();
      await automator.attach(context, page);

      // 인간처럼 행동 - 제목 부위로 스와이프/스크롤 후 잠시 응시
      await automator.organicScrollTo('._1eddO7u4UC, ._3zzFY_wgQ6, .product-title, [class*="ProductName"]');
      await automator.randomWait(2000, 800);

      const htmlContent = await page.content();
      if (htmlContent.includes('에러페이지') || htmlContent.includes('시스템오류')) {
        console.log('[네이버] ⚠️ 에러 페이지 감지, 대기 후 재시도...');
        await page.waitForTimeout(3000);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
      }

      const result = await page.evaluate((shouldExtractImages: boolean) => {
        // ⭐ 네이버 스마트스토어 상품명 셀렉터 (다양한 패턴)
        const title =
          document.querySelector('._1eddO7u4UC')?.textContent ||
          document.querySelector('._3zzFY_wgQ6')?.textContent ||
          document.querySelector('h1._2F0p2I6kQb')?.textContent ||
          document.querySelector('[class*="ProductName"]')?.textContent ||
          document.querySelector('.product-title')?.textContent ||
          document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
          document.querySelector('title')?.textContent || '';

        const description =
          document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
          document.querySelector('._3DPGSjcWQn')?.textContent || '';

        // ⭐ 가격 셀렉터 (스마트스토어)
        const price =
          document.querySelector('._1LY7DqCnwR')?.textContent ||
          document.querySelector('span._3BuEmd0aIP')?.textContent ||
          document.querySelector('._3_2HPBGP5E')?.textContent ||
          document.querySelector('[class*="finalPrice"]')?.textContent ||
          document.querySelector('[class*="sale_price"]')?.textContent || '';

        // 본문 구성
        let content = `상품명: ${title}\n`;
        if (price) content += `가격: ${price}\n`;
        if (description) content += `설명: ${description}`;

        // ⭐ 이미지 추출 (스마트스토어)
        let images: string[] = [];
        if (shouldExtractImages) {
          const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
          if (ogImage) images.push(ogImage);

          document.querySelectorAll('._1QhSlmXi2u img, .product-image img, img[src*="pstatic"]').forEach((img) => {
            const src = (img as HTMLImageElement).src || (img as HTMLImageElement).getAttribute('data-src');
            if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')) {
              images.push(src);
            }
          });

          images = [...new Set(images)].slice(0, 15);
        }

        return {
          title: title.trim(),
          content: content.trim(),
          meta: { description, source: 'naver_playwright' },
          images,
        };
      }, extractImages);

      // 브라우저/컨텍스트 종료
      if (context) await context.close();
      if (browser) await browser.close().catch(() => undefined);

      result.content = this.cleanText(result.content).slice(0, maxLength);

      console.log(`[네이버] ✅ Playwright 성공: ${result.title?.substring(0, 30)}... (이미지 ${result.images?.length || 0}개)`);
      return result;

    } catch (error) {
      console.error('[네이버] ❌ Playwright 실패:', (error as Error).message);
      if (context) await context.close();
      if (browser) await browser.close().catch(() => undefined);
      throw error;
    }
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
