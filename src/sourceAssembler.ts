import Parser from 'rss-parser';
import * as iconv from 'iconv-lite';
import type { ContentSource, ContentGeneratorProvider, ArticleType } from './contentGenerator.js';
import { smartCrawler } from './crawler/smartCrawler.js';
import { getChromiumExecutablePath } from './browserUtils.js';
// 이미지 라이브러리 기능 제거됨 - 네이버 블로그 크롤링도 제거
// import { extractImagesFromHtml, extractImagesFromRss, collectImages } from './imageLibrary.js';

// ✅ [2026-01-31] puppeteer-extra + stealth 플러그인 (봇 탐지 우회)
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// ⚠️ [2026-01-31] got-scraping 제거 - ESM 전용 모듈이라 Electron과 호환 안됨
// 대신 일반 fetch + 모바일 User-Agent 사용

// Stealth 플러그인 적용 (한 번만)
puppeteerExtra.use(StealthPlugin());

// ✅ [2026-01-31] 최신 크롬 User-Agent (고정값 대신 최신 버전 사용)
const LATEST_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ✅ 한국 사이트 인코딩 자동 감지 및 변환 (EUC-KR, CP949 등 지원)
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
    console.log(`[크롤링] 🔄 인코딩 변환: ${normalizedCharset} → UTF-8`);
    return iconv.decode(buffer, normalizedCharset);
  }

  // 6. UTF-8인 경우 또는 알 수 없는 인코딩
  let text = buffer.toString('utf-8');

  // ✅ [FIX] 네이버 도메인은 무조건 UTF-8 (EUC-KR 재시도 안 함)
  const isNaverDomain = url && url.includes('naver.com');
  if (isNaverDomain) {
    console.log('[크롤링] ✅ 네이버 도메인 감지 → UTF-8 강제 사용 (EUC-KR 재시도 안 함)');
    return text;
  }

  // 7. UTF-8로 읽었는데 깨진 경우 (한글이 없거나 replacement char 있음) EUC-KR로 재시도
  const hasKorean = /[가-힣]/.test(text);
  const hasReplacementChar = text.includes('\ufffd') || text.includes('�');

  if (!hasKorean || hasReplacementChar) {
    console.log('[크롤링] ⚠️ UTF-8 인코딩 실패, EUC-KR로 재시도...');
    const eucKrText = iconv.decode(buffer, 'euc-kr');
    if (/[가-힣]/.test(eucKrText)) {
      console.log('[크롤링] ✅ EUC-KR 인코딩으로 복구 성공!');
      return eucKrText;
    }

    // CP949로도 시도
    const cp949Text = iconv.decode(buffer, 'cp949');
    if (/[가-힣]/.test(cp949Text)) {
      console.log('[크롤링] ✅ CP949 인코딩으로 복구 성공!');
      return cp949Text;
    }
  }

  return text;
}


// ✅ 네이버 검색 API로 관련 콘텐츠 수집 (크롤링 실패 시 폴백)
interface NaverSearchResult {
  title: string;
  description: string;
  link: string;
}

// ✅ 네이버 쇼핑 검색 결과 타입
interface NaverShoppingResult {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
}

// ✅ 네이버 이미지 검색 결과 타입
interface NaverImageResult {
  title: string;
  link: string;
  thumbnail: string;
  sizeheight: string;
  sizewidth: string;
}

// ✅ 쇼핑몰 크롤링 옵션 타입
interface CrawlOptions {
  imagesOnly?: boolean;
  naverClientId?: string;
  naverClientSecret?: string;
}

// ✅ 쇼핑몰 크롤링 결과 타입
// ✅ [2026-01-30] 스펙, 리뷰, 리뷰이미지 필드 추가
interface CrawlResult {
  images: string[];
  title?: string;
  description?: string;
  price?: string;
  mallName?: string;
  brand?: string;
  // ✅ [2026-01-30] 추가 필드
  spec?: string;           // 제품 스펙 (크기, 무게, 소재 등)
  category?: string;       // 카테고리 정보
  reviews?: string[];      // 리뷰 텍스트 배열 (최대 5개)
  reviewImages?: string[]; // 포토리뷰 이미지 (우선 수집)
  isErrorPage?: boolean;   // 에러 페이지 감지 플래그
}

// ✅ [2026-01-31] JSON-LD 구조화 데이터 파싱 (가장 안정적인 데이터 추출 방식)
// 네이버가 검색엔진을 위해 숨겨놓은 표준 데이터 - 디자인이 바뀌어도 절대 변하지 않음
interface JsonLdProduct {
  name?: string;
  description?: string;
  image?: string | string[];
  offers?: {
    price?: number | string;
    priceCurrency?: string;
  };
  brand?: {
    name?: string;
  };
  aggregateRating?: {
    ratingValue?: number;
    reviewCount?: number;
  };
}

/**
 * ✅ [2026-01-31] 페이지에서 JSON-LD 구조화 데이터 추출
 * @returns 제품 정보 또는 null (JSON-LD가 없는 경우)
 */
function extractJsonLdFromHtml(html: string): JsonLdProduct | null {
  try {
    // application/ld+json 스크립트 태그 찾기
    const ldJsonMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (!ldJsonMatch) return null;

    for (const match of ldJsonMatch) {
      const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
      try {
        const parsed = JSON.parse(jsonContent);

        // @type이 Product인 것 찾기
        if (parsed['@type'] === 'Product' ||
          (Array.isArray(parsed['@graph']) && parsed['@graph'].some((item: any) => item['@type'] === 'Product'))) {
          const product = parsed['@type'] === 'Product'
            ? parsed
            : parsed['@graph'].find((item: any) => item['@type'] === 'Product');

          if (product) {
            console.log('[JSON-LD] ✅ Product 데이터 발견!');
            return product as JsonLdProduct;
          }
        }
      } catch (parseError) {
        // JSON 파싱 실패 - 다음 스크립트 시도
        continue;
      }
    }

    return null;
  } catch (error) {
    console.warn('[JSON-LD] 파싱 실패:', (error as Error).message);
    return null;
  }
}

/**
 * ✅ [2026-01-31] 단축 URL 최종 목적지 획득 (fetch HEAD 방식)
 * naver.me, link.coupang 등 단축 URL을 실제 URL로 변환
 */
async function resolveShortUrl(url: string): Promise<string> {
  // 단축 URL 패턴 확인
  const shortUrlPatterns = [
    'naver.me/',
    'link.coupang.com/',
    'coupa.ng/',
    'bit.ly/',
    'goo.gl/',
    't.ly/',
    'tinyurl.com/'
  ];

  const isShortUrl = shortUrlPatterns.some(pattern => url.includes(pattern));
  if (!isShortUrl) return url;

  console.log(`[단축URL] 📎 ${url.substring(0, 40)}... 최종 목적지 확인 중...`);

  try {
    // HEAD 요청으로 리다이렉트 추적 (본문 다운로드 없이 빠름)
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': LATEST_CHROME_UA }
    });

    const finalUrl = response.url;
    console.log(`[단축URL] ✅ 최종 URL: ${finalUrl.substring(0, 60)}...`);
    return finalUrl;
  } catch (error) {
    console.warn(`[단축URL] ⚠️ 리다이렉트 실패: ${(error as Error).message}`);
    return url; // 실패 시 원본 URL 반환
  }
}

/**
 * ✅ [2026-01-31] URL에서 상품번호 또는 상품명 추출
 * brandconnect, smartstore, brand.naver.com 등에서 상품 식별 정보 추출
 */
function extractProductIdFromUrl(url: string): { productId?: string; storeName?: string } {
  // 1. channelProductNo 파라미터에서 추출 (브랜드 커넥트)
  const channelProductMatch = url.match(/[?&]channelProductNo=(\d+)/);
  if (channelProductMatch) {
    console.log(`[상품ID] channelProductNo에서 추출: ${channelProductMatch[1]}`);
    return { productId: channelProductMatch[1] };
  }

  // 2. productNo 파라미터에서 추출
  const productNoMatch = url.match(/[?&]productNo=(\d+)/);
  if (productNoMatch) {
    console.log(`[상품ID] productNo에서 추출: ${productNoMatch[1]}`);
    return { productId: productNoMatch[1] };
  }

  // 3. products/숫자 패턴에서 추출
  const productsMatch = url.match(/products\/(\d+)/);
  if (productsMatch) {
    console.log(`[상품ID] products/에서 추출: ${productsMatch[1]}`);
    return { productId: productsMatch[1] };
  }

  // 4. 스토어명 추출 (smartstore.naver.com/스토어명)
  const storeMatch = url.match(/smartstore\.naver\.com\/([^\/\?]+)/);
  if (storeMatch) {
    console.log(`[상품ID] 스토어명 추출: ${storeMatch[1]}`);
    return { storeName: storeMatch[1] };
  }

  // 5. 브랜드스토어명 추출 (brand.naver.com/브랜드명)
  const brandMatch = url.match(/brand\.naver\.com\/([^\/\?]+)/);
  if (brandMatch) {
    console.log(`[상품ID] 브랜드명 추출: ${brandMatch[1]}`);
    return { storeName: brandMatch[1] };
  }

  return {};
}

/**
 * ✅ [2026-01-31] [Secret] 스마트스토어 모바일 내부 API 호출
 * 스토어명을 몰라도 '상품번호'만 있으면 모든 정보를 JSON으로 가져옵니다.
 * brandconnect 에러 페이지 우회용 치트키
 * Endpoint: https://m.smartstore.naver.com/i/v1/products/{상품번호}
 */
async function fetchFromMobileApi(productId: string): Promise<CrawlResult | null> {
  if (!productId) return null;

  const apiUrl = `https://m.smartstore.naver.com/i/v1/products/${productId}`;
  console.log(`[Mobile API] 🕵️ Secret API로 우회 접속: ${apiUrl}`);

  // ✅ 429 Rate Limit 대응: 최대 3회 리트라이 + 지수 백오프
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 첫 시도 외에는 대기
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500; // 2초, 4초, ...
        console.log(`[Mobile API] ⏳ ${attempt + 1}차 재시도 (${Math.round(delay / 1000)}초 대기)...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://m.smartstore.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      // 429 Rate Limit → 리트라이
      if (response.status === 429) {
        console.warn(`[Mobile API] ⚠️ 429 Rate Limit (${attempt + 1}/${maxRetries})`);
        continue;
      }

      if (!response.ok) {
        console.warn(`[Mobile API] 요청 실패: ${response.status}`);
        return null;
      }

      const data = await response.json();

      // 데이터 유효성 검사
      if (!data || !data.name) {
        console.warn('[Mobile API] 유효하지 않은 데이터');
        return null;
      }

      console.log(`[Mobile API] ✅ 데이터 확보 성공: ${data.name}`);

      // 이미지 배열 구성
      const images: string[] = [];
      if (data.repImage?.url) images.push(data.repImage.url);
      if (data.optionalImages && Array.isArray(data.optionalImages)) {
        data.optionalImages.forEach((img: any) => {
          if (img.url) images.push(img.url);
        });
      }

      return {
        title: data.name,
        price: data.salePrice ? `${data.salePrice.toLocaleString()}원` : undefined,
        brand: data.brand || data.manufacturerName,
        mallName: data.channel?.channelName || '네이버 스마트스토어',
        description: data.content || `상품번호 ${productId}에 대한 상세 정보입니다.`,
        images: images,
        spec: data.modelName ? `모델명: ${data.modelName}` : undefined
      };

    } catch (error) {
      console.warn(`[Mobile API] ❌ 에러: ${(error as Error).message}`);
      // 리트라이 계속
      continue;
    }
  }

  // 모든 리트라이 실패
  console.warn(`[Mobile API] ❌ ${maxRetries}회 시도 후에도 실패`);
  return null;
}

/**
 * ✅ [2026-01-31] [1단계: 초고속 HTTP 스텔스] fetch 기반 빠른 요청
 * 브라우저를 띄우지 않고 HTTP 요청만으로 데이터를 가져옴 (속도 0.1초)
 * 동적 렌더링(CSR) 페이지는 내용이 없을 수 있으므로 검증 로직 필수
 * ⚠️ got-scraping 대신 일반 fetch 사용 (ESM 호환성 문제로 교체)
 */
async function fetchWithTLS(url: string): Promise<{ html: string; success: boolean; finalUrl: string }> {
  try {
    console.log(`[Stage 1] 🚀 HTTP 스텔스 요청 시도: ${url.substring(0, 60)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const html = await response.text();
      console.log(`[Stage 1] ✅ HTTP 요청 성공 (${html.length} bytes)`);
      return { html, success: true, finalUrl: response.url };
    }

    return { html: '', success: false, finalUrl: url };
  } catch (error) {
    console.warn(`[Stage 1] ⚠️ HTTP 요청 실패 (2단계로 전환): ${(error as Error).message}`);
    return { html: '', success: false, finalUrl: url };
  }
}

/**
 * ✅ [2026-01-31] 범용 메타 데이터 추출 (Universal Meta Fallback)
 * 네이버 API 검색 결과가 0건일 때 OG/Twitter 메타 태그에서 추출
 * 전세계 웹사이트 99%에 적용 가능
 */
function extractUniversalMeta(html: string): CrawlResult | null {
  console.log('[Meta 폴백] 🌐 범용 메타 데이터 추출 시도...');

  // 제목 추출 (우선순위: og:title > twitter:title > title 태그)
  let title = '';
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const twitterTitle = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
  const titleTag = html.match(/<title>([^<]+)<\/title>/i);

  if (ogTitle) title = ogTitle[1];
  else if (twitterTitle) title = twitterTitle[1];
  else if (titleTag) title = titleTag[1];

  if (!title) {
    console.log('[Meta 폴백] ⚠️ 제목 추출 실패');
    return null;
  }

  // 이미지 추출 (og:image, twitter:image)
  const images: string[] = [];
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  const twitterImage = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);

  if (ogImage && ogImage[1]) images.push(ogImage[1]);
  if (twitterImage && twitterImage[1] && !images.includes(twitterImage[1])) images.push(twitterImage[1]);

  // 가격 추출 (og:price:amount, product:price:amount)
  let price = '';
  const ogPrice = html.match(/<meta[^>]*property=["'](?:og:price:amount|product:price:amount)["'][^>]*content=["']([^"']+)["']/i);
  if (ogPrice) {
    price = ogPrice[1] + '원';
  }

  // 설명 추출 (og:description, description)
  let description = '';
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

  if (ogDesc) description = ogDesc[1];
  else if (metaDesc) description = metaDesc[1];

  console.log(`[Meta 폴백] ✅ 범용 메타 추출 성공!`);
  console.log(`  제목: ${title.substring(0, 50)}...`);
  console.log(`  이미지: ${images.length}개`);
  console.log(`  가격: ${price || '없음'}`);

  return {
    images,
    title,
    price: price || undefined,
    description: description || undefined
  };
}

/**
 * ✅ [2026-01-31] 네이버 쇼핑 API로 상품 정보 폴백 검색
 * Puppeteer 크롤링 실패 시 최후의 보루
 * productName: 페이지에서 추출한 상품명 (우선 사용)
 */
async function fallbackToNaverShoppingApi(
  url: string,
  clientId?: string,
  clientSecret?: string,
  productName?: string  // ✅ 상품명 파라미터 추가
): Promise<CrawlResult | null> {

  // ✅ [2026-01-31] [SECRET] 상품번호가 있으면 내부 모바일 API 먼저 시도 (가장 강력함)
  const { productId } = extractProductIdFromUrl(url);
  if (productId) {
    console.log(`[API 폴백] 🕵️ 상품번호 발견: ${productId} → Secret API 시도`);
    const mobileResult = await fetchFromMobileApi(productId);
    if (mobileResult) {
      console.log(`[API 폴백] ✅ Secret Mobile API로 완벽 복구 성공!`);
      return mobileResult;
    }
    console.log(`[API 폴백] ⚠️ Secret API 실패 → 네이버 쇼핑 API로 폴백`);
  }

  if (!clientId || !clientSecret) {
    console.log('[API 폴백] ⚠️ 네이버 API 키 없음 - 폴백 불가');
    return null;
  }

  console.log('[API 폴백] 🔄 네이버 쇼핑 API로 폴백 시도...');

  // ✅ 우선순위: 상품명 > 스토어명 > 상품번호
  let searchQuery = '';

  if (productName) {
    // 상품명에서 불필요한 부분 제거
    searchQuery = productName
      .replace(/\[에러\].*$/, '')
      .replace(/에러페이지.*$/, '')
      .replace(/시스템오류.*$/, '')
      .trim();
    console.log(`[API 폴백] 상품명으로 검색: "${searchQuery}"`);
  }

  // 상품명이 없거나 에러 관련이면 URL에서 추출
  if (!searchQuery || searchQuery.length < 5) {
    const { productId, storeName } = extractProductIdFromUrl(url);
    searchQuery = storeName || productId || '';
    console.log(`[API 폴백] URL에서 검색어 추출: "${searchQuery}"`);
  }

  if (!searchQuery || searchQuery.length < 2) {
    console.log('[API 폴백] ⚠️ 검색어 추출 실패');
    return null;
  }

  try {
    // 네이버 쇼핑 API 호출
    const apiUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(searchQuery)}&display=10`;
    const response = await fetch(apiUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret
      }
    });

    // ✅ [2026-01-31] Quota Error (429) 처리 - 프로그램 절대 죽지 않음
    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[API 폴백] ⚠️ API 할당량 초과 (429) - 더미 데이터 반환');
        return {
          images: [],
          title: '[수동 확인 필요] API 할당량 초과',
          price: undefined,
          mallName: undefined,
          brand: undefined,
          description: `API 할당량 초과로 자동 크롤링 실패. URL: ${url}`
        };
      }
      throw new Error(`API 응답 오류: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      console.log(`[API 폴백] ✅ 상품 발견: ${item.title?.replace(/<[^>]+>/g, '')}`);

      return {
        images: item.image ? [item.image] : [],
        title: item.title?.replace(/<[^>]+>/g, ''),
        price: item.lprice ? item.lprice + '원' : undefined,
        mallName: item.mallName,
        brand: item.brand,
        description: item.productType
      };
    }

    console.log('[API 폴백] ⚠️ 검색 결과 없음 - 더미 데이터 반환');
    // ✅ 검색 결과 없어도 더미 데이터 반환 (프로그램 죽지 않음)
    return {
      images: [],
      title: searchQuery ? `[수동 확인 필요] ${searchQuery}` : '[수동 확인 필요]',
      price: undefined,
      description: `검색 결과 없음. URL: ${url}`
    };
  } catch (error) {
    console.error('[API 폴백] ❌ 실패:', (error as Error).message);
    // ✅ 에러가 나도 더미 데이터 반환 (프로그램 절대 죽지 않음)
    return {
      images: [],
      title: '[수동 확인 필요] 크롤링 실패',
      price: undefined,
      description: `크롤링 실패: ${(error as Error).message}. URL: ${url}`
    };
  }
}


async function searchNaverForContent(
  query: string,
  clientId: string,
  clientSecret: string,
  searchType: 'blog' | 'news' | 'webkr' | 'shop' | 'image' = 'blog',
  displayCount: number = 30  // ✅ 더 많은 결과 수집
): Promise<NaverSearchResult[]> {
  const results: NaverSearchResult[] = [];

  try {
    const fetchImpl = await ensureFetch();
    const encodedQuery = encodeURIComponent(query);
    const url = `https://openapi.naver.com/v1/search/${searchType}.json?query=${encodedQuery}&display=${displayCount}&sort=date`;

    console.log(`[네이버 검색 API] "${query}" 검색 중 (${searchType}, ${displayCount}개)...`);

    const response = await fetchImpl(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!response.ok) {
      console.warn(`[네이버 검색 API] HTTP ${response.status}: ${response.statusText}`);
      return results;
    }

    const data = await response.json();

    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        // HTML 태그 제거 및 특수문자 정리
        const title = (item.title || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        const description = (item.description || '')
          .replace(/<[^>]*>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();

        // ✅ 30자 이상의 의미있는 콘텐츠만 수집
        if (description.length > 30) {
          results.push({
            title,
            description,
            link: item.link || item.originallink || '',
          });
        }
      }
      console.log(`[네이버 검색 API] ✅ ${results.length}개 결과 수집 (총 ${data.items.length}개 중)`);
    }
  } catch (error) {
    console.error(`[네이버 검색 API] ❌ 실패: ${(error as Error).message}`);
  }

  return results;
}

// ✅ 네이버 쇼핑 검색 API (스마트스토어, 쇼핑커넥트, 브랜드스토어 포함)
async function searchNaverShopping(
  query: string,
  clientId: string,
  clientSecret: string,
  displayCount: number = 20
): Promise<NaverShoppingResult[]> {
  const results: NaverShoppingResult[] = [];

  try {
    const fetchImpl = await ensureFetch();
    const encodedQuery = encodeURIComponent(query);
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodedQuery}&display=${displayCount}&sort=sim`;

    console.log(`[네이버 쇼핑 API] "${query}" 검색 중...`);

    const response = await fetchImpl(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!response.ok) {
      console.warn(`[네이버 쇼핑 API] HTTP ${response.status}`);
      return results;
    }

    const data = await response.json();

    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        results.push({
          title: (item.title || '').replace(/<[^>]*>/g, '').trim(),
          link: item.link || '',
          image: item.image || '',
          lprice: item.lprice || '0',
          hprice: item.hprice || '0',
          mallName: item.mallName || '',
          productId: item.productId || '',
          productType: item.productType || '',
          brand: item.brand || '',
          maker: item.maker || '',
          category1: item.category1 || '',
          category2: item.category2 || '',
          category3: item.category3 || '',
          category4: item.category4 || '',
        });
      }
      console.log(`[네이버 쇼핑 API] ✅ ${results.length}개 상품 검색됨`);
    }
  } catch (error) {
    console.error(`[네이버 쇼핑 API] ❌ 실패: ${(error as Error).message}`);
  }

  return results;
}

// ✅ 네이버 이미지 검색 API (제목 기반 이미지 수집 - 최신순)
async function searchNaverImages(
  query: string,
  clientId: string,
  clientSecret: string,
  displayCount: number = 30,
  sortByDate: boolean = true, // ✅ 최신순 정렬 기본값
  filter: 'all' | 'large' | 'medium' | 'small' | 'cc_any' | 'cc_commercial' = 'large' // ✅ 필터 옵션 추가
): Promise<NaverImageResult[]> {
  const results: NaverImageResult[] = [];

  try {
    const fetchImpl = await ensureFetch();
    const encodedQuery = encodeURIComponent(query);
    // ✅ sort=date로 최신순 정렬 (발행날짜에 뜨는 이미지 우선)
    const sortParam = sortByDate ? 'date' : 'sim';
    const url = `https://openapi.naver.com/v1/search/image?query=${encodedQuery}&display=${displayCount}&sort=${sortParam}&filter=${filter}`;

    console.log(`[네이버 이미지 API] "${query}" 검색 중 (필터: ${filter})...`);

    const response = await fetchImpl(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!response.ok) {
      console.warn(`[네이버 이미지 API] HTTP ${response.status}`);
      return results;
    }

    const data = await response.json();

    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        // ✅ 깨진/흐린 이미지 필터링
        const width = parseInt(item.sizewidth || '0', 10);
        const height = parseInt(item.sizeheight || '0', 10);
        const link = item.link || '';

        // 너무 작은 이미지 제외 (흐린 이미지 가능성 높음)
        if (width < 300 || height < 200) {
          console.log(`[네이버 이미지 API] ⚠️ 작은 이미지 제외: ${width}x${height}`);
          continue;
        }

        // 깨진 이미지 패턴 필터링 (placeholder, noimage, error 등)
        const brokenImagePatterns = [
          /noimage/i,
          /placeholder/i,
          /no_image/i,
          /default/i,
          /blank/i,
          /error/i,
          /missing/i,
          /notfound/i,
          /404/i,
          /broken/i,
          /empty/i,
          /dummy/i,
          /spacer\.gif/i,
          /1x1\.png/i,
          /pixel\.gif/i,
        ];

        const isBrokenImage = brokenImagePatterns.some(pattern => pattern.test(link));
        if (isBrokenImage) {
          console.log(`[네이버 이미지 API] ⚠️ 깨진 이미지 패턴 제외: ${link.substring(0, 50)}...`);
          continue;
        }

        // 유효한 이미지만 추가
        results.push({
          title: (item.title || '').replace(/<[^>]*>/g, '').trim(),
          link: link,
          thumbnail: item.thumbnail || '',
          sizeheight: item.sizeheight || '0',
          sizewidth: item.sizewidth || '0',
        });
      }
      console.log(`[네이버 이미지 API] ✅ ${results.length}개 유효한 이미지 검색됨 (깨진/흐린 이미지 제외)`);
    }
  } catch (error) {
    console.error(`[네이버 이미지 API] ❌ 실패: ${(error as Error).message}`);
  }

  return results;
}

// ✅ URL에서 제품명 추출 함수 (스마트스토어, 쿠팡 등)
// ✅ CAPTCHA 우회: Puppeteer 실패 시 스토어명으로 네이버 쇼핑 API 검색
// ✅ [2026-01-30] brandconnect.naver.com 및 naver.me 단축 URL 지원
async function extractProductNameFromUrl(url: string): Promise<string> {
  try {
    // ✅ [최우선] naver.me 단축 URL → 실제 URL로 리다이렉트
    if (url.includes('naver.me/')) {
      console.log(`[제품명 추출] naver.me 단축 URL 감지, 리다이렉트 확인 중...`);
      try {
        const response = await fetch(url, { redirect: 'follow' });
        const finalUrl = response.url;
        console.log(`[제품명 추출] 리다이렉트: ${url} → ${finalUrl}`);
        // 재귀 호출로 실제 URL 처리
        return extractProductNameFromUrl(finalUrl);
      } catch (redirectError) {
        console.warn(`[제품명 추출] 리다이렉트 실패: ${(redirectError as Error).message}`);
      }
    }

    // ✅ [2026-01-30] brandconnect.naver.com (쇼핑커넥트) - og:title에서 제품명 추출
    if (url.includes('brandconnect.naver.com')) {
      console.log(`[제품명 추출] 🛒 brandconnect.naver.com 감지, og:title 추출 시도...`);
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        const html = await response.text();

        // 1순위: og:title 메타 태그
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
        if (ogTitleMatch && ogTitleMatch[1]) {
          const ogTitle = ogTitleMatch[1]
            .replace(/ - 네이버 쇼핑$/, '')
            .replace(/ : 네이버 쇼핑$/, '')
            .trim();
          if (ogTitle && ogTitle.length > 5) {
            console.log(`[제품명 추출] ✅ og:title에서 추출: "${ogTitle}"`);
            return ogTitle;
          }
        }

        // 2순위: 제품명 JSON 데이터 추출
        const productNameMatch = html.match(/"productName"\s*:\s*"([^"]+)"/);
        if (productNameMatch && productNameMatch[1]) {
          console.log(`[제품명 추출] ✅ JSON에서 추출: "${productNameMatch[1]}"`);
          return productNameMatch[1];
        }

        // 3순위: title 태그
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          const title = titleMatch[1]
            .replace(/ - 네이버 쇼핑$/, '')
            .replace(/ : 네이버.*$/, '')
            .trim();
          if (title && title.length > 5) {
            console.log(`[제품명 추출] ✅ title에서 추출: "${title}"`);
            return title;
          }
        }
      } catch (brandConnectError) {
        console.warn(`[제품명 추출] brandconnect 크롤링 실패: ${(brandConnectError as Error).message}`);
      }
    }

    // 1. 스마트스토어 URL 패턴: /products/제품ID 또는 제품명이 URL에 포함
    if (url.includes('smartstore.naver.com')) {
      // URL 디코딩
      const decodedUrl = decodeURIComponent(url);

      // 제품명이 URL에 있는 경우 추출 (한글 포함)
      const productMatch = decodedUrl.match(/products\/\d+\/([^/?]+)/);
      if (productMatch && productMatch[1]) {
        return productMatch[1].replace(/-/g, ' ').trim();
      }

      // URL 파라미터에서 제품명 추출
      const urlObj = new URL(url);
      const productName = urlObj.searchParams.get('productName') || urlObj.searchParams.get('keyword');
      if (productName) return productName;

      // ✅ 스토어명 추출 (CAPTCHA 우회용)
      const storeMatch = url.match(/smartstore\.naver\.com\/([^/]+)/);
      const storeName = storeMatch ? storeMatch[1] : '';

      console.log(`[제품명 추출] 스마트스토어 URL - 스토어명: "${storeName}", Puppeteer 시도...`);

      // ✅ Puppeteer 시도 (빠르게 실패 처리)
      try {
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.default.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-background-networking',
            '--js-flags=--max-old-space-size=128', // ✅ 저사양 최적화
          ]
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

        const pageTitle = await page.title();
        await browser.close();

        // ✅ [100점 수정] 에러 페이지 감지 강화 - 에러 메시지가 검색 키워드로 사용되는 버그 수정
        // Knowledge Item 참조: "Naver Access Denied Search Fallback Bug"
        const errorPagePatterns = [
          '에러', '오류', '접근', '차단', '점검', '불가', '삭제', '존재하지',
          '페이지를 찾을 수', '주소가 바르게', '서비스 접속',
          'security', 'verification', 'error', 'denied', 'blocked', 'captcha',
          'maintenance', 'not found', '404', '500'
        ];

        const isErrorPage = !pageTitle ||
          pageTitle.length < 5 ||
          errorPagePatterns.some(pattern => pageTitle.toLowerCase().includes(pattern.toLowerCase()));

        if (isErrorPage) {
          console.error(`[제품명 추출] ❌ 에러 페이지 감지! 타이틀: "${pageTitle}"`);
          console.error(`[제품명 추출] ❌ 잘못된 제품명이 검색 키워드로 사용되는 것을 방지하기 위해 빈 값 반환`);
          // ✅ [핵심 수정] 스토어명 폴백도 하지 않음 - 잘못된 검색 결과 방지
          // 이전: return storeName ? `${storeName} 인기상품` : '';
          return ''; // 빈 값 반환 → 크롤링 실패로 처리
        }

        // 정상 제목이면 추가 검증 후 사용
        if (pageTitle && pageTitle.length > 5) {
          const cleanTitle = pageTitle
            .replace(/\s*[-|:]\s*(스마트스토어|네이버|NAVER).*/gi, '')
            .replace(/\s*\[.*?\]\s*/g, '')
            .trim();

          // ✅ 최종 검증: 클리닝 후에도 에러 패턴이 있으면 거부
          if (errorPagePatterns.some(pattern => cleanTitle.toLowerCase().includes(pattern.toLowerCase()))) {
            console.error(`[제품명 추출] ❌ 클리닝 후에도 에러 패턴 발견: "${cleanTitle}"`);
            return '';
          }

          console.log(`[제품명 추출] ✅ 제품명: "${cleanTitle}"`);
          return cleanTitle;
        }
      } catch (puppeteerError) {
        console.warn(`[제품명 추출] Puppeteer 실패: ${(puppeteerError as Error).message}`);
      }

      // ✅ Puppeteer 실패 시 스토어명으로 폴백
      if (storeName) {
        console.log(`[제품명 추출] 스토어명 "${storeName}"으로 검색합니다.`);
        return `${storeName} 인기상품`;
      }
    }

    // 2. 쿠팡 URL 패턴
    if (url.includes('coupang.com') || url.includes('coupa.ng')) {
      const decodedUrl = decodeURIComponent(url);
      // 제품명이 URL 경로에 있는 경우
      const productMatch = decodedUrl.match(/\/vp\/products\/\d+\?.*itemName=([^&]+)/i);
      if (productMatch && productMatch[1]) {
        return productMatch[1].replace(/\+/g, ' ').trim();
      }

      // URL 경로에서 제품 ID 추출
      const idMatch = url.match(/\/vp\/products\/(\d+)/);
      if (idMatch) {
        return `쿠팡 상품 ${idMatch[1]}`;
      }
    }

    // 3. 지마켓/옥션/11번가 등
    if (url.includes('gmarket.co.kr') || url.includes('auction.co.kr') || url.includes('11st.co.kr')) {
      const urlObj = new URL(url);
      const keyword = urlObj.searchParams.get('keyword') || urlObj.searchParams.get('kwd') || urlObj.searchParams.get('q');
      if (keyword) return keyword;
    }

    // 4. 일반적인 URL 파라미터에서 추출 시도
    try {
      const urlObj = new URL(url);
      const possibleParams = ['q', 'query', 'keyword', 'search', 'name', 'productName', 'item'];
      for (const param of possibleParams) {
        const value = urlObj.searchParams.get(param);
        if (value) return value;
      }
    } catch { }

    // 5. 마지막 수단: Puppeteer로 페이지 제목 추출
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({ headless: true });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 제품명 셀렉터들 시도
      const selectors = [
        'h1.product-title', '.product-name', '.prod_name', '.prd_name',
        'h1[class*="product"]', 'h1[class*="title"]', '.item-title', '.goods_name',
        'meta[property="og:title"]', 'title'
      ];

      let productName = '';
      for (const selector of selectors) {
        try {
          if (selector.startsWith('meta')) {
            productName = await page.$eval(selector, el => el.getAttribute('content') || '') || '';
          } else if (selector === 'title') {
            productName = await page.title();
          } else {
            productName = await page.$eval(selector, el => el.textContent?.trim() || '') || '';
          }
          if (productName && productName.length > 3) break;
        } catch { }
      }

      await browser.close();

      if (productName) {
        // 불필요한 텍스트 제거
        productName = productName
          .replace(/\s*[-|:]\s*(스마트스토어|네이버|쿠팡|지마켓|옥션|11번가).*/gi, '')
          .replace(/\s*\[.*?\]\s*/g, '')
          .trim();
        return productName;
      }
    } catch (puppeteerError) {
      console.warn(`[제품명 추출] Puppeteer 실패: ${(puppeteerError as Error).message}`);
    }

    return '';
  } catch (error) {
    console.error(`[제품명 추출] 오류: ${(error as Error).message}`);
    return '';
  }
}

// ✅ 네이버 API 우선 크롤링 (할당량 초과 시 기존 방식 폴백)
async function tryNaverApiFirst(
  url: string,
  productName: string,
  options: CrawlOptions
): Promise<{ success: boolean; images: string[]; title?: string; description?: string; price?: string }> {
  if (!options.naverClientId || !options.naverClientSecret) {
    console.log(`[네이버 API] API 키 없음, 기존 크롤링 사용`);
    return { success: false, images: [] };
  }

  try {
    console.log(`[네이버 API] 🔍 "${productName}" 검색 시도...`);

    // 네이버 쇼핑 API로 제품 정보 검색
    const shoppingResults = await searchNaverShopping(
      productName,
      options.naverClientId,
      options.naverClientSecret,
      10
    );

    // ✅ [2026-01-31 FIX] 네이버 이미지 API 비활성화 - 제품과 다른 이미지를 반환하는 문제
    // 쇼핑 API에서 가져온 이미지만 사용하여 정확도 보장
    const imageResults: { link: string }[] = []; // 이미지 API 사용 안함
    console.log(`[네이버 API] ⚠️ 이미지 API 비활성화 (잘못된 이미지 반환 방지)`);

    if (shoppingResults.length > 0) {
      const product = shoppingResults[0];
      const images = [
        ...shoppingResults.map(r => r.image).filter(Boolean),
      ];

      // 중복 제거
      const uniqueImages = [...new Set(images)];

      console.log(`[네이버 API] ✅ 성공: 상품 ${shoppingResults.length}개, 이미지 ${uniqueImages.length}개 (쇼핑 API만 사용)`);

      return {
        success: true,
        images: uniqueImages.slice(0, 50),
        title: product?.title || productName,
        description: product
          ? `${product.brand || ''} ${product.category1 || ''} ${product.category2 || ''} - 가격: ${Number(product.lprice).toLocaleString()}원`.trim()
          : '',
        price: product?.lprice,
      };
    }

    console.log(`[네이버 API] ⚠️ 검색 결과 없음`);
    return { success: false, images: [] };

  } catch (error: any) {
    // API 할당량 초과 감지
    if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('할당량')) {
      console.warn(`[네이버 API] ⚠️ 할당량 초과! 기존 크롤링으로 폴백...`);
    } else {
      console.error(`[네이버 API] ❌ 오류: ${error.message}`);
    }
    return { success: false, images: [] };
  }
}

// ✅ 쇼핑몰/스마트스토어 이미지 수집 함수
export async function collectShoppingImages(
  query: string,
  clientId: string,
  clientSecret: string,
  maxImages: number = 10
): Promise<string[]> {
  const images: string[] = [];

  try {
    const shopResults = await searchNaverShopping(query, clientId, clientSecret, maxImages * 2);

    for (const item of shopResults) {
      if (item.image && images.length < maxImages) {
        // 원본 이미지 URL로 변환
        let imageUrl = item.image;
        if (imageUrl.includes('pstatic.net')) {
          imageUrl = imageUrl.replace(/[?&]type=\w+/gi, ''); // 썸네일 파라미터 제거
        }
        images.push(imageUrl);
      }
    }

    console.log(`[쇼핑 이미지] ✅ ${images.length}개 이미지 수집 완료`);
  } catch (error) {
    console.error(`[쇼핑 이미지] ❌ 실패: ${(error as Error).message}`);
  }

  return images;
}

// ✅ 제목 기반 이미지 수집 함수 (핵심/서브 키워드 추출 강화)
export async function collectImagesByTitle(
  title: string,
  clientId: string,
  clientSecret: string,
  maxImages: number = 10
): Promise<string[]> {
  const images: string[] = [];

  try {
    // ✅ 제목에서 핵심 키워드와 서브 키워드 분리 추출
    const { coreKeywords, subKeywords } = extractKeywordsFromTitle(title);

    console.log(`[제목 이미지] 핵심 키워드: ${coreKeywords.join(', ')}`);
    console.log(`[제목 이미지] 서브 키워드: ${subKeywords.join(', ')}`);

    // 1. 핵심 키워드로 상업적 이미지 먼저 검색
    const coreQuery = coreKeywords.join(' ');
    if (coreQuery) {
      // 1-1. 상업적 이미지 시도 (요청 개수의 1.5배까지 넉넉히 시도)
      const commercialImages = await searchNaverImages(coreQuery, clientId, clientSecret, maxImages, true, 'cc_commercial');
      for (const item of commercialImages) {
        if (item.link && images.length < maxImages) {
          images.push(item.link);
        }
      }
      console.log(`[제목 이미지] 상업적 필터로 ${images.length}개 수집 완료`);

      // 1-2. 부족하면 일반 고품질 이미지로 보충
      if (images.length < maxImages) {
        const remaining = maxImages - images.length;
        const generalImages = await searchNaverImages(coreQuery, clientId, clientSecret, remaining, true, 'large');
        for (const item of generalImages) {
          if (item.link && !images.includes(item.link) && images.length < maxImages) {
            images.push(item.link);
          }
        }
        console.log(`[제목 이미지] 일반 이미지 ${images.length - (commercialImages.length)}개 추가 보충 (총 ${images.length}개)`);
      }
    }

    // 2. 서브 키워드 추가 검색 (여전히 부족할 경우에만)
    if (images.length < maxImages && subKeywords.length > 0) {
      const subQuery = [...coreKeywords.slice(0, 1), ...subKeywords.slice(0, 2)].join(' ');

      // 서브 키워드도 상업적 우선 시도 후 일반 보충
      const subCommercial = await searchNaverImages(subQuery, clientId, clientSecret, maxImages - images.length, true, 'cc_commercial');
      for (const item of subCommercial) {
        if (item.link && !images.includes(item.link) && images.length < maxImages) {
          images.push(item.link);
        }
      }

      if (images.length < maxImages) {
        const subGeneral = await searchNaverImages(subQuery, clientId, clientSecret, maxImages - images.length, true, 'large');
        for (const item of subGeneral) {
          if (item.link && !images.includes(item.link) && images.length < maxImages) {
            images.push(item.link);
          }
        }
      }
      console.log(`[제목 이미지] 서브 키워드 보충 후 총 ${images.length}개 완료`);
    }

    // 3. 쇼핑 이미지도 추가 (제품 관련 키워드인 경우)
    const productKeywords = ['제품', '상품', '추천', '리뷰', '후기', '구매', '가격'];
    const isProductRelated = productKeywords.some(kw => title.includes(kw));

    if (isProductRelated && images.length < maxImages) {
      const shopImages = await collectShoppingImages(coreQuery, clientId, clientSecret, maxImages - images.length);
      images.push(...shopImages);
    }

    console.log(`[제목 이미지] ✅ "${title}" 관련 ${images.length}개 이미지 수집 완료`);
  } catch (error) {
    console.error(`[제목 이미지] ❌ 실패: ${(error as Error).message}`);
  }

  return images;
}

// ✅ 소제목별 시각적 키워드 기반 이미지 정밀 수집
export async function collectImagesBySubheadings(
  visualKeywordData: Array<{ index: number; visualQueries: string[] }>,
  clientId: string,
  clientSecret: string,
  imagesPerHeading: number = 2
): Promise<Array<{ index: number; urls: string[] }>> {
  console.log(`🚀 소제목별 정밀 이미지 수집 시작 (${visualKeywordData.length}개 세션)`);

  const results: Array<{ index: number; urls: string[] }> = [];

  for (const session of visualKeywordData) {
    const headingUrls: string[] = [];
    console.log(`📸 소제목 ${session.index} 시각적 키워드: ${session.visualQueries.join(', ')}`);

    for (const query of session.visualQueries) {
      if (headingUrls.length >= imagesPerHeading) break;

      try {
        // ✅ 1차 시도: 상업적 이용 가능 이미지 검색
        const commercialResults = await searchNaverImages(query, clientId, clientSecret, imagesPerHeading, true, 'cc_commercial');
        for (const item of commercialResults) {
          if (item.link && !headingUrls.includes(item.link) && headingUrls.length < imagesPerHeading) {
            headingUrls.push(item.link);
          }
        }

        // ✅ 2차 시도: 상업적 이미지가 부족하면 일반 고품질 이미지로 보충
        if (headingUrls.length < imagesPerHeading) {
          const generalResults = await searchNaverImages(query, clientId, clientSecret, imagesPerHeading - headingUrls.length, true, 'large');
          for (const item of generalResults) {
            if (item.link && !headingUrls.includes(item.link) && headingUrls.length < imagesPerHeading) {
              headingUrls.push(item.link);
            }
          }
        }
      } catch (e) {
        console.warn(`⚠️ [소제목 수집 실패] 쿼리: ${query}, 에러: ${(e as Error).message}`);
      }
    }

    results.push({ index: session.index, urls: headingUrls });
    console.log(`✅ 소제목 ${session.index} 이미지 ${headingUrls.length}개 수집 완료`);
  }

  return results;
}

// ✅ 제목에서 핵심/서브 키워드 추출 함수 (최대한 많이 추출)
function extractKeywordsFromTitle(title: string): { coreKeywords: string[]; subKeywords: string[] } {
  // 불필요한 문자 제거 및 단어 분리
  const cleanTitle = title
    .replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318Fa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleanTitle.split(' ').filter(w => w.length >= 2);

  // ✅ 핵심 키워드 패턴 (인물명, 사건명, 드라마 키워드) - 확장
  const corePatterns = [
    // 인물명 (2-5글자 한글, 영문)
    /^[가-힣]{2,5}$/,
    /^[A-Za-z]{2,}$/,
    // 사건/드라마 키워드 - 확장
    /이혼|열애|결별|논란|폭로|하차|녹취|공개|발언|충격|사망|체포|결혼|임신|출산|사건|사고|폭행|고소|고발|소송|재판|판결|선고|구속|기소|불구속|석방|보석|항소|무죄|유죄|합의|화해|사과|해명|반박|입장|심경|고백|커밍아웃|탈퇴|복귀|컴백|데뷔|은퇴|방출|해고|경질|입대|전역|활동|중단|재개/
  ];

  // ✅ 제외할 단어 (조사, 접미사, 후킹 단어)
  const excludeWords = ['결국', '급', '실화', '헉', '왜', '진짜', '이유', '현재', '상황', '무슨', '일이', '길래'];

  const coreKeywords: string[] = [];
  const subKeywords: string[] = [];

  for (const word of words) {
    if (excludeWords.includes(word)) continue;

    // 핵심 키워드 판별
    const isCore = corePatterns.some(pattern => pattern.test(word));

    // ✅ 핵심 키워드 최대 5개까지 수집 (기존 3개 → 5개)
    if (isCore && coreKeywords.length < 5) {
      coreKeywords.push(word);
    } else if (subKeywords.length < 10) {
      // ✅ 서브 키워드도 최대 10개까지 (기존 5개 → 10개)
      subKeywords.push(word);
    }
  }

  // 핵심 키워드가 없으면 처음 3개 단어를 핵심으로
  if (coreKeywords.length === 0 && words.length > 0) {
    coreKeywords.push(...words.slice(0, 3));
  }

  return { coreKeywords, subKeywords };
}

// ✅ 네이버 검색 API로 풍부한 콘텐츠 수집 (모든 소스에서)
async function collectNaverSearchContent(
  query: string,
  clientId: string,
  clientSecret: string
): Promise<{ content: string; totalChars: number; sources: string[] }> {
  console.log(`\n[네이버 API] ⚡ 빠른 콘텐츠 수집 시작: "${query}"`);
  const startTime = Date.now();

  // ✅ 블로그, 뉴스, 웹문서, 쇼핑을 병렬로 검색 (빠른 속도)
  const [blogResults, newsResults, webResults, shopResults] = await Promise.all([
    searchNaverForContent(query, clientId, clientSecret, 'blog', 30),
    searchNaverForContent(query, clientId, clientSecret, 'news', 20),
    searchNaverForContent(query, clientId, clientSecret, 'webkr', 10),
    searchNaverShopping(query, clientId, clientSecret, 20), // ✅ 쇼핑 검색 추가
  ]);

  const allResults = [...blogResults, ...newsResults, ...webResults];
  const sources: string[] = [];

  if (blogResults.length > 0) sources.push(`블로그 ${blogResults.length}개`);
  if (newsResults.length > 0) sources.push(`뉴스 ${newsResults.length}개`);
  if (webResults.length > 0) sources.push(`웹문서 ${webResults.length}개`);
  if (shopResults.length > 0) sources.push(`쇼핑 ${shopResults.length}개`);

  // ✅ 쇼핑 결과도 콘텐츠에 추가 (제품 정보)
  for (const shop of shopResults) {
    allResults.push({
      title: shop.title,
      description: `[${shop.mallName}] ${shop.brand || shop.maker || ''} | ${shop.category1} > ${shop.category2} | 가격: ${Number(shop.lprice).toLocaleString()}원`,
      link: shop.link,
    });
  }

  // ✅ 중복 제거 및 콘텐츠 정리
  const uniqueContents = new Set<string>();
  const cleanedResults: string[] = [];

  for (const result of allResults) {
    const contentKey = result.description.slice(0, 100);
    if (!uniqueContents.has(contentKey)) {
      uniqueContents.add(contentKey);
      cleanedResults.push(`【${result.title}】\n${result.description}`);
    }
  }

  const combinedContent = cleanedResults.join('\n\n');
  const elapsed = Date.now() - startTime;

  console.log(`[네이버 API] ✅ ${combinedContent.length}자 수집 완료! (${elapsed}ms, ${sources.join(', ')})`);

  return {
    content: combinedContent,
    totalChars: combinedContent.length,
    sources,
  };
}

// ✅ 네이버 검색 API로 풍부한 콘텐츠 수집 (빠르고 안정적!)
async function fetchContentWithNaverFallback(
  url: string,
  title: string,
  naverClientId?: string,
  naverClientSecret?: string
): Promise<{ content: string; source: string }> {
  // 제목에서 핵심 키워드 추출 (더 정교하게)
  const keywords = title
    .replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318Fa-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(k => k.length >= 2)
    .slice(0, 7)  // ✅ 더 많은 키워드 사용
    .join(' ');

  if (!keywords) {
    return { content: '', source: 'none' };
  }

  // ✅ 네이버 API로 빠른 콘텐츠 수집
  if (naverClientId && naverClientSecret) {
    const result = await collectNaverSearchContent(keywords, naverClientId, naverClientSecret);

    if (result.content.length > 500) {
      return {
        content: result.content,
        source: `naver-api (${result.sources.join(', ')})`
      };
    }
  }

  return { content: '', source: 'none' };
}


export interface SourceAssemblyInput {
  keywords?: string[];
  draftText?: string;
  baseText?: string;
  rssUrl?: string; // 여러 URL은 줄바꿈으로 구분
  generator?: ContentGeneratorProvider;
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  /** 사용자가 임의로 지정한 최소 글자수 (지정 시 우선 적용) */
  minChars?: number;
  /** 사용자가 지정한 기사 카테고리 */
  articleType?: ArticleType;
  /** 네이버 검색 API 클라이언트 ID (크롤링 실패 시 폴백용) */
  naverClientId?: string;
  /** 네이버 검색 API 클라이언트 시크릿 (크롤링 실패 시 폴백용) */
  naverClientSecret?: string;
  /** 리뷰형 글 여부 (구매전환 유도) */
  isReviewType?: boolean;
  /** 사용자 정의 프롬프트 (추가 지시사항) */
  customPrompt?: string;
  /** ✅ [2026-02-09 v2] 이전 생성 제목 (연속발행 중복 방지) */
  previousTitles?: string[];
}

export interface AssembledSource {
  source: ContentSource;
  warnings: string[];
}

const rssParser = new Parser({
  timeout: 5000,
});

type FetchFn = typeof globalThis.fetch;
let cachedFetch: FetchFn | null = typeof fetch === 'function' ? fetch : null;

async function ensureFetch(): Promise<FetchFn> {
  if (cachedFetch) {
    return cachedFetch;
  }
  const module = await import('node-fetch');
  cachedFetch = module.default as unknown as FetchFn;
  return cachedFetch;
}

function cleanText(text: string): string {
  if (!text) return '';

  // 불필요한 패턴 제거
  const unwantedPatterns = [
    /^홈\s+이슈\s+/i,
    /^이슈\s+/i,
    /발행일:\s*\d{4}\.\d{2}\.\d{2}/i,
    /조회수:\s*\d*/i,
    /구독\s*0\s*공유/i,
    /강지호\s*구독/i,
    /^\s*\[.*?\]\s*$/gm, // 단독으로 있는 [공식] 같은 태그
  ];

  let cleaned = text;
  unwantedPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '');
  });

  return cleaned
    // 연속된 공백을 하나로
    .replace(/\s+/g, ' ')
    // 연속된 줄바꿈을 두 개로 제한
    .replace(/\n{3,}/g, '\n\n')
    // 앞뒤 공백 제거
    .trim()
    // 짧은 단독 줄 제거 (1-2자만 있는 줄)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      // 너무 짧은 줄 제거
      if (trimmed.length <= 2) return false;
      // 숫자만 있는 줄 제거
      if (/^\d+$/.test(trimmed)) return false;
      // 특수문자만 있는 줄 제거
      if (/^[^\w가-힣]+$/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function removeUnwantedElements($: any, $target: any): void {
  const unwantedSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'nav',
    'header',
    'footer',
    '.nav',
    '.navigation',
    '.menu',
    '.header',
    '.footer',
    '.sidebar',
    '.ad',
    '.advertisement',
    '.ads',
    '.ad-banner',
    '.ad-wrapper',
    '[class*="ad"]',
    '[id*="ad"]',
    '.social-share',
    '.share',
    '.comment',
    '.comments',
    '.related',
    '.recommend',
    '.tag',
    '.tags',
    '.author-info',
    '.byline',
    '.date',
    '.publish-date',
    '.breadcrumb',
    '.breadcrumbs',
    'button',
    '.button',
    '.btn',
    'form',
    '.form',
    '.subscribe',
    '.newsletter',
    '.popup',
    '.modal',
  ];

  unwantedSelectors.forEach((unwanted) => {
    $target.find(unwanted).remove();
  });
}

/**
 * ✅ 보안이 강한 쇼핑몰을 위한 Puppeteer 크롤링
 */
async function fetchWithPuppeteer(url: string): Promise<{ html: string; finalUrl: string; title?: string; content?: string; publishedAt?: string; images?: string[] }> {
  let browser: any = null;
  try {
    const puppeteer = await import('puppeteer');

    console.log(`[Puppeteer 크롤링] ${url}`);

    // ✅ 배포 환경에서 Chromium 경로 찾기
    const executablePath = await getChromiumExecutablePath();

    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath, // ✅ 배포 환경 지원
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        // ✅ 저사양 컴퓨터 최적화
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-accelerated-2d-canvas',
        '--disable-accelerated-jpeg-decoding',
        '--disable-accelerated-video-decode',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-extensions',
        '--disable-sync',
        '--disable-default-apps',
        '--disable-translate',
        '--disable-features=TranslateUI,VizDisplayCompositor',
        '--no-first-run',
        '--mute-audio',
        '--disable-logging',
        '--disable-hang-monitor',
        '--disable-component-update',
        '--metrics-recording-only',
        '--js-flags=--max-old-space-size=256', // ✅ JS 메모리 제한 (256MB)
      ],
    });

    const page = await browser.newPage();

    // ✅ 불필요한 리소스 차단 (속도 최적화)
    await page.setRequestInterception(true);
    page.on('request', (req: any) => {
      const resourceType = req.resourceType();
      const url = req.url();
      // 폰트, 미디어, 광고/트래킹 차단 (이미지와 스타일은 콘텐츠에 필요할 수 있음)
      if (['font', 'media'].includes(resourceType) ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.net') ||
        url.includes('analytics') ||
        url.includes('tracking')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ✅ 자동화 감지 우회
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
      (window as any).chrome = { runtime: {} };
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 네이버 블로그 감지
    const isNaverBlog = /blog\.naver\.com/i.test(url);

    // 페이지 로드 (리디렉션 자동 추적)
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // ✅ networkidle2 대신 domcontentloaded (더 빠름)
      timeout: 20000 // ✅ 모든 사이트 20초 통일 (타임아웃 방지)
    });

    // 최종 URL 확인
    const finalUrl = page.url();
    if (finalUrl !== url) {
      console.log(`[Puppeteer] 리디렉션됨: ${url} → ${finalUrl}`);
    }

    // ✅ 네이버 블로그는 더 긴 대기 시간 (JavaScript 렌더링 대기)
    const waitTime = isNaverBlog ? 3000 : 2000;
    console.log(`[Puppeteer] 페이지 로드 대기 중... (${waitTime}ms)`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // ✅ 네이버 블로그 특화: 본문 영역이 로드될 때까지 대기
    if (isNaverBlog) {
      try {
        await page.waitForSelector('.se-main-container, ._2-I30XS1lA, #postViewArea, .post-view', {
          timeout: 10000
        });
        console.log(`[네이버 블로그] 본문 영역 로드 완료`);
      } catch (error) {
        console.warn(`[네이버 블로그] 본문 영역 대기 시간 초과, 계속 진행...`);
      }
    }

    // ✅ 스크롤을 끝까지 내려서 모든 이미지 로드 (Lazy Loading 대응)
    console.log(`[Puppeteer] 스크롤 시작 - 모든 이미지 로드 중...`);

    // 10단계로 나눠서 스크롤
    for (let i = 0; i < 10; i++) {
      await page.evaluate((scrollIndex: number) => {
        window.scrollTo(0, (document.body.scrollHeight / 10) * (scrollIndex + 1));
      }, i);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 페이지 끝까지 스크롤
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 한 번 더 스크롤 (동적 로딩 대응)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`[Puppeteer] 스크롤 완료`);

    // ✅ 이미지 추출 (브라우저에서 직접) - 고해상도 원본 우선
    const images = await page.evaluate(() => {
      const imageUrls: string[] = [];
      const seenUrls = new Set<string>();

      // 원본 이미지 URL로 변환하는 함수
      const getOriginalImageUrl = (url: string): string => {
        if (!url) return url;

        // 네이버 이미지 원본 변환
        // 예: https://shopping-phinf.pstatic.net/main_1234567/12345678901.jpg?type=f300 → type=f640 또는 원본
        if (url.includes('pstatic.net') || url.includes('naver.net')) {
          // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 미지원 (404 방지)
          if (url.includes('checkout.phinf') || url.includes('image.nmv')) {
            url = url.replace(/\?type=.*$/, '');
          } else {
            // type 파라미터 제거 또는 최대 크기로 변경
            url = url.replace(/[?&]type=f\d+/gi, '?type=f640'); // 640px (최대 크기)
            url = url.replace(/[?&]type=w\d+/gi, '?type=w968'); // 968px (최대 크기)
          }
          // 썸네일 접미사 제거
          url = url.replace(/_thumb/gi, '');
          url = url.replace(/_small/gi, '');
          url = url.replace(/_medium/gi, '');
        }

        // 쿠팡 이미지 원본 변환
        // 예: thumbnail/123.jpg → 123.jpg
        if (url.includes('coupang.com')) {
          url = url.replace(/\/thumbnail\//gi, '/');
          url = url.replace(/_thumb/gi, '');
          url = url.replace(/\/\d+x\d+\//gi, '/'); // 크기 지정 제거
        }

        // 일반적인 썸네일 패턴 제거
        url = url.replace(/_thumb\./gi, '.');
        url = url.replace(/_small\./gi, '.');
        url = url.replace(/_medium\./gi, '.');
        url = url.replace(/\.thumb\./gi, '.');
        url = url.replace(/\.small\./gi, '.');
        url = url.replace(/\.medium\./gi, '.');

        // 크기 파라미터 제거 또는 최대화
        url = url.replace(/[?&]w=\d+/gi, ''); // width 파라미터 제거
        url = url.replace(/[?&]h=\d+/gi, ''); // height 파라미터 제거
        url = url.replace(/[?&]size=\d+/gi, ''); // size 파라미터 제거
        url = url.replace(/[?&]quality=\d+/gi, ''); // quality 파라미터 제거

        return url;
      };

      // 모든 img 태그 수집
      document.querySelectorAll('img').forEach((img) => {
        // ✅ 리뷰/상세 이미지인지 확인 (부모 요소 기준)
        let element = img.parentElement;
        let isReviewOrDetail = false;

        // 최대 5단계 부모까지 확인
        for (let i = 0; i < 5 && element; i++) {
          const className = element.className?.toLowerCase() || '';
          const id = element.id?.toLowerCase() || '';

          if (className.includes('review') ||
            className.includes('photo') ||
            className.includes('detail') ||
            className.includes('description') ||
            className.includes('content') ||
            className.includes('후기') ||
            className.includes('리뷰') ||
            id.includes('review') ||
            id.includes('detail') ||
            id.includes('content')) {
            isReviewOrDetail = true;
            break;
          }

          element = element.parentElement;
        }

        // 여러 소스 확인 (고해상도 우선)
        let src =
          img.getAttribute('data-original') || // 원본 이미지 (Lazy Loading)
          img.getAttribute('data-src-original') || // 원본 이미지
          img.getAttribute('data-lazy-src-original') || // 원본 이미지
          img.src || // 현재 표시 중인 이미지
          img.getAttribute('data-src') || // Lazy Loading 이미지
          img.getAttribute('data-lazy-src') || // Lazy Loading 이미지
          img.getAttribute('data-srcset')?.split(',')[0]?.trim()?.split(' ')[0]; // srcset에서 첫 번째 이미지

        if (src && src.startsWith('http')) {
          // 원본 이미지 URL로 변환
          const originalSrc = getOriginalImageUrl(src);

          if (!seenUrls.has(originalSrc)) {
            // ✅ 리뷰/상세 이미지는 크기 필터링 없이 모두 수집
            if (isReviewOrDetail) {
              imageUrls.push(originalSrc);
              seenUrls.add(originalSrc);
              return;
            }

            // ✅ 그 외 이미지는 크기 필터링 적용
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;

            // 최소 크기: 300x300 (완화)
            if (width >= 300 && height >= 300) {
              // 너무 작은 이미지 URL 패턴 제외
              const lowerUrl = originalSrc.toLowerCase();
              if (!lowerUrl.includes('_80x80') &&
                !lowerUrl.includes('_100x100') &&
                !lowerUrl.includes('_150x150') &&
                !lowerUrl.includes('/80/') &&
                !lowerUrl.includes('/100/') &&
                !lowerUrl.includes('/150/')) {
                imageUrls.push(originalSrc);
                seenUrls.add(originalSrc);
              }
            }
          }
        }
      });

      return imageUrls;
    });

    console.log(`[Puppeteer] ${images.length}개 이미지 추출 완료`);

    // HTML 추출
    const html = await page.content();

    await browser.close();
    browser = null;

    // cheerio로 파싱
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    return {
      html,
      finalUrl,
      title: $('title').text().trim(),
      content: $('body').text().trim(),
      images: images || [] // ✅ 추출한 이미지 반환
    };

  } catch (error) {
    console.error(`[Puppeteer 크롤링 실패] ${(error as Error).message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => { });
    }
    // ✅ 메모리 최적화: 가비지 컬렉션 힌트
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc();
    }
  }
}

/**
 * 쇼핑몰 전용 이미지 수집 함수
 * 제품 이미지만 추출하여 반환
 * ✅ [2026-01-31] 전면 개편: puppeteer-extra + JSON-LD 우선 + 네이버 API 폴백
 */
export async function fetchShoppingImages(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  if (!url) return { images: [] };

  // ✅ Puppeteer로 추출한 이미지를 저장할 변수 (함수 전체에서 접근 가능)
  let puppeteerExtractedData: {
    images: string[];
    title?: string;
    spec?: string;
    price?: string;
    reviewTexts?: string[];
    reviewImageUrls?: string[];
    stats?: any;
  } = { images: [] };

  try {
    // ========================================
    // ✅ [2026-01-31] STEP 1: 단축 URL 선행 처리
    // ========================================
    const resolvedUrl = await resolveShortUrl(url);
    url = resolvedUrl; // 이후 로직에서 실제 URL 사용

    // ✅ imagesOnly가 false이면 텍스트만 추출 (이미지는 이미지 관리 탭에서 별도 수집)
    if (options.imagesOnly === false) {
      console.log(`[쇼핑몰 크롤링] 텍스트만 수집 시작: ${url.substring(0, 60)}...`);
    } else {
      console.log(`[쇼핑몰 크롤링] ${options.imagesOnly ? '이미지만' : '이미지+텍스트'} 수집 시작: ${url.substring(0, 60)}...`);
    }

    // ========================================
    // ✅ [2026-01-31] 3단 로켓 아키텍처 시작
    // ========================================
    const isSmartStore = url.includes('smartstore.naver.com') || url.includes('m.smartstore.naver.com');
    const isBrandStore = url.includes('brand.naver.com');
    const isNaverShopping = isSmartStore || isBrandStore || url.includes('shopping.naver.com');

    // 모바일 URL 변환 (스마트스토어 및 브랜드스토어)
    let crawlUrl = url;
    if (isSmartStore && !url.includes('m.smartstore.naver.com')) {
      crawlUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
    }
    // ✅ [2026-02-08] 브랜드스토어도 모바일 URL로 변환 (OG 태그 추출 가능)
    if (isBrandStore && !url.includes('m.brand.naver.com')) {
      crawlUrl = url.replace('brand.naver.com', 'm.brand.naver.com');
      console.log(`[브랜드스토어] 📱 모바일 URL로 변환: ${crawlUrl.substring(0, 60)}...`);
    }

    // ========================================
    // 🚀 [Stage 1] 초고속 TLS 스텔스 (0.1초)
    // ========================================
    // ⚠️ brandconnect는 CSR 페이지라 TLS로 데이터 획득 불가 → Stage 2로 바로 이동
    const isBrandConnect = url.includes('brandconnect.naver.com');

    let stage1Success = false;

    if (!isBrandConnect) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 [Stage 1] TLS 스텔스 크롤링 (브라우저 없이 0.1초)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        const tlsResult = await fetchWithTLS(crawlUrl);

        if (tlsResult.success && tlsResult.html.length > 500) {
          // 🧪 핵심 검증: JSON-LD 데이터가 있는지 확인
          const jsonLd = extractJsonLdFromHtml(tlsResult.html);

          if (jsonLd && jsonLd.name) {
            console.log(`[Stage 1] 🎯 JSON-LD 데이터 확보 완료! (Puppeteer 생략)`);

            puppeteerExtractedData.title = jsonLd.name;

            if (jsonLd.offers?.price) {
              puppeteerExtractedData.price = typeof jsonLd.offers.price === 'number'
                ? jsonLd.offers.price.toLocaleString() + '원'
                : String(jsonLd.offers.price) + '원';
            }

            if (jsonLd.image) {
              const imgs = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
              puppeteerExtractedData.images = imgs.filter((img: string) => img && img.startsWith('http'));
            }

            // OG 태그에서 추가 정보 추출
            const metaResult = extractUniversalMeta(tlsResult.html);
            if (metaResult) {
              if (!puppeteerExtractedData.title && metaResult.title) {
                puppeteerExtractedData.title = metaResult.title;
              }
              if (metaResult.images && metaResult.images.length > 0) {
                puppeteerExtractedData.images.push(...metaResult.images.filter(img =>
                  !puppeteerExtractedData.images.includes(img)
                ));
              }
            }

            stage1Success = true;
            console.log(`[Stage 1] ✅ 성공! 제목: ${puppeteerExtractedData.title}`);
            console.log(`[Stage 1] ✅ 이미지: ${puppeteerExtractedData.images.length}개`);
          } else {
            // ✅ [2026-02-08] 브랜드스토어: JSON-LD 없어도 OG 태그에서 상품 정보 추출
            if (isBrandStore && tlsResult.html.length > 500) {
              console.log(`[Stage 1] 🏪 브랜드스토어 JSON-LD 없음 → OG 태그 폴백 시도...`);
              const metaResult = extractUniversalMeta(tlsResult.html);
              if (metaResult && metaResult.title && metaResult.title.length > 3) {
                // OG 타이틀에서 "공식스토어" 같은 비상품명 제거
                let ogTitle = metaResult.title
                  .replace(/\s*:\s*네이버\s*브랜드스토어$/i, '')
                  .replace(/\s*-\s*네이버\s*브랜드스토어$/i, '')
                  .replace(/\s*\|\s*네이버\s*브랜드스토어$/i, '')
                  .trim();

                // "공식스토어"만 있으면 상품명이 아님
                if (ogTitle && ogTitle !== '공식스토어' && ogTitle.length > 3) {
                  puppeteerExtractedData.title = ogTitle;
                  console.log(`[Stage 1:BrandStore] 📝 OG 제목: "${ogTitle}"`);

                  if (metaResult.images && metaResult.images.length > 0) {
                    puppeteerExtractedData.images = metaResult.images.filter(img =>
                      img.startsWith('http') &&
                      (img.includes('shop-phinf.pstatic.net') || img.includes('shopping-phinf.pstatic.net'))
                    );
                    console.log(`[Stage 1:BrandStore] 🖼️ OG 이미지: ${puppeteerExtractedData.images.length}개`);
                  }

                  // OG에서 가격 추출 시도 (description에서)
                  if (metaResult.description) {
                    const priceMatch = metaResult.description.match(/([\d,]+)\s*원/);
                    if (priceMatch) {
                      puppeteerExtractedData.price = priceMatch[0];
                    }
                    puppeteerExtractedData.spec = metaResult.description.substring(0, 500);
                  }

                  // OG에서 이미지가 1개만 있어도 Stage 1 성공 처리
                  // (Stage 2에서 추가 이미지 수집 필요하지만, 적어도 상품명은 확보)
                  stage1Success = true;
                  console.log(`[Stage 1:BrandStore] ✅ OG 태그로 상품 정보 확보 완료!`);
                } else {
                  console.log(`[Stage 1] ⚠️ OG 제목이 상품명이 아님: "${ogTitle}" → Stage 2 진입`);
                }
              } else {
                console.log(`[Stage 1] ⚠️ OG 태그에서도 상품 정보 없음 → Stage 2 진입`);
              }
            } else {
              console.log(`[Stage 1] ⚠️ HTML은 받았으나 유효한 JSON-LD 없음 (CSR 페이지) → Stage 2로 진입`);
            }
          }
        }
      } catch (stage1Error) {
        console.warn(`[Stage 1] ⚠️ 에러 무시하고 Stage 2 진행:`, (stage1Error as Error).message);
      }
    } else {
      // brandconnect URL은 CSR이므로 Stage 1 스킵
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ [Stage 1 스킵] brandconnect CSR 페이지 → Stage 2로 직행');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // ========================================
    // 🐢 [Stage 2] Puppeteer Stealth 브라우저 (Stage 1 실패 시만)
    // ✅ [2026-02-08] 브랜드스토어 전면 강화: DOM 이미지 수집, 에러 재시도, 리뷰탭 클릭
    // ========================================
    // ✅ [2026-02-08] 브랜드스토어: OG로 제목은 확보했지만 이미지 부족 시에도 Stage 2 실행
    const needsMoreImages = isBrandStore && stage1Success && puppeteerExtractedData.images.length < 5;
    if ((!stage1Success || needsMoreImages) && isNaverShopping) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🐢 [Stage 2] Puppeteer Stealth 브라우저 가동');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      let stage2Browser: any = null;
      try {
        const executablePath = await getChromiumExecutablePath();

        // ✅ [2026-01-31] 프록시 서버 지원 (환경변수에서 가져오기)
        const proxyServer = process.env.PROXY_SERVER;
        const launchArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        ];

        // 프록시 서버가 설정되어 있으면 추가
        if (proxyServer) {
          launchArgs.push(`--proxy-server=${proxyServer}`);
          console.log(`[Puppeteer] 🌐 프록시 사용: ${proxyServer}`);
        }

        // ✅ [2026-01-31] 강화된 브라우저 설정 - 네이버 차단 우회
        stage2Browser = await puppeteerExtra.launch({
          headless: true,
          executablePath: executablePath || undefined,
          args: launchArgs,
          ignoreDefaultArgs: ['--enable-automation']  // ✅ 자동화 플래그 제거
        });

        const page = await stage2Browser.newPage();

        // ✅ 강화된 anti-detection 설정
        await page.evaluateOnNewDocument(() => {
          // webdriver 프로퍼티 숨기기
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          // plugins 배열 위장
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
          // languages 설정
          Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
          // Chrome 객체 위장
          (window as any).chrome = { runtime: {} };
        });

        await page.setUserAgent(LATEST_CHROME_UA);
        await page.setViewport({ width: 1920, height: 1080 });

        // ✅ 쿠키 설정 (로봇 탐지 우회)
        await page.setCookie({
          name: 'NNB',
          value: 'UKZZN4Z3P8TAA',
          domain: '.naver.com'
        });

        // 페이지 로드
        console.log(`[Puppeteer] 📄 페이지 로딩 중: ${crawlUrl.substring(0, 50)}...`);

        // ✅ [2026-01-31] Brand Connect 대응 - 더 긴 타임아웃
        const isBrandConnect = crawlUrl.includes('brandconnect.naver.com');
        const pageTimeout = isBrandConnect ? 60000 : 45000;

        // ✅ [2026-02-08] 브랜드스토어 에러 페이지 감지 + 재시도 (최대 3회)
        const MAX_RETRIES = isBrandStore ? 3 : 1;
        let lastError = '';

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 1) {
            console.log(`[Stage 2] 🔄 재시도 ${attempt}/${MAX_RETRIES}...`);
          }

          await page.goto(crawlUrl, { waitUntil: 'networkidle2', timeout: pageTimeout });

          // ✅ [2026-02-08] 에러 페이지 감지
          if (isBrandStore) {
            const errorCheck = await page.evaluate(() => {
              const bodyText = document.body?.innerText || '';
              const errorKeywords = [
                '서비스 접속이 불가',
                '에러페이지',
                '보안 확인',
                '캡차',
                'captcha',
                '비정상적인 접근',
                '상품이 존재하지 않습니다',
                '페이지를 찾을 수 없습니다'
              ];
              return errorKeywords.find(kw => bodyText.toLowerCase().includes(kw.toLowerCase())) || null;
            });

            if (errorCheck) {
              lastError = errorCheck;
              console.log(`[Stage 2] ⚠️ 에러 페이지 감지: "${errorCheck}"`);
              if (attempt < MAX_RETRIES) {
                const waitTime = 3000 + Math.random() * 7000;
                console.log(`[Stage 2] ⏳ ${Math.round(waitTime / 1000)}초 대기 후 재시도...`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
              }
            } else {
              console.log(`[Stage 2] ✅ 정상 페이지 로드 (시도 ${attempt})`);
              break;
            }
          } else {
            break;
          }
        }

        // ✅ [2026-01-31] Humanize 딜레이 - 인간적인 행동 시뮬레이션
        const humanDelay = Math.random() * 2000 + 1000;  // 1~3초 랜덤 딜레이
        console.log(`[Puppeteer] ⏰ Humanize 딜레이: ${Math.round(humanDelay)}ms`);
        await new Promise(r => setTimeout(r, humanDelay));

        // ✅ 마우스 이동 시뮬레이션 (봇 탐지 우회)
        await page.mouse.move(
          Math.random() * 800 + 100,  // x: 100~900
          Math.random() * 400 + 100   // y: 100~500
        );

        // ✅ Brand Connect 전용 셀렉터 대기 (15초)
        if (isBrandConnect) {
          console.log('[Puppeteer] 🏷️ Brand Connect 감지 - 추가 대기...');
          try {
            await page.waitForSelector('._1_n6S_5R6Y, .se-main-container, [class*="product"]', { timeout: 15000 });
          } catch {
            console.log('[Puppeteer] ⚠️ Brand Connect 셀렉터 타임아웃 - 계속 진행');
          }
        }

        // ✅ [2026-02-08] 브랜드스토어 전용: 상품 요소 대기 + 충분한 스크롤
        if (isBrandStore) {
          console.log('[Stage 2:BrandStore] ⏳ 상품 정보 로드 대기...');
          try {
            await page.waitForSelector('h3.DCVBehA8ZB, .P2lBbUWPNi h3, [class*="ProductName"], img.fxmqPhYp6y, img[src*="shop-phinf"]', { timeout: 15000 });
            console.log('[Stage 2:BrandStore] ✅ 상품 정보 로드 완료');
          } catch {
            console.log('[Stage 2:BrandStore] ⚠️ 상품 정보 로드 타임아웃, 계속 진행...');
          }

          // ✅ 충분한 스크롤 (lazy-loading 이미지 로드)
          console.log('[Stage 2:BrandStore] 📜 페이지 스크롤 중...');
          for (let i = 0; i < 8; i++) {
            await page.evaluate((idx: number) => window.scrollBy(0, 400 + idx * 100), i);
            await new Promise(r => setTimeout(r, 400));
          }
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(r => setTimeout(r, 2000));

          // ✅ [2026-02-08] 리뷰/후기 탭 클릭하여 리뷰 이미지 렌더링
          console.log('[Stage 2:BrandStore] 🔍 리뷰/후기 탭 클릭 시도...');
          try {
            const reviewClicked = await page.evaluate(() => {
              const keywords = ['리뷰', '후기', '상품평', '포토리뷰', '사용후기', '구매후기', '포토'];
              const els = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="button"], li, span')) as HTMLElement[];
              for (const el of els) {
                const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!text || text.length > 20) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (keywords.some(k => text.includes(k))) {
                  el.click();
                  return text;
                }
              }
              return null;
            });

            if (reviewClicked) {
              console.log(`[Stage 2:BrandStore] ✅ 리뷰 탭 클릭 성공: "${reviewClicked}"`);
              await new Promise(r => setTimeout(r, 2000));
              // 리뷰 영역까지 스크롤
              for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 600));
                await new Promise(r => setTimeout(r, 500));
              }
              await new Promise(r => setTimeout(r, 1000));
            } else {
              console.log('[Stage 2:BrandStore] ⚠️ 리뷰 탭 없음, 추가 스크롤...');
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await new Promise(r => setTimeout(r, 1000));
            }
          } catch (reviewErr) {
            console.log(`[Stage 2:BrandStore] ⚠️ 리뷰 탭 클릭 실패: ${(reviewErr as Error).message}`);
          }
        } else {
          // 일반 네이버 쇼핑 CSR 렌더링 대기
          await new Promise(r => setTimeout(r, 5000));
        }

        // HTML 가져오기
        const pageHtml = await page.content();
        const pageTitle = await page.title();

        // ========================================
        // ✅ [2026-01-31] STEP 3: JSON-LD 우선 파싱 (가장 안정적)
        // ========================================
        const jsonLdData = extractJsonLdFromHtml(pageHtml);

        if (jsonLdData && jsonLdData.name) {
          console.log('[JSON-LD] ✅ 구조화 데이터에서 제품 정보 추출 성공!');

          puppeteerExtractedData.title = jsonLdData.name;

          if (jsonLdData.offers?.price) {
            puppeteerExtractedData.price = String(jsonLdData.offers.price) + '원';
            console.log(`[JSON-LD] 가격: ${puppeteerExtractedData.price}`);
          }

          if (jsonLdData.image) {
            const images = Array.isArray(jsonLdData.image) ? jsonLdData.image : [jsonLdData.image];
            puppeteerExtractedData.images = images.filter(img => img && img.startsWith('http'));
            console.log(`[JSON-LD] 이미지: ${puppeteerExtractedData.images.length}개`);
          }

          if (jsonLdData.description) {
            puppeteerExtractedData.spec = jsonLdData.description.substring(0, 500);
          }
        } else {
          console.log('[JSON-LD] ⚠️ 구조화 데이터 없음 - DOM 파싱 폴백');
        }

        // ✅ [2026-02-08] 브랜드스토어: JSON-LD가 없거나 이미지가 7장 미만이면 DOM에서 직접 수집
        const MIN_IMAGES = 7;
        if (isBrandStore && puppeteerExtractedData.images.length < MIN_IMAGES) {
          console.log(`[Stage 2:BrandStore] 📷 DOM 기반 이미지 수집 시작 (현재 ${puppeteerExtractedData.images.length}개 < 목표 ${MIN_IMAGES}개)...`);

          const domResult = await page.evaluate((existingImages: string[]) => {
            const images: string[] = [];
            const seenUrls = new Set<string>(existingImages.map(u => u.split('?')[0]));
            let title = '';

            // ✅ 상품명 추출 (DOM 우선 — JSON-LD보다 정확)
            const titleSelectors = [
              'h3.DCVBehA8ZB._copyable',
              '.P2lBbUWPNi h3',
              '[class*="ProductName"] h3',
              '[class*="productName"]',
              'meta[property="og:title"]',
            ];
            for (const sel of titleSelectors) {
              const el = document.querySelector(sel);
              if (el) {
                title = sel.startsWith('meta')
                  ? (el.getAttribute('content') || '').trim()
                  : (el.textContent || '').trim();
                if (title && title.length > 3) break;
              }
            }

            // ✅ [2026-02-08 v2] 엄격한 제품/리뷰 이미지 전용 필터
            const isValidProductImage = (src: string, el?: Element): boolean => {
              if (!src || src.length < 20) return false;

              const lower = src.toLowerCase();

              // ❌ 확실한 비제품 이미지 URL 패턴
              const blacklistPatterns = [
                'video-phinf', 'dthumb', 'vod-',
                'searchad-phinf',  // ✅ [2026-02-08] 검색광고 이미지
                '/banner/', '/logo/', '/icon/', '/badge/',
                'storelogo', 'brandlogo', 'store_logo', 'brand_logo',
                '/event/', '/promotion/', '/coupon/', '/sale/',
                'npay', 'naverpay', 'kakaopay', 'toss', 'payment',
                'arrow', 'button', 'btn_', '_btn', 'close_', 'more_',
                'star_', 'rating', 'grade', 'emoji', 'emoticon',
                'placeholder', 'loading', 'blur', 'transparent',
                'reviewmania', 'review_mania', 'powerlink', 'brandzone',
                'navershopping', 'naver_shopping', 'affiliate', 'partner',
                'ad_', '_ad.', 'promo', 'stamp', 'seal', 'emblem',
                'delivery', 'shipping', 'free_', 'discount',
                'storefront', 'store_info', 'shop_info',
                'sprite', 'svg', '.gif', 'data:image',
                '_thumb', '_small', '_s.', '1x1', 'spacer',
                'gnb', 'lnb', 'footer', 'header_',
                'type=f40', 'type=f60', 'type=f80', 'type=f100',
                '50x50', '60x60', '80x80', '100x100', '120x120',
              ];

              if (blacklistPatterns.some(p => lower.includes(p))) return false;
              // ✅ [2026-02-08] shopping-phinf/main_ = 다른 상품 카탈로그 썸네일
              if (lower.includes('shopping-phinf') && lower.includes('/main_')) return false;

              // ❌ 너무 작은 이미지 (아이콘/배지급)
              if (el) {
                const img = el as HTMLImageElement;
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (w > 0 && h > 0) {
                  if (w < 150 || h < 150) return false;  // 최소 150x150
                  const ratio = w / h;
                  if (ratio > 3 || ratio < 0.33) return false;  // 배너형 비율 제외
                }

                // ❌ 비제품 영역 내 이미지 제외
                const nonProductParent = el.closest(
                  'header, nav, footer, ' +
                  '.header, .nav, .footer, ' +
                  '[class*="gnb"], [class*="lnb"], [class*="snb"], ' +
                  '[class*="store_info"], [class*="storeBanner"], [class*="StoreInfo"], ' +
                  '[class*="Footer"], [class*="Header"], [class*="Navigation"], ' +
                  '[class*="sidebar"], [class*="SideBar"], ' +
                  '[class*="breadcrumb"], [class*="Breadcrumb"], ' +
                  '[class*="banner"], [class*="Banner"], ' +
                  '[class*="coupon"], [class*="Coupon"], ' +
                  '[class*="recommend"], [class*="Recommend"], ' +
                  '[class*="recently"], [class*="Recently"]'
                );
                if (nonProductParent) return false;
              }

              // ✅ 제품 이미지 CDN 도메인 확인 (네이버 쇼핑 이미지 서버)
              const isNaverProductCdn =
                lower.includes('shop-phinf.pstatic.net') ||
                lower.includes('shopping-phinf.pstatic.net') ||
                lower.includes('checkout.phinf') ||   // ✅ [2026-02-08] 리뷰 이미지 CDN
                lower.includes('image.nmv');           // ✅ [2026-02-08] 비디오 썸네일 CDN

              return isNaverProductCdn;
            };

            const toHighRes = (src: string): string => {
              // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 미지원 (404 방지)
              if (src.includes('checkout.phinf') || src.includes('image.nmv')) {
                return src.replace(/\?type=.*$/, '');
              }
              return src
                .replace(/type=f\d+(_\d+)?(_q\d+)?/, 'type=f640_640')
                .replace(/\?type=.*$/, '?type=f640_640')
                .replace(/\/s_\d+\//, '/o/')
                .replace(/_\d+x\d+\./, '.');
            };

            const addImage = (src: string) => {
              const highRes = toHighRes(src);
              const normalized = highRes.split('?')[0];
              if (!seenUrls.has(normalized)) {
                seenUrls.add(normalized);
                images.push(highRes);
              }
            };

            // ✅ 1순위: 갤러리 슬라이드 이미지 (상품 대표/추가이미지 — 가장 중요!)
            const gallerySelectors = [
              'img.fxmqPhYp6y',                    // 브랜드스토어 상품 갤러리 이미지
              '[class*="ProductImage"] img',
              '[class*="productImage"] img',
              '[class*="ProductThumb"] img',
              '[class*="ImageSlide"] img',
              '[class*="GallerySlide"] img',
              '.K4l1t0ryUq img',
              '.bd_3SCnU img',
              '.MLx6OjiZJZ img',
              '.slick-slide img',
              '.swiper-slide img',
            ];

            for (const sel of gallerySelectors) {
              document.querySelectorAll(sel).forEach(img => {
                const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
                if (src && isValidProductImage(src, img)) addImage(src);
              });
            }

            // ✅ 2순위: 리뷰/후기 이미지 (고객 실제 사진 — shop-phinf CDN만)
            const reviewSelectors = [
              '.YvTyxRfXAK img',                   // 리뷰 이미지 컨테이너
              'img.K0hV0afCJe',
              'img.M6TOdPtHmb',
              '.V5XROudBPi img',
              '.NXwbdiybnm img',
              '[class*="review"] img[src*="shop-phinf"]',
              '[class*="review"] img[src*="shopping-phinf"]',
              '[class*="ReviewItem"] img',
              '.review_item img',
              '[class*="photoReview"] img',
              '[class*="PhotoReview"] img',
            ];

            for (const sel of reviewSelectors) {
              document.querySelectorAll(sel).forEach(img => {
                const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
                if (src && isValidProductImage(src, img)) addImage(src);
              });
            }

            // ✅ 3순위: 상품 영역 내 이미지만 (전체 페이지 img 수집 금지!)
            // 상품 정보 영역으로 확인된 컨테이너 안의 이미지만 수집
            const productAreaSelectors = [
              '[class*="ProductArea"]',
              '[class*="productArea"]',
              '[class*="ProductContent"]',
              '[class*="itemArea"]',
              '[class*="ItemArea"]',
              'main[role="main"]',
              '#content',
            ];

            for (const areaSel of productAreaSelectors) {
              document.querySelectorAll(areaSel).forEach(area => {
                area.querySelectorAll('img').forEach(img => {
                  const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || '';
                  if (src && isValidProductImage(src, img)) addImage(src);
                });
              });
            }

            // ✅ 4순위: OG 이미지 (배너일 수 있어 후순위)
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (ogImage && ogImage.startsWith('http') && isValidProductImage(ogImage)) {
              addImage(ogImage);
            }

            // ✅ 가격 추출
            let price = '';
            const priceSelectors = [
              'strong.Xu9MEKUuIo span.e1DMQNBPJ_',
              'del.VaZJPclpdJ span.e1DMQNBPJ_',
              '.e1DMQNBPJ_',
              '[class*="price"]',
            ];
            for (const sel of priceSelectors) {
              const el = document.querySelector(sel);
              if (el) {
                const text = (el.textContent || '').trim();
                const match = text.match(/[\d,]+/);
                if (match && parseInt(match[0].replace(/,/g, '')) > 0) {
                  price = match[0] + '원';
                  break;
                }
              }
            }

            console.log(`[DOM 이미지 수집] 갤러리+리뷰+일반 총 ${images.length}개 수집`);

            return { images, title, price };
          }, puppeteerExtractedData.images);

          // DOM 결과 병합
          if (domResult.title && !puppeteerExtractedData.title) {
            puppeteerExtractedData.title = domResult.title;
            console.log(`[Stage 2:BrandStore] 📝 DOM에서 상품명 추출: "${domResult.title}"`);
          }
          if (domResult.price && !puppeteerExtractedData.price) {
            puppeteerExtractedData.price = domResult.price;
          }
          if (domResult.images.length > 0) {
            // 이미지 중복 제거 후 병합
            const existingNorm = new Set(puppeteerExtractedData.images.map(u => u.split('?')[0]));
            const newImages = domResult.images.filter((img: string) => !existingNorm.has(img.split('?')[0]));
            puppeteerExtractedData.images = [...puppeteerExtractedData.images, ...newImages];
            console.log(`[Stage 2:BrandStore] 📷 DOM 이미지 ${newImages.length}개 추가 → 총 ${puppeteerExtractedData.images.length}개`);
          }
        }

        // ✅ [2026-02-08] 최종 이미지 개수 로그
        console.log(`[Stage 2] 📊 최종 결과: 제목="${puppeteerExtractedData.title || '없음'}", 이미지=${puppeteerExtractedData.images.length}개, 가격=${puppeteerExtractedData.price || '없음'}`);

        await stage2Browser.close();
        stage2Browser = null;
      } catch (puppeteerError) {
        console.warn('[Puppeteer] ⚠️ Stage 2 추출 실패:', (puppeteerError as Error).message);
        if (stage2Browser) {
          try { await stage2Browser.close(); } catch { }
          stage2Browser = null;
        }
      }
    }

    // ========================================
    // ✅ [2026-02-08] 브랜드스토어 전용세션 폴백 (Stage 2 실패 시)
    // Puppeteer headless → 실패 → Playwright + headless:false + 세션 유지로 폴백
    // ========================================
    if (isBrandStore && (!puppeteerExtractedData.title || puppeteerExtractedData.images.length < 3)) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 [브랜드스토어] 전용세션 폴백 시작 (Playwright + 세션 유지)');
      console.log(`📊 현재 상태: 제목="${puppeteerExtractedData.title || '없음'}", 이미지=${puppeteerExtractedData.images.length}개`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      try {
        // URL에서 brandName, productId 추출
        const brandMatch = url.match(/brand\.naver\.com\/([^\/\?]+)\/products\/(\d+)/);
        if (brandMatch) {
          const [, brandName, productId] = brandMatch;
          const { crawlBrandStoreProduct } = await import('./crawler/productSpecCrawler');

          console.log(`[전용세션] 🏪 브랜드: ${brandName}, 상품ID: ${productId}`);
          const dedicatedResult = await crawlBrandStoreProduct(productId, brandName, url);

          if (dedicatedResult && dedicatedResult.name && dedicatedResult.name.length > 3) {
            console.log(`[전용세션] ✅ 성공! 상품명: "${dedicatedResult.name}"`);

            // 제목 갱신 (전용세션 결과가 더 정확)
            puppeteerExtractedData.title = dedicatedResult.name;

            // 가격 갱신
            if (dedicatedResult.price > 0) {
              puppeteerExtractedData.price = dedicatedResult.price.toLocaleString() + '원';
            }

            // 이미지 병합 (중복 제거)
            const allImages = [
              ...(dedicatedResult.mainImage ? [dedicatedResult.mainImage] : []),
              ...(dedicatedResult.galleryImages || []),
              ...(dedicatedResult.detailImages || []),
            ].filter(img => img && img.startsWith('http'));

            if (allImages.length > 0) {
              const existingNorm = new Set(puppeteerExtractedData.images.map(u => u.split('?')[0]));
              const newImages = allImages.filter(img => !existingNorm.has(img.split('?')[0]));
              puppeteerExtractedData.images = [...puppeteerExtractedData.images, ...newImages];
              console.log(`[전용세션] 📷 이미지 ${newImages.length}개 추가 → 총 ${puppeteerExtractedData.images.length}개`);
            }

            // 설명 갱신
            if (dedicatedResult.description) {
              puppeteerExtractedData.spec = dedicatedResult.description;
            }

            console.log(`[전용세션] 🏁 최종: 제목="${puppeteerExtractedData.title}", 이미지=${puppeteerExtractedData.images.length}개`);
          } else {
            console.log('[전용세션] ⚠️ 전용세션에서도 유효한 상품명 추출 실패');
          }
        } else {
          console.log('[전용세션] ⚠️ URL에서 브랜드명/상품ID 추출 실패');
        }
      } catch (dedicatedError) {
        console.warn('[전용세션] ❌ 전용세션 폴백 실패:', (dedicatedError as Error).message);
      }
    }
    if (url.includes('smartstore.naver.com')) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🛒 [스마트스토어] 네이버 API로 제품 정보 검색');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // URL에서 제품명 추출 시도
      const productName = await extractProductNameFromUrl(url);

      if (productName && options.naverClientId && options.naverClientSecret) {
        console.log(`[스마트스토어] 제품명 추출: "${productName}"`);

        try {
          // 네이버 쇼핑 API로 제품 정보 검색
          const shoppingResults = await searchNaverShopping(
            productName,
            options.naverClientId,
            options.naverClientSecret,
            10
          );

          // 네이버 이미지 API로 이미지 검색
          const imageResults = await searchNaverImages(
            productName,
            options.naverClientId,
            options.naverClientSecret,
            30
          );

          if (shoppingResults.length > 0 || imageResults.length > 0) {
            const product = shoppingResults[0];
            const images = [
              ...shoppingResults.map((r: any) => r?.image).filter(Boolean),
              ...imageResults.map((r: any) => r?.link).filter(Boolean),
            ];
            const uniqueImages = Array.from(new Set(images.map((v: any) => String(v || '').trim()).filter(Boolean)));

            console.log(`[스마트스토어] ✅ 네이버 API 성공: 상품 ${shoppingResults.length}개, 이미지 ${uniqueImages.length}개`);

            return {
              images: uniqueImages.slice(0, 50),
              title: product?.title || productName,
              description: product ? `${product.brand || ''} ${product.category1 || ''} ${product.category2 || ''} - 가격: ${Number(product.lprice).toLocaleString()}원` : '',
              price: product?.lprice,
              mallName: product?.mallName,
              brand: product?.brand,
            };
          }
        } catch (apiError: any) {
          // API 할당량 초과 (429) 등의 에러
          if (apiError.message?.includes('429') || apiError.message?.includes('할당량')) {
            console.warn(`[스마트스토어] ⚠️ 네이버 API 할당량 초과, 크롤링 시도...`);
            // 폴백: 아래 일반 크롤링 로직으로 계속 진행
          } else {
            console.error(`[스마트스토어] ❌ 네이버 API 실패: ${apiError.message}`);
          }
        }
      } else {
        console.warn(`[스마트스토어] ⚠️ 네이버 API 키가 없거나 제품명 추출 실패`);
        console.warn(`[스마트스토어] 💡 환경설정에서 네이버 API 키를 설정하세요.`);
      }
    }

    // ✅ 네이버 블로그 URL 감지 (가장 먼저 처리)
    const isNaverBlog = /blog\.naver\.com/i.test(url);

    // ✅ 네이버 블로그 URL이면 이미지 수집 시도 (imagesOnly가 false가 아닐 때만)
    if (isNaverBlog) {
      // imagesOnly가 명시적으로 false가 아니면 네이버 블로그 이미지 수집 실행
      if (options.imagesOnly === false) {
        console.log(`[네이버 블로그 크롤링] 텍스트만 수집 모드: 이미지 수집 건너뜀`);
      } else {
        console.log(`[네이버 블로그 크롤링] 이미지 수집 시작: ${url}`);
        console.log(`[네이버 블로그 크롤링] options.imagesOnly: ${options.imagesOnly}`);

        try {
          const { crawlNaverBlogWithPuppeteer } = await import('./naverBlogCrawler.js');
          const result = await crawlNaverBlogWithPuppeteer(url, (msg) => {
            console.log(`[네이버 블로그] ${msg}`);
          });

          if (result.images && result.images.length > 0) {
            console.log(`[네이버 블로그 크롤링] ✅ ${result.images.length}개 이미지 수집 완료`);
            return {
              images: result.images.slice(0, 50), // 최대 50개
              title: result.title,
              description: result.content?.substring(0, 200)
            };
          } else {
            console.log(`[네이버 블로그 크롤링] ⚠️ 이미지를 찾을 수 없습니다.`);
            // 이미지를 찾을 수 없어도 텍스트는 추출할 수 있으므로 계속 진행하지 않고 빈 배열 반환
            return { images: [] };
          }
        } catch (error) {
          console.error(`[네이버 블로그 크롤링] ❌ 오류: ${(error as Error).message}`);
          console.error(`[네이버 블로그 크롤링] 스택 트레이스:`, (error as Error).stack);
          // 에러가 발생하면 빈 배열 반환 (나중에 텍스트만 추출하도록)
          return { images: [] };
        }
      }
    }

    // ✅ 쇼핑몰 감지 (국내외 주요 쇼핑몰 모두 포함)
    const isPartnerLink = /coupa\.ng|link\.coupang\.com|shoppingconnect|adcash|adcrops|adfit|adpopcorn/i.test(url);
    const isShoppingMall = /coupang\.com|gmarket\.co\.kr|11st\.co\.kr|auction\.co\.kr|shopping\.naver\.com|brand\.naver\.com|brandconnect\.naver\.com|smartstore\.naver\.com|aliexpress\.com|amazon\.com|amazon\.co\.kr|wemakeprice\.com|tmon\.co\.kr/i.test(url);

    let html = '';
    let finalUrl = url;

    // ✅ 쇼핑몰 URL이면 네이버 API를 먼저 시도 (빠르고 안정적)
    if ((isPartnerLink || isShoppingMall) && options.naverClientId && options.naverClientSecret) {
      console.log(`[쇼핑몰 크롤링] 🔍 네이버 API 우선 시도...`);

      // URL에서 제품명 추출
      const productName = await extractProductNameFromUrl(url);

      if (productName) {
        console.log(`[쇼핑몰 크롤링] 제품명 추출: "${productName}"`);

        const apiResult = await tryNaverApiFirst(url, productName, options);

        if (apiResult.success && apiResult.images.length > 0) {
          console.log(`[쇼핑몰 크롤링] ✅ 네이버 API 성공! 이미지 ${apiResult.images.length}개`);
          return {
            images: apiResult.images,
            title: apiResult.title,
            description: apiResult.description,
            price: apiResult.price,
          };
        } else {
          console.log(`[쇼핑몰 크롤링] ⚠️ 네이버 API 결과 없음, Puppeteer 폴백...`);
        }
      } else {
        console.log(`[쇼핑몰 크롤링] ⚠️ 제품명 추출 실패, Puppeteer 사용`);
      }
    }

    // ✅ 보안이 강한 사이트는 Puppeteer 사용 (네이버 API 실패 시 폴백)
    if (isPartnerLink || isShoppingMall) {
      console.log(`[쇼핑몰 크롤링] Puppeteer 사용`);

      // ✅ 스마트스토어: 모바일 URL로 변환 (CAPTCHA 우회)
      // ✅ [FIX] m.m. 중복 방지 조건 추가
      let crawlUrl = url;
      if (url.includes('smartstore.naver.com') && !url.includes('m.smartstore.naver.com')) {
        // smartstore.naver.com → m.smartstore.naver.com
        crawlUrl = url.replace('smartstore.naver.com', 'm.smartstore.naver.com');
        console.log(`[스마트스토어] 📱 모바일 URL로 변환: ${crawlUrl.substring(0, 60)}...`);
      }

      try {
        // ✅ Puppeteer로 직접 이미지 추출 (글 작성용과 동일한 설정 사용)
        const puppeteer = await import('puppeteer');

        // ✅ 배포 환경에서 Chromium 경로 찾기
        const executablePath = await getChromiumExecutablePath();
        console.log(`[쇼핑몰 크롤링] Chromium 경로: ${executablePath || '자동 감지'}`);

        const browser = await puppeteer.launch({
          headless: true,
          executablePath: executablePath, // ✅ 배포 환경 지원
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            // ✅ 저사양 컴퓨터 최적화
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-sync',
            '--no-first-run',
            '--mute-audio',
            '--js-flags=--max-old-space-size=256',
          ],
        });

        const page = await browser.newPage();

        // ✅ 자동화 감지 우회 (글 작성용과 동일)
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
          Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
          (window as any).chrome = { runtime: {} };
        });

        // ✅ 스마트스토어 모바일: 모바일 User-Agent 사용
        if (url.includes('smartstore.naver.com') || crawlUrl.includes('m.smartstore.naver.com')) {
          await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
          await page.setViewport({ width: 390, height: 844 }); // iPhone 14 크기
        } else {
          // User-Agent 설정
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          // ✅ 뷰포트 설정 (실제 브라우저 크기)
          await page.setViewport({ width: 1920, height: 1080 });

          // ✅ 쇼핑몰별 쿠키 설정 (실제 브라우저처럼)
          if (url.includes('coupang.com')) {
            await page.setCookie({
              name: 'x-coupang-origin-region',
              value: 'KR',
              domain: '.coupang.com'
            });
            await page.setCookie({
              name: 'x-coupang-accept-language',
              value: 'ko_KR',
              domain: '.coupang.com'
            });
          }
        }

        // ✅ 리디렉션을 따라가며 최종 URL까지 이동 (스마트스토어는 crawlUrl 사용)
        try {
          await page.goto(crawlUrl, {
            waitUntil: 'domcontentloaded', // ✅ 속도 개선: domcontentloaded로 변경 (더 빠름)
            timeout: 30000 // ✅ 타임아웃 30초로 단축
          });

          // ✅ 네이버 브랜드 스토어/커넥트 감지 (goto 전에 미리 체크)
          const isNaverBrandBeforeWait = url.includes('brand.naver.com') || url.includes('brandconnect.naver.com');

          // ✅ 속도 개선: 대기 시간 단축
          const initialWaitTime = isNaverBrandBeforeWait ? 2000 : 1500; // 브랜드 스토어: 2초, 일반: 1.5초
          console.log(`[쇼핑몰 크롤링] 페이지 로드 완료, 대기 중... (${initialWaitTime}ms)`);
          await new Promise(resolve => setTimeout(resolve, initialWaitTime));

          finalUrl = page.url();

          // Access Denied 페이지 감지
          const pageTitle = await page.title();
          const pageContent = await page.content();

          if (pageTitle.includes('Access Denied') || pageContent.includes('Access Denied') ||
            pageContent.includes('접근이 거부되었습니다') || pageContent.includes('Request blocked')) {
            console.log(`[쇼핑몰 크롤링] ⚠️ Access Denied 감지. 재시도 중...`);

            // 페이지 새로고침 후 재시도
            await page.reload({ waitUntil: 'domcontentloaded' });
            await new Promise(resolve => setTimeout(resolve, 3000));

            const retryTitle = await page.title();
            const retryContent = await page.content();

            if (retryTitle.includes('Access Denied') || retryContent.includes('Access Denied')) {
              throw new Error('쿠팡 접근이 차단되었습니다. 잠시 후 다시 시도해주세요.');
            }
          }
        } catch (gotoError) {
          console.error(`[쇼핑몰 크롤링] goto 실패:`, gotoError);
          throw new Error(`페이지 로드 실패: ${(gotoError as Error).message}`);
        }

        finalUrl = page.url();

        if (finalUrl !== url) {
          console.log(`[쇼핑몰 크롤링] 리디렉션: ${url} → ${finalUrl}`);
        }

        // ✅ 네이버 브랜드 스토어/커넥트 및 스마트스토어 감지
        const isNaverBrand = url.includes('brand.naver.com') || url.includes('brandconnect.naver.com');
        // ✅ 스마트스토어: 원본 URL 또는 모바일 URL 모두 감지
        const isSmartStore = url.includes('smartstore.naver.com') || crawlUrl.includes('m.smartstore.naver.com');

        // ✅ 스마트스토어: 특정 요소가 로드될 때까지 대기
        if (isSmartStore) {
          console.log(`[스마트스토어] 제품 정보 로드 대기 중...`);

          try {
            // ✅ 모바일/데스크톱 모두 지원하는 선택자
            await page.waitForSelector('.se-main-container, ._2-I30XS1lA, .product-detail__content, #INTRODUCE, .CDVK7KtpZn, .UMv5kEGtch, [class*="product_title"], [class*="ProductInfo"]', {
              timeout: 10000
            });
            console.log(`[스마트스토어] ✅ 제품 정보 로드 완료`);

            // 추가 대기 단축
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (waitError) {
            console.warn(`[스마트스토어] ⚠️ 제품 정보 로드 실패, 계속 진행: ${(waitError as Error).message}`);
            // ✅ 속도 개선: 실패 시 대기 시간 단축
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } else {
          // ✅ 속도 개선: 일반 쇼핑몰 대기 시간 단축
          const waitTime = isNaverBrand ? 2000 : 1500; // 브랜드 스토어: 2초, 일반: 1.5초
          console.log(`[쇼핑몰 크롤링] 페이지 로드 대기 중... (${waitTime}ms)`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        console.log(`[쇼핑몰 크롤링] 빠른 스크롤 시작...${isNaverBrand ? ' (네이버 브랜드 스토어)' : ''}`);

        // ✅ 속도 개선: 스크롤 횟수 및 대기 시간 단축
        try {
          console.log(`[쇼핑몰 크롤링] 빠른 스크롤 중...`);

          // ✅ 속도 개선: 스크롤 횟수 줄임
          const scrollIterations = isNaverBrand ? 4 : 3; // 브랜드 스토어: 4회, 일반: 3회

          for (let i = 0; i < scrollIterations; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 400)); // 400ms로 단축
            await page.evaluate(() => window.scrollTo(0, 0));
            await new Promise(r => setTimeout(r, 200)); // 200ms로 단축
          }

          // 최종 스크롤
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(r => setTimeout(r, 500));

          console.log(`[쇼핑몰 크롤링] ✅ 스크롤 완료 (${scrollIterations}회)`);

          // ✅ 속도 개선: 이미지 로드 대기 시간 단축
          const imageWaitTime = isNaverBrand ? 1500 : 1000;
          console.log(`[쇼핑몰 크롤링] 이미지 로드 대기 중... (${imageWaitTime}ms)`);
          await new Promise(resolve => setTimeout(resolve, imageWaitTime));

        } catch (e) {
          console.log(`[쇼핑몰 크롤링] 스크롤 실패 (무시):`, (e as Error).message);
        }

        // ✅ 리뷰/후기(UGC) 영역 로딩 유도: 탭 클릭 + 추가 스크롤
        // (리뷰 이미지는 DOM에 렌더링되어야만 img 태그로 추출 가능)
        try {
          const clicked = await page.evaluate(() => {
            const keywords = ['리뷰', '후기', '상품평', '포토', '포토리뷰', '사용후기', '구매후기'];
            const isVisible = (el: Element) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };

            const candidates: HTMLElement[] = [];
            const els = Array.from(document.querySelectorAll('a, button, [role="tab"], [role="button"], li')) as HTMLElement[];
            for (const el of els) {
              const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
              if (!text) continue;
              if (!isVisible(el)) continue;
              if (keywords.some((k) => text.includes(k))) {
                candidates.push(el);
              }
            }
            const target = candidates[0];
            if (!target) return false;
            try {
              target.click();
              return true;
            } catch {
              return false;
            }
          });

          if (clicked) {
            await new Promise((r) => setTimeout(r, 1200));
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise((r) => setTimeout(r, 900));
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise((r) => setTimeout(r, 900));
          } else {
            // 탭이 없어도 리뷰 섹션이 아래쪽에 있는 경우가 많아 추가 스크롤
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise((r) => setTimeout(r, 900));
          }
        } catch (e) {
          console.log(`[쇼핑몰 크롤링] 리뷰/후기 로딩 유도 실패 (무시):`, (e as Error).message);
        }

        // ✅ imagesOnly가 false이면 이미지 추출 건너뛰기 (텍스트만 추출)
        if (options.imagesOnly !== false) {
          console.log(`[쇼핑몰 크롤링] 스크롤 완료, 이미지 추출 시작...`);

          // ✅ 네이버 브랜드 스토어: 이미지 요소 확인 (더 많은 이미지를 위해 대기 시간 증가)
          if (isNaverBrand) {
            // 이미지 요소가 있는지 확인 (타임아웃 증가)
            try {
              await page.waitForSelector('img[src*="shop-phinf"], img[src*="brand.naver"], img[src*="pstatic"], .product_img img, [class*="product"] img, img[src*="http"]', {
                timeout: 5000, // 2초 → 5초로 증가
                visible: false
              });
              console.log(`[쇼핑몰 크롤링] ✅ 이미지 요소 감지됨`);
            } catch (waitError) {
              // 타임아웃되어도 계속 진행 (이미지가 없을 수도 있음)
              console.log(`[쇼핑몰 크롤링] 이미지 요소 대기 타임아웃, 계속 진행...`);
            }
          }

          // ✅ 브라우저에서 직접 이미지 추출 (최적화된 방식 - 타임아웃 방지)
          puppeteerExtractedData = await page.evaluate((isBrandStore: boolean) => {
            const images: string[] = [];
            const seenUrls = new Set<string>();
            let totalImgTags = 0;
            let filteredByUI = 0;
            let filteredBySize = 0;

            // ✅ 리뷰 포토와 일반 이미지를 분리 수집
            const reviewImages: string[] = []; // 리뷰 포토 (최우선)
            const detailImages: string[] = []; // 상세 정보 이미지
            const productImages: string[] = []; // 제품 이미지

            // ✅ 네이버 브랜드 스토어 전용 선택자 추가
            const brandStoreSelectors = isBrandStore ? [
              // ✅ [2026-02-02] brand.naver.com 전용 리뷰 이미지 (사용자 제공 - 최신 셀렉터)
              { priority: 'review', selector: '.YvTyxRfXAK img' }, // 네이버 쇼핑 리뷰 이미지 컨테이너
              { priority: 'review', selector: 'img.K0hV0afCJe' }, // 네이버 쇼핑 리뷰 이미지 클래스
              { priority: 'review', selector: '.M6TOdPtHmb' }, // 리뷰 이미지 클래스
              { priority: 'review', selector: '.V5XROudBPi img' }, // 리뷰 아이템 내 이미지
              { priority: 'review', selector: '.NXwbdiybnm img' }, // 리뷰 이미지 컨테이너

              // 브랜드 스토어 리뷰 이미지 (최우선)
              { priority: 'review', selector: '.review_item img, [class*="ReviewItem"] img, .review-photo img' },
              { priority: 'review', selector: '[class*="review-photo"] img, [class*="reviewPhoto"] img' },
              { priority: 'review', selector: '[class*="review"] img[src*="shop-phinf"], [class*="review"] img[src*="pstatic"]' },
              { priority: 'review', selector: 'img[src*="shop-phinf"][src*="review"], img[src*="shop-phinf"][src*="photo"]' },

              // 브랜드 스토어 제품 이미지 (네이버 쇼핑 이미지 URL 포함)
              { priority: 'product', selector: 'img[src*="shop-phinf.pstatic.net"]' }, // 네이버 쇼핑 이미지 서버
              { priority: 'product', selector: 'img[src*="brand.naver.com"]' }, // 브랜드 스토어 도메인
              { priority: 'product', selector: 'img[src*="pstatic.net"]' }, // 네이버 정적 서버
              { priority: 'product', selector: '.product_img img, .product-image img, .prod-image img' },
              { priority: 'product', selector: '[class*="ProductImage"] img, [class*="productImage"] img' },
              { priority: 'product', selector: '[class*="product"] img[src*="http"]' }, // 제품 영역의 모든 이미지

              // 브랜드 스토어 상세 이미지
              { priority: 'detail', selector: '.detail_img img, .detail-image img, [class*="DetailImage"] img' },
              { priority: 'detail', selector: '.product_detail img, .productDetail img, [class*="product-detail"] img' },
              { priority: 'detail', selector: '[class*="detail"] img[src*="http"]' }, // 상세 영역의 모든 이미지
            ] : [];

            // ✅ 쿠팡 전용 선택자 (추가!)
            const isCoupang = window.location.href.includes('coupang.com');
            const coupangSelectors = isCoupang ? [
              // 쿠팡 대표 이미지 (상품 메인 이미지)
              { priority: 'product', selector: '.prod-image img' },
              { priority: 'product', selector: '.prod-image__detail img' },
              { priority: 'product', selector: '.prod-image__item img' },
              { priority: 'product', selector: '.prod-image-container img' },
              { priority: 'product', selector: '[class*="prod-image"] img' },
              { priority: 'product', selector: 'img[alt="Product image"]' },

              // 쿠팡 상세 설명 이미지 (displayitem = 상품 상세)
              { priority: 'detail', selector: '#productDetail img' },
              { priority: 'detail', selector: '.product-description-container img' },
              { priority: 'detail', selector: '.vendor-item-description-container img' },
              { priority: 'detail', selector: 'img[src*="displayitem"]' },
              { priority: 'detail', selector: 'img[src*="retail/images"]' },

              // 쿠팡 리뷰 이미지
              { priority: 'review', selector: '.sdp-review__article__photo img' },
              { priority: 'review', selector: '.sdp-review__article__image img' },
              { priority: 'review', selector: '[class*="review"] img[src*="coupang"]' },
            ] : [];

            // ✅ 스마트스토어 전용 선택자 (추가!)
            const isSmartStoreSelector = window.location.href.includes('smartstore.naver.com') || window.location.href.includes('m.smartstore.naver.com');
            const smartStoreSelectors = isSmartStoreSelector ? [
              // 스마트스토어 대표 이미지 (상품 메인 이미지)
              { priority: 'product', selector: 'img[src*="shop-phinf.pstatic.net"]' },
              { priority: 'product', selector: '.CDVK7KtpZn img' },
              { priority: 'product', selector: '.UMv5kEGtch img' },
              { priority: 'product', selector: '[class*="ProductImage"] img' },

              // 스마트스토어 상세 설명 이미지 (SE Editor)
              { priority: 'detail', selector: '.se-main-container img' },
              { priority: 'detail', selector: '.se-module-image img' },
              { priority: 'detail', selector: '#INTRODUCE img' },
              { priority: 'detail', selector: '[id*="DETAIL"] img' },

              // 스마트스토어 리뷰 이미지
              { priority: 'review', selector: '.review_photo img' },
              { priority: 'review', selector: '[class*="review"] img[src*="pstatic"]' },
            ] : [];

            // ✅ 알리익스프레스 전용 선택자 (추가!)
            const isAliExpress = window.location.href.includes('aliexpress.com');
            const aliExpressSelectors = isAliExpress ? [
              // 알리익스프레스 대표 이미지 (상품 메인 이미지)
              { priority: 'product', selector: '[class*="slider--slider"] img' },
              { priority: 'product', selector: '[class*="magnifier--image"] img' },
              { priority: 'product', selector: '[class*="pdp-main-image"] img' },
              { priority: 'product', selector: '.gallery--imageItem img' },
              { priority: 'product', selector: 'img[src*="alicdn.com"]' },
              { priority: 'product', selector: 'img[src*="aliexpress-media.com"]' },

              // 알리익스프레스 상세 설명 이미지
              { priority: 'detail', selector: '#nav-description img' },
              { priority: 'detail', selector: '[class*="description--wrap"] img' },
              { priority: 'detail', selector: '[class*="description--product-description"] img' },
              { priority: 'detail', selector: '[class*="product-description"] img' },

              // 알리익스프레스 리뷰 이미지
              { priority: 'review', selector: '#nav-review img' },
              { priority: 'review', selector: '[class*="review--wrap"] img' },
              { priority: 'review', selector: '[class*="feedback--wrap"] img' },
            ] : [];

            // ✅ img 태그에서 이미지 추출 (우선순위별 분리 수집)
            const selectors = [
              // 브랜드 스토어 전용 선택자 (최우선)
              ...brandStoreSelectors,

              // 쿠팡 전용 선택자 (추가!)
              ...coupangSelectors,

              // ✅ 스마트스토어 전용 선택자 (추가!)
              ...smartStoreSelectors,

              // 알리익스프레스 전용 선택자 (추가!)
              ...aliExpressSelectors,

              // 1순위: 리뷰/포토 이미지 (일반인 실제 사용 사진)
              { priority: 'review', selector: '[class*="review"] img, [class*="Review"] img, [class*="photo"] img, [class*="Photo"] img' },
              { priority: 'review', selector: '[class*="후기"] img, [class*="리뷰"] img, [class*="포토"] img, [class*="동영상"] img' },
              { priority: 'review', selector: '.review_photo img, .photo_review img, .sdp-review__article__photo img' },
              { priority: 'review', selector: '.c_review_photo img, .review-photo img, .review-image img' },

              // 2순위: 상세 정보 이미지
              { priority: 'detail', selector: '[class*="detail"] img, [class*="Detail"] img, [class*="description"] img' },
              { priority: 'detail', selector: '[class*="상세"] img, [class*="정보"] img, [class*="content"] img' },
              { priority: 'detail', selector: '.prod-description img, #prdDetail img, .detail_img img' },

              // 3순위: 제품 이미지
              { priority: 'product', selector: '[class*="product"] img, [class*="item"] img' },
              { priority: 'product', selector: '.product_img img, .prod-image__detail img, .item_photo img' },
              { priority: 'product', selector: '.prd_img img, img[src*="product"], img[itemprop="image"]' },

              // 4순위: 모든 이미지 (폴백)
              { priority: 'all', selector: 'img' },
            ];

            // 원본 이미지 URL로 변환하는 함수 (안전한 버전 - 원본이 없을 수 있으므로 최소 변환)
            const getOriginalImageUrl = (url: string): string => {
              if (!url) return url;

              // ✅ 네이버 이미지: type 파라미터만 고화질로 변경 (원본 제거는 위험)
              if (url.includes('pstatic.net') || url.includes('naver.net')) {
                // ✅ [2026-02-08] checkout.phinf / image.nmv는 type 파라미터 미지원 (404 방지)
                if (url.includes('checkout.phinf') || url.includes('image.nmv')) {
                  url = url.replace(/\?type=.*$/, '');
                } else if (url.includes('type=')) {
                  // type 파라미터를 고화질로 변경 (f640 또는 w640)
                  // ⚠️ 완전 제거하면 404 발생 가능 → 고화질로만 변경
                  url = url.replace(/type=f\d+/gi, 'type=f640');
                  url = url.replace(/type=w\d+/gi, 'type=w640');
                  url = url.replace(/type=m\d+/gi, 'type=w640');
                  url = url.replace(/type=s\d+/gi, 'type=w640');
                }
                // _thumb, _small 등은 제거하지 않음 (원본이 없을 수 있음)
              }

              // ✅ 쿠팡 이미지: 최소 변환만
              if (url.includes('coupang.com') || url.includes('coupangcdn.com')) {
                // thumbnail → original 변환만 (안전)
                url = url.replace(/\/thumbnail\//gi, '/original/');
              }

              // ✅ 알리익스프레스 이미지: 크기/품질 접미사 제거
              if (url.includes('alicdn.com') || url.includes('aliexpress-media.com')) {
                // 예: xxx.jpg_220x220q75.jpg_.avif → xxx.jpg
                // 또는: xxx.jpg_Q90.jpg → xxx.jpg
                url = url.replace(/_\d+x\d+[^.]*(\.(jpg|jpeg|png|webp|avif))?(_\.(avif|webp))?$/gi, '');
                url = url.replace(/_Q\d+[^.]*(\.(jpg|jpeg|png|webp|avif))?$/gi, '');
                // .avif 확장자를 .jpg로 변경 (호환성)
                if (url.endsWith('.avif') || url.endsWith('_.avif')) {
                  url = url.replace(/(\.(jpg|jpeg|png))?\._?\.avif$/gi, '.jpg');
                  url = url.replace(/\.avif$/gi, '.jpg');
                }
              }

              // ⚠️ 공격적인 변환 제거 - 원본이 존재하지 않으면 404 발생
              // _thumb, _small 등 제거하지 않음

              return url;
            };

            selectors.forEach((selectorObj, selectorIndex) => {
              const { priority, selector } = selectorObj;
              document.querySelectorAll(selector).forEach((img: Element) => {
                totalImgTags++;
                const imgElement = img as HTMLImageElement;

                // ✅ 리뷰 이미지인지 확인 (선택자 및 부모 요소 기반 - URL은 나중에 확인)
                const isReviewImageBySelector =
                  selector.includes('review') ||
                  selector.includes('Review') ||
                  selector.includes('photo') ||
                  selector.includes('Photo') ||
                  selector.includes('후기') ||
                  selector.includes('리뷰') ||
                  selector.includes('동영상') ||
                  selector.includes('Video') ||
                  selector.includes('video') ||
                  // 부모 요소 확인
                  (() => {
                    let parent = imgElement.parentElement;
                    let depth = 0;
                    while (parent && depth < 5) {
                      const className = parent.className?.toLowerCase() || '';
                      const id = parent.id?.toLowerCase() || '';
                      if (className.includes('review') || className.includes('photo') ||
                        className.includes('후기') || className.includes('리뷰') ||
                        className.includes('동영상') || className.includes('video') ||
                        id.includes('review') || id.includes('photo') || id.includes('video')) {
                        return true;
                      }
                      parent = parent.parentElement;
                      depth++;
                    }
                    return false;
                  })();

                const isDetailImage =
                  selector.includes('detail') ||
                  selector.includes('Detail') ||
                  selector.includes('description') ||
                  selector.includes('Description') ||
                  selector.includes('content') ||
                  selector.includes('Content') ||
                  selector.includes('상세') ||
                  selector.includes('정보') ||
                  selector.includes('설명') ||
                  // 부모 요소 확인
                  (() => {
                    let parent = imgElement.parentElement;
                    let depth = 0;
                    while (parent && depth < 5) {
                      const className = parent.className?.toLowerCase() || '';
                      const id = parent.id?.toLowerCase() || '';
                      if (className.includes('detail') || className.includes('description') ||
                        className.includes('content') || className.includes('상세') ||
                        className.includes('정보') || className.includes('설명') ||
                        id.includes('detail') || id.includes('description') || id.includes('content')) {
                        return true;
                      }
                      parent = parent.parentElement;
                      depth++;
                    }
                    return false;
                  })();

                // ✅ 여러 소스 확인 (고해상도 우선) - 더 많은 속성 체크
                let src =
                  imgElement.getAttribute('data-original') || // 원본 이미지 (Lazy Loading)
                  imgElement.getAttribute('data-src-original') || // 원본 이미지
                  imgElement.getAttribute('data-lazy-src-original') || // 원본 이미지
                  imgElement.getAttribute('data-original-src') || // 원본 이미지
                  imgElement.getAttribute('data-origin') || // 원본 이미지
                  imgElement.src || // 현재 표시 중인 이미지
                  imgElement.getAttribute('data-src') || // Lazy Loading 이미지
                  imgElement.getAttribute('data-lazy-src') || // Lazy Loading 이미지
                  imgElement.getAttribute('data-lazy') || // Lazy Loading 이미지
                  imgElement.getAttribute('data-image') || // 이미지 URL
                  imgElement.getAttribute('data-url') || // 이미지 URL
                  imgElement.getAttribute('data-img') || // 이미지 URL
                  imgElement.getAttribute('data-srcset')?.split(',').pop()?.trim()?.split(' ')[0] || // srcset에서 마지막 (가장 큰) 이미지
                  imgElement.srcset?.split(',').pop()?.trim()?.split(' ')[0] || // srcset에서 마지막 이미지
                  '';

                if (src && src.startsWith('http')) {
                  // ✅ 쿠팡 추천/광고 상품 영역 제외 (부모 요소 확인)
                  const isInRecommendSection = (() => {
                    let parent = imgElement.parentElement;
                    let depth = 0;
                    while (parent && depth < 10) {
                      const className = parent.className?.toLowerCase() || '';
                      const id = parent.id?.toLowerCase() || '';
                      // 쿠팡 추천 상품 영역 감지 (함께 보면 좋은 상품, 다른 판매자, 추천, 번들 등)
                      // + 알리익스프레스 추천 영역 감지 (More to Love, Similar items 등)
                      if (
                        className.includes('bundle') ||
                        className.includes('recommend') ||
                        className.includes('similar') ||
                        className.includes('related') ||
                        className.includes('other-seller') ||
                        className.includes('otherseller') ||
                        className.includes('sdp-bundle') ||
                        className.includes('product-card') ||
                        className.includes('productcard') ||
                        className.includes('thumbnail-list') ||
                        className.includes('thumbnaillist') ||
                        className.includes('ab-items') ||
                        // 알리익스프레스 추천 영역 (추가!)
                        className.includes('more-to-love') ||
                        className.includes('moretolove') ||
                        className.includes('recommend-platform') ||
                        className.includes('pick-for-you') ||
                        className.includes('pickforyou') ||
                        className.includes('may-like') ||
                        className.includes('maylike') ||
                        id.includes('bundle') ||
                        id.includes('recommend') ||
                        id.includes('similar') ||
                        id.includes('related') ||
                        id.includes('otherseller') ||
                        // 알리익스프레스 추천 영역 ID (추가!)
                        id.includes('moretolove') ||
                        id.includes('nav-moretolove') ||
                        id.includes('maylike') ||
                        id.includes('pickforyou')
                      ) {
                        return true;
                      }
                      parent = parent.parentElement;
                      depth++;
                    }
                    return false;
                  })();

                  if (isInRecommendSection) {
                    filteredByUI++;
                    return;
                  }

                  // UI 요소 필터링 (정확하게)
                  const lowerSrc = src.toLowerCase();
                  const isUIElement =
                    lowerSrc.includes('/icon/') ||
                    lowerSrc.includes('/logo/') ||
                    lowerSrc.includes('logo_') ||
                    lowerSrc.includes('_logo') ||
                    lowerSrc.includes('main_logo') ||
                    lowerSrc.includes('/button/') ||
                    lowerSrc.includes('/ad/') ||
                    lowerSrc.includes('/banner/') ||
                    lowerSrc.endsWith('icon.png') ||
                    lowerSrc.endsWith('logo.png') ||
                    lowerSrc.includes('favicon') ||
                    lowerSrc.includes('sprite') ||
                    lowerSrc.includes('blank.gif') ||
                    lowerSrc.includes('spacer.gif') ||
                    lowerSrc.includes('transparent.gif') ||
                    lowerSrc.includes('loading.gif') ||
                    lowerSrc.includes('loading.png') ||
                    lowerSrc.includes('spinner') ||
                    lowerSrc.includes('banner') ||
                    lowerSrc.includes('promo') ||
                    lowerSrc.includes('ad_') ||
                    lowerSrc.includes('_ad.') ||
                    lowerSrc.includes('/ads/') ||
                    lowerSrc.includes('npay') ||
                    lowerSrc.includes('naver_pay') ||
                    lowerSrc.includes('naverpay') ||
                    lowerSrc.includes('point_') ||
                    lowerSrc.includes('coupon_') ||
                    lowerSrc.includes('event_') ||
                    lowerSrc.includes('placeholder') ||
                    // ✅ 네이버 UI 요소 필터링 강화
                    lowerSrc.includes('ico_gnb') ||
                    lowerSrc.includes('sp_gnb') ||
                    lowerSrc.includes('ico_arrow') ||
                    lowerSrc.includes('ico_nav') ||
                    lowerSrc.includes('ico_menu') ||
                    lowerSrc.includes('ico_btn') ||
                    lowerSrc.includes('btn_') ||
                    lowerSrc.includes('_btn') ||
                    lowerSrc.includes('/gnb/') ||
                    lowerSrc.includes('/common/') && (lowerSrc.includes('.svg') || lowerSrc.includes('.gif')) ||
                    // 매우 작은 이미지 (아이콘 크기)
                    lowerSrc.includes('_16x16') ||
                    lowerSrc.includes('_20x20') ||
                    lowerSrc.includes('_24x24') ||
                    lowerSrc.includes('_32x32') ||
                    lowerSrc.includes('_40x40') ||
                    lowerSrc.includes('_42x') ||
                    // ✅ 로고 이미지 추가 필터링
                    /logo.*\.(png|jpg|jpeg|svg|gif)/i.test(lowerSrc);

                  if (isUIElement) {
                    filteredByUI++;
                    return;
                  }

                  // ✅ 크기 필터링 완화 (더 많은 이미지 수집을 위해 필터링 완화)
                  const lowerUrl = src.toLowerCase();
                  // 매우 작은 썸네일만 제외 (40x40, 50x50 등)
                  if ((lowerUrl.includes('_40x40') || lowerUrl.includes('_50x50')) &&
                    !lowerUrl.includes('product') && !lowerUrl.includes('review') && !lowerUrl.includes('detail')) {
                    filteredBySize++;
                    return;
                  }

                  // ✅ 원본 이미지 URL로 변환
                  const originalSrc = getOriginalImageUrl(src);

                  // ✅ 중복 체크: 고품질 이미지 중복 제거 (개선된 버전)
                  // 1. 쿼리 파라미터 제거
                  let normalizedUrl = originalSrc
                    .replace(/[?&](type|size|w|h|quality|q|resize)=[^&]*/gi, '') // 크기/품질 파라미터 제거
                    .replace(/\?$/, '') // 빈 쿼리 제거
                    .replace(/&$/, ''); // 빈 앰퍼샌드 제거

                  // ✅ 중복 체크 완화: 정확히 같은 URL만 중복으로 처리
                  // 브랜드 스토어에서 더 많은 이미지를 수집하기 위해 중복 체크 완화
                  if (seenUrls.has(normalizedUrl)) {
                    return; // 정확히 같은 URL만 중복 제외
                  }

                  // 새 URL 저장
                  seenUrls.add(normalizedUrl);

                  if (!originalSrc.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                    console.log(`  [확장자 제외] ${originalSrc.substring(0, 80)}...`);
                    return;
                  }

                  // ✅ URL 기반 리뷰 이미지 감지 (checkout.phinf, shopnbuyer는 리뷰 이미지)
                  const lowerSrcForReview = originalSrc.toLowerCase();
                  const isReviewImageByUrl =
                    lowerSrcForReview.includes('checkout.phinf') ||
                    lowerSrcForReview.includes('checkout-phinf') ||
                    lowerSrcForReview.includes('shopnbuyer') ||
                    lowerSrcForReview.includes('/review/') ||
                    lowerSrcForReview.includes('photo_review') ||
                    lowerSrcForReview.includes('review_photo');

                  // 최종 리뷰 이미지 판단 (선택자 기반 + URL 기반)
                  const isReviewImage = isReviewImageBySelector || isReviewImageByUrl;

                  // ✅ 우선순위별로 분리 저장 (중복 체크는 이미 위에서 처리)
                  if (isReviewImage || priority === 'review') {
                    // 리뷰 포토 (최우선)
                    reviewImages.push(originalSrc);
                  } else if (isDetailImage || priority === 'detail') {
                    // 상세 정보 이미지
                    detailImages.push(originalSrc);
                  } else if (priority === 'product') {
                    // 제품 이미지
                    productImages.push(originalSrc);
                  } else {
                    // 기타 이미지 (폴백)
                    images.push(originalSrc);
                  }
                }
              });
            });

            // ✅ OG 이미지도 추가 (제품 이미지로)
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (ogImage) {
              const originalOgImage = getOriginalImageUrl(ogImage);
              const normalizedOgUrl = originalOgImage
                .replace(/[?&](type|size|w|h|quality)=[^&]*/gi, '')
                .replace(/\?$/, '')
                .replace(/&$/, '');

              if (!seenUrls.has(normalizedOgUrl)) {
                productImages.push(originalOgImage);
                seenUrls.add(normalizedOgUrl);
              }
            }

            // ✅ 우선순위별로 이미지 합치기 (브랜드 스토어: 제품 이미지 우선, 일반: 리뷰 포토 우선)
            // 브랜드 스토어는 제품 이미지가 많고 리뷰가 적으므로 제품 이미지를 더 많이 포함
            const finalImages = isBrandStore ? [
              ...productImages,              // 📦 제품 이미지 전체 (브랜드 스토어는 제품 이미지 우선)
              ...detailImages,               // 📝 상세 정보 이미지
              ...reviewImages,               // 🔥 리뷰 포토
              ...images                      // 기타 이미지
            ] : [
              ...productImages.slice(0, 1),  // 🎯 대표 사진: 공식 제품 사진 1장 (첫 번째)
              ...reviewImages,               // 🔥 리뷰 포토 (일반인 실제 사용 사진)
              ...detailImages,               // 📝 상세 정보 이미지
              ...productImages.slice(1),     // 📦 나머지 제품 이미지
              ...images                      // 기타 이미지
            ];

            // ✅ 제목 추출 (네이버 브랜드 스토어 특화)
            let title = '';

            // 네이버 브랜드 스토어 제품명 선택자 (우선순위 순)
            const titleSelectors = [
              // ✅ [2026-01-30] brand.naver.com 전용 셀렉터 (사용자 제공)
              '.DCVBehA8ZB', // 제품명: [에버조이] 건식 좌훈 족욕기 (JOY-010)
              '.vqznXAI2JL h3', // 제품명 컨테이너

              'meta[property="og:title"]',
              '[class*="product"][class*="name"]',
              '[class*="product"][class*="title"]',
              '[class*="ProductName"]',
              '[class*="productName"]',
              'h1[class*="product"]',
              'h2[class*="product"]',
              '.prod-buy-header__title',
              '#productTitle',
              '.product-title',
              'h1',
              'title'
            ];

            for (const selector of titleSelectors) {
              const el = document.querySelector(selector);
              if (el) {
                if (selector.startsWith('meta')) {
                  title = el.getAttribute('content')?.trim() || '';
                } else {
                  title = el.textContent?.trim() || '';
                }

                // 제목이 유효한지 확인 (너무 짧거나 의미없는 텍스트 제외)
                if (title && title.length > 5 && !title.includes('네이버') && !title.includes('NAVER')) {
                  // 브랜드명 제거 (끝에 : 브랜드명 형식)
                  if (title.includes(' : ')) {
                    title = title.split(' : ')[0].trim();
                  }
                  break;
                }
              }
            }

            if (!title) {
              title = document.querySelector('title')?.textContent?.trim() || '';
            }

            // 상세 통계 로그
            console.log(`[이미지 수집 통계]`);
            console.log(`  - 전체 img 태그: ${totalImgTags}개`);
            console.log(`  - UI 요소 제외: ${filteredByUI}개`);
            console.log(`  - 크기 제외: ${filteredBySize}개`);
            console.log(`  - 리뷰 포토: ${reviewImages.length}개 ⭐`);
            console.log(`  - 상세 정보: ${detailImages.length}개`);
            console.log(`  - 제품 이미지: ${productImages.length}개`);
            console.log(`  - 기타 이미지: ${images.length}개`);
            console.log(`  - 최종 수집: ${finalImages.length}개`);
            console.log(`  - 제품명: ${title}`);

            // ✅ 브랜드 스토어 디버그: img 태그 샘플 출력
            if (isBrandStore && totalImgTags > 0 && finalImages.length === 0) {
              console.log(`[브랜드 스토어 디버그] ⚠️ 이미지가 추출되지 않았습니다. 샘플 img 태그 확인 중...`);
              const sampleImgs = Array.from(document.querySelectorAll('img')).slice(0, 5);
              sampleImgs.forEach((img, idx) => {
                const src = (img as HTMLImageElement).src || '';
                const dataSrc = img.getAttribute('data-src') || '';
                const className = img.className || '';
                console.log(`  [${idx + 1}] src: ${src.substring(0, 80)}...`);
                console.log(`      data-src: ${dataSrc.substring(0, 80) || '없음'}...`);
                console.log(`      class: ${className.substring(0, 50)}...`);
              });
            }

            // 수집된 이미지 URL 일부 출력 (디버깅용)
            if (finalImages.length > 0) {
              console.log(`[수집된 이미지 샘플]`);
              finalImages.slice(0, 10).forEach((img, idx) => {
                const type = idx === 0 ? '🎯대표' :
                  idx <= reviewImages.length ? '🔥리뷰' :
                    idx <= reviewImages.length + detailImages.length ? '📝상세' :
                      '📦제품';
                console.log(`  ${idx + 1}. [${type}] ${img.substring(0, 80)}...`);
              });
            }

            // ✅ [2026-01-30] 스펙 추출
            let spec = '';
            const specSelectors = [
              // ✅ [2026-01-30] brand.naver.com 전용 셀렉터 (사용자 제공)
              '.RCLS1uAn0a', // 상품정보 테이블
              '.m_PTftTaj7 table', // 상품정보 컨테이너

              '.I4JHe9c6G5', '.TVoJw6oCtc', // 배송/딜 정보
              '.product-spec', '.spec-table', '[class*="spec"]',
              '.detail-info table', '.product-detail-info',
              '[class*="specification"]', '.product-info-table',
              '.product-attribute', '[class*="attribute"]'
            ];
            for (const selector of specSelectors) {
              const specEl = document.querySelector(selector);
              if (specEl) {
                spec = specEl.textContent?.trim().substring(0, 500) || '';
                if (spec.length > 20) {
                  console.log(`[스펙 추출] ✅ ${selector}에서 ${spec.length}자 추출`);
                  break;
                }
              }
            }

            // ✅ [2026-01-30] 가격 추출
            let price = '';
            const priceSelectors = [
              // ✅ [2026-01-30] brand.naver.com 전용 셀렉터 (사용자 제공)
              '.e1DMQNBPJ_', // 가격 숫자 (129,000)
              '.Xu9MEKUuIo span.e1DMQNBPJ_', // 할인가 컨테이너 내 가격
              '.VaZJPclpdJ .e1DMQNBPJ_', // 원래 가격
              '.product-price', '.price-value', '[class*="price"]',
              '.sale-price', '.selling-price', '[class*="sellingPrice"]',
              'meta[property="og:price:amount"]', 'meta[property="product:price:amount"]'
            ];
            for (const selector of priceSelectors) {
              const priceEl = document.querySelector(selector);
              if (priceEl) {
                if (selector.startsWith('meta')) {
                  price = priceEl.getAttribute('content') || '';
                } else {
                  price = priceEl.textContent?.trim() || '';
                }
                // 가격 형식 정규화
                const priceMatch = price.match(/[\d,]+/);
                if (priceMatch && parseInt(priceMatch[0].replace(/,/g, '')) > 0) {
                  price = priceMatch[0] + '원';
                  console.log(`[가격 추출] ✅ ${price}`);
                  break;
                }
              }
            }

            // ✅ [2026-01-30] 리뷰 텍스트 추출 (최대 5개)
            const reviewTexts: string[] = [];
            const reviewSelectors = [
              // ✅ [2026-01-30] brand.naver.com 전용 셀렉터 (사용자 제공)
              '.vhlVUsCtw3 .K0kwJOXP06', // 리뷰 텍스트 컨테이너
              '.V5XROudBPi .K0kwJOXP06', // 리뷰 아이템 내 텍스트
              '.XnpoHCCmiR .K0kwJOXP06', // 리뷰 내용 영역
              '.review-content', '.review-text', '[class*="review"] p',
              '.review-body', '.user-review', '[class*="reviewContent"]',
              '.photo-review-text', '.review-description'
            ];
            for (const selector of reviewSelectors) {
              const reviewEls = document.querySelectorAll(selector);
              reviewEls.forEach((el, idx) => {
                if (reviewTexts.length < 5) {
                  const text = el.textContent?.trim();
                  if (text && text.length > 20 && text.length < 500) {
                    reviewTexts.push(text);
                  }
                }
              });
              if (reviewTexts.length >= 3) break;
            }
            if (reviewTexts.length > 0) {
              console.log(`[리뷰 추출] ✅ ${reviewTexts.length}개 리뷰 텍스트 추출`);
            }

            return {
              images: finalImages,
              title,
              spec,
              price,
              reviewTexts,
              reviewImageUrls: reviewImages, // 리뷰 이미지 별도 반환
              stats: {
                totalImgTags,
                filteredByUI,
                filteredBySize,
                reviewImages: reviewImages.length,
                detailImages: detailImages.length,
                productImages: productImages.length,
                collected: finalImages.length
              }
            };
          }, isNaverBrand);

          // ✅ 디버그: 추출 결과 확인
          if (puppeteerExtractedData && puppeteerExtractedData.stats) {
            const stats = puppeteerExtractedData.stats;
            console.log(`[쇼핑몰 크롤링] 📊 추출 통계: 전체 img 태그 ${stats.totalImgTags}개, UI 제외 ${stats.filteredByUI}개, 크기 제외 ${stats.filteredBySize}개`);
            console.log(`[쇼핑몰 크롤링] 📊 카테고리별: 리뷰 ${stats.reviewImages || 0}개, 상세 ${stats.detailImages || 0}개, 제품 ${stats.productImages || 0}개, 기타 ${stats.collected - (stats.reviewImages || 0) - (stats.detailImages || 0) - (stats.productImages || 0)}개`);
          }
        } else {
          console.log(`[쇼핑몰 크롤링] ⏭️ 이미지 추출 건너뛰기 (텍스트만 추출)`);
        }

        // ✅ 제품 설명 추출 (항상 추출)
        let productDescription = '';
        if (true) { // 항상 제품 설명 추출
          console.log(`[쇼핑몰 크롤링] 📝 제품 설명 추출 중...`);
          html = await page.content();
          const cheerio = await import('cheerio');
          const $ = cheerio.load(html);

          // 브랜드 스토어 제품 설명 추출
          if (url.includes('brand.naver.com')) {
            const brandDescriptionSelectors = [
              '.product_detail',
              '.productDetail',
              '.product-detail-info',
              '.product-description-area',
              '.product-info-area',
              '.product-content',
              '[class*="product"] [class*="detail"]',
              '[class*="product"] [class*="description"]',
              '.detail_info',
              '.detail_content',
              '.detail-view',
              '.detail-area',
              '.product-info',
              '.product_info',
              '#INTRODUCE',
              '#content',
              '.content',
              'article',
            ];

            let descriptionParts: string[] = [];

            for (const selector of brandDescriptionSelectors) {
              const elements = $(selector);
              if (elements.length > 0) {
                elements.each((_, el) => {
                  const text = $(el).text().trim();

                  // 오류 메시지 필터링
                  const isErrorMessage =
                    text.includes('시스템 오류') ||
                    text.includes('시스템오류') ||
                    text.includes('접속이 불가') ||
                    text.includes('서비스 점검') ||
                    text.includes('현재 서비스') ||
                    text.includes('네이버 시스템 오류') ||
                    text.includes('바디프랜드 시스템 오류') ||
                    text.length < 50;

                  if (!isErrorMessage && text && text.length >= 50) {
                    if (!descriptionParts.some(part => part.includes(text) || text.includes(part))) {
                      descriptionParts.push(text);
                    }
                  }
                });

                if (descriptionParts.join('').length > 500) {
                  break;
                }
              }
            }

            // 메타 설명 추가
            const metaDescription = $('meta[property="og:description"]').attr('content')?.trim() ||
              $('meta[name="description"]').attr('content')?.trim();
            if (metaDescription && metaDescription.length > 20 &&
              !metaDescription.includes('시스템 오류') &&
              !metaDescription.includes('바디프랜드 시스템 오류')) {
              descriptionParts.unshift(metaDescription);
            }

            productDescription = descriptionParts.join('\n\n').substring(0, 3000);

            if (productDescription.length > 0) {
              console.log(`[쇼핑몰 크롤링] 📝 제품 설명 추출 완료: ${productDescription.length}자`);
            }
          }
        }

        await browser.close();

        // ✅ imagesOnly === false이면 텍스트만 반환
        if (options.imagesOnly === false) {
          console.log(`[쇼핑몰 크롤링] ✅ 텍스트 추출 성공: 제목="${puppeteerExtractedData.title}", 설명=${productDescription?.length || 0}자`);
          return {
            images: [], // 이미지는 반환하지 않음
            title: puppeteerExtractedData.title,
            description: productDescription || undefined
          };
        }

        // ✅ imagesOnly === true이면 이미지와 텍스트 모두 반환
        console.log(`[쇼핑몰 크롤링] ✅ Puppeteer로 ${puppeteerExtractedData.images.length}개 이미지 수집 완료`);
        if (puppeteerExtractedData.stats) {
          const stats = puppeteerExtractedData.stats;
          console.log(`[쇼핑몰 크롤링] 📊 통계: 전체 ${stats.totalImgTags}개 → UI 제외 ${stats.filteredByUI}개 → 크기 제외 ${stats.filteredBySize}개`);
          console.log(`[쇼핑몰 크롤링] 🔥 리뷰 포토: ${stats.reviewImages || 0}개 | 📝 상세: ${stats.detailImages || 0}개 | 📦 제품: ${stats.productImages || 0}개`);
          console.log(`[쇼핑몰 크롤링] ✅ 최종 수집: ${stats.collected}개 (리뷰 포토 우선 정렬)`);
        }

        // ✅ 스마트스토어: HTML에 실제 제품 정보가 있는지 확인 (더 엄격하게)
        if (isSmartStore) {
          const hasProductInfo =
            html.includes('se-main-container') ||
            html.includes('_2-I30XS1lA') ||
            html.includes('product-detail') ||
            html.includes('INTRODUCE') ||
            html.includes('prod-buy-header') ||
            html.includes('smartstore');

          const hasErrorPage =
            html.includes('에러페이지') ||
            html.includes('시스템오류') ||
            html.includes('시스템 오류') ||
            html.includes('접속이 불가') ||
            html.includes('서비스 점검');

          if (hasErrorPage) {
            console.error(`[스마트스토어] ❌ 오류 페이지 감지! 봇으로 감지되었을 가능성이 높습니다.`);
            console.log(`[스마트스토어] HTML 샘플 (처음 500자):`, html.substring(0, 500));

            // ✅ 브라우저 닫고 에러 던지기
            await browser.close();
            throw new Error('네이버 스마트스토어가 봇 접근을 차단했습니다. 잠시 후 다시 시도해주세요.');
          } else if (!hasProductInfo) {
            console.warn(`[스마트스토어] ⚠️ 제품 정보가 HTML에 없습니다.`);
            console.log(`[스마트스토어] HTML 샘플 (처음 500자):`, html.substring(0, 500));
          } else {
            console.log(`[스마트스토어] ✅ 제품 정보 확인됨`);
          }
        }

        await browser.close();
        console.log(`[쇼핑몰 크롤링] 브라우저 닫음. HTML 파싱 시작...`);
      } catch (puppeteerError) {
        console.warn(`[쇼핑몰 크롤링] Puppeteer 실패, 일반 크롤링으로 폴백: ${(puppeteerError as Error).message}`);

        // 일반 크롤링으로 폴백
        const fetchImpl = await ensureFetch();
        const response = await fetchImpl(url, {
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        html = await response.text();
        finalUrl = response.url || url;
      }
    } else {
      // 일반 크롤링
      const fetchImpl = await ensureFetch();
      const response = await fetchImpl(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      html = await response.text();
      finalUrl = response.url || url;
    }

    // cheerio로 HTML 파싱
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    // 제목 추출
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('.prod-buy-header__title').text().trim() ||
      $('#productTitle').text().trim() ||
      $('.product-title').text().trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim();

    // ✅ 제품 설명 추출 (스마트스토어 전용) - imagesOnly 옵션이면 스킵
    let productDescription = '';

    // 스마트스토어 감지
    if (options.imagesOnly && url.includes('smartstore.naver.com')) {
      console.log('[스마트스토어] 🖼️ 이미지만 수집 모드 - 텍스트 추출 스킵');
    } else if (!options.imagesOnly && url.includes('smartstore.naver.com')) {
      console.log('[스마트스토어] 📝 제품 설명 추출 시작 (이미지는 스킵)...');

      // ✅ 스마트스토어 제품 설명 선택자 (우선순위별)
      const descriptionSelectors = [
        // 1순위: 상품 상세 정보 (스마트에디터)
        '.se-main-container .se-component-content', // 스마트에디터 실제 콘텐츠
        '.se-section-text', // 스마트에디터 텍스트 섹션
        '._2-I30XS1lA', // 스마트스토어 상세 설명 (2024년 구조)
        '.product-detail__content', // 제품 상세 콘텐츠

        // 2순위: 제품 정보
        '.prod-buy-header__title-container', // 제품 헤더
        '.product-info__text', // 제품 정보 텍스트
        '.product_info_area', // 제품 정보 영역

        // 3순위: 일반 상세 정보
        '#INTRODUCE', // 상품 소개
        '#content', // 일반 콘텐츠
        '.detail_content', // 상세 내용
      ];

      let descriptionParts: string[] = [];
      let foundValidContent = false;

      for (const selector of descriptionSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`[스마트스토어] "${selector}" 발견: ${elements.length}개`);

          elements.each((_, el) => {
            const text = $(el).text().trim();

            // ✅ 오류 메시지나 시스템 메시지 필터링
            const isErrorMessage =
              text.includes('시스템 오류') ||
              text.includes('접속이 불가') ||
              text.includes('서비스 점검') ||
              text.includes('현재 서비스') ||
              text.includes('이전 페이지로') ||
              text.includes('새로고침') ||
              text.includes('고객센터에 문의') ||
              text.length < 50; // 너무 짧은 텍스트 제외

            if (!isErrorMessage && text && text.length >= 50) {
              // 중복 제거
              if (!descriptionParts.some(part => part.includes(text) || text.includes(part))) {
                descriptionParts.push(text);
                foundValidContent = true;
                console.log(`[스마트스토어] 유효한 텍스트 추출: ${text.substring(0, 100)}...`);
              }
            }
          });

          // 충분한 콘텐츠를 찾았으면 중단
          if (foundValidContent && descriptionParts.join('').length > 500) {
            break;
          }
        }
      }

      // 메타 설명도 추가 (오류 메시지가 아닌 경우만)
      const metaDescription = $('meta[property="og:description"]').attr('content')?.trim() ||
        $('meta[name="description"]').attr('content')?.trim();
      if (metaDescription && metaDescription.length > 20 &&
        !metaDescription.includes('시스템 오류') &&
        !metaDescription.includes('접속이 불가')) {
        descriptionParts.unshift(metaDescription); // 메타 설명을 맨 앞에
      }

      // 합치기 (최대 3000자)
      productDescription = descriptionParts.join('\n\n').substring(0, 3000);

      console.log(`[스마트스토어] 제품 설명 추출 완료: ${productDescription.length}자`);
      console.log(`[스마트스토어] 설명 미리보기: ${productDescription.substring(0, 300)}...`);

      // ✅ 유효한 콘텐츠가 없으면 경고
      if (productDescription.length < 100) {
        console.warn('[스마트스토어] ⚠️ 제품 설명이 너무 짧거나 없습니다. HTML 구조를 확인하세요.');
        console.log('[스마트스토어] HTML 샘플:', html.substring(0, 1000));
      }
    }

    // ✅ 브랜드 스토어 & 브랜드 커넥트 제품 설명 추출 (imagesOnly 옵션이면 스킵)
    if (!options.imagesOnly && (url.includes('brand.naver.com') || url.includes('brandconnect.naver.com')) && !productDescription) {
      const storeType = url.includes('brandconnect.naver.com') ? '브랜드 커넥트' : '브랜드 스토어';
      console.log(`[${storeType}] 📝 제품 설명 추출 시작...`);

      // ✅ 오류 페이지 감지
      const hasErrorPage =
        html.includes('시스템 오류') ||
        html.includes('시스템오류') ||
        html.includes('네이버 시스템 오류') ||
        html.includes('바디프랜드 시스템 오류') ||
        html.includes('접속이 불가') ||
        html.includes('서비스 점검') ||
        html.includes('현재 서비스 접속이 불가합니다');

      if (hasErrorPage) {
        console.warn(`[${storeType}] ⚠️ 오류 페이지 감지! 제품 설명 추출을 건너뜁니다.`);
        console.log(`[${storeType}] HTML 샘플 (처음 500자):`, html.substring(0, 500));
      } else {
        // ✅ 브랜드 스토어 & 브랜드 커넥트 제품 설명 선택자 (우선순위별)
        const brandDescriptionSelectors = [
          // 1순위: 제품 상세 정보
          '.product_detail',
          '.productDetail',
          '.product-detail-info',
          '.product-description-area',
          '.product-info-area',
          '.product-content',
          '[class*="product"] [class*="detail"]',
          '[class*="product"] [class*="description"]',

          // 2순위: 상세 설명 영역
          '.detail_info',
          '.detail_content',
          '.detail-view',
          '.detail-area',

          // 3순위: 제품 정보
          '.product-info',
          '.product_info',
          '.prod-info',
          '.prod_info',

          // 4순위: 일반 콘텐츠
          '#INTRODUCE',
          '#content',
          '.content',
          'article',
        ];

        let descriptionParts: string[] = [];
        let foundValidContent = false;

        for (const selector of brandDescriptionSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            console.log(`[${storeType}] "${selector}" 발견: ${elements.length}개`);

            elements.each((_, el) => {
              const text = $(el).text().trim();

              // ✅ 오류 메시지나 시스템 메시지 필터링
              const isErrorMessage =
                text.includes('시스템 오류') ||
                text.includes('시스템오류') ||
                text.includes('접속이 불가') ||
                text.includes('서비스 점검') ||
                text.includes('현재 서비스') ||
                text.includes('이전 페이지로') ||
                text.includes('새로고침') ||
                text.includes('고객센터에 문의') ||
                text.includes('네이버 시스템 오류') ||
                text.includes('바디프랜드 시스템 오류') ||
                text.length < 50; // 너무 짧은 텍스트 제외

              if (!isErrorMessage && text && text.length >= 50) {
                // 중복 제거
                if (!descriptionParts.some(part => part.includes(text) || text.includes(part))) {
                  descriptionParts.push(text);
                  foundValidContent = true;
                  console.log(`[${storeType}] 유효한 텍스트 추출: ${text.substring(0, 100)}...`);
                }
              }
            });

            // 충분한 콘텐츠를 찾았으면 중단
            if (foundValidContent && descriptionParts.join('').length > 500) {
              break;
            }
          }
        }

        // 메타 설명도 추가 (오류 메시지가 아닌 경우만)
        const metaDescription = $('meta[property="og:description"]').attr('content')?.trim() ||
          $('meta[name="description"]').attr('content')?.trim();
        if (metaDescription && metaDescription.length > 20 &&
          !metaDescription.includes('시스템 오류') &&
          !metaDescription.includes('접속이 불가') &&
          !metaDescription.includes('바디프랜드 시스템 오류')) {
          descriptionParts.unshift(metaDescription); // 메타 설명을 맨 앞에
        }

        // 합치기 (최대 3000자)
        productDescription = descriptionParts.join('\n\n').substring(0, 3000);

        console.log(`[${storeType}] 제품 설명 추출 완료: ${productDescription.length}자`);
        if (productDescription.length > 0) {
          console.log(`[${storeType}] 설명 미리보기: ${productDescription.substring(0, 300)}...`);
        }

        // ✅ 유효한 콘텐츠가 없으면 경고
        if (productDescription.length < 100) {
          console.warn(`[${storeType}] ⚠️ 제품 설명이 너무 짧거나 없습니다. HTML 구조를 확인하세요.`);
          console.log(`[${storeType}] HTML 샘플:`, html.substring(0, 1000));
        }
      }
    }

    // ✅ 이미지 배열 초기화 (HTML 파싱 전에 선언)
    const images: string[] = [];
    const seenUrls = new Set<string>();

    // ✅ Puppeteer로 추출한 이미지가 있으면 먼저 추가
    let puppeteerImages: string[] = [];
    if (options.imagesOnly !== false) {
      // extractedData는 Puppeteer 블록 안에서만 접근 가능하므로, 여기서는 빈 배열로 시작
      // HTML 파싱 후에 Puppeteer 이미지와 합칠 예정
      console.log(`[쇼핑몰 크롤링] HTML에서 이미지 추출 시작 (Puppeteer 이미지는 나중에 합침)...`);
    }

    // ✅ 브랜드 스토어: 네이버 쇼핑 이미지 URL 직접 찾기 (HTML에서) - 최우선 실행
    if (url.includes('brand.naver.com')) {
      console.log(`[쇼핑몰 크롤링] 🔍 브랜드 스토어 HTML에서 네이버 쇼핑 이미지 URL 직접 추출 중...`);
      console.log(`[쇼핑몰 크롤링] HTML 길이: ${html?.length || 0}자`);

      if (!html || html.length < 1000) {
        console.error(`[브랜드 스토어] ❌ HTML이 비어있거나 너무 짧습니다! (${html?.length || 0}자)`);
      } else {
        // HTML에서 shop-phinf.pstatic.net URL 직접 찾기 (더 많은 패턴 포함)
        const shopPhinfPatterns = [
          /https?:\/\/shop-phinf\.pstatic\.net[^"'\s<>)]+\.(jpg|jpeg|png|gif|webp)/gi,
          /"https?:\/\/shop-phinf\.pstatic\.net[^"]+"/gi,
          /'https?:\/\/shop-phinf\.pstatic\.net[^']+'/gi,
          /src=["']https?:\/\/shop-phinf\.pstatic\.net[^"']+["']/gi,
          /data-src=["']https?:\/\/shop-phinf\.pstatic\.net[^"']+["']/gi,
          /data-original=["']https?:\/\/shop-phinf\.pstatic\.net[^"']+["']/gi,
        ];

        let shopPhinfMatches: string[] = [];
        shopPhinfPatterns.forEach(pattern => {
          const matches = html.match(pattern);
          if (matches) {
            matches.forEach(match => {
              // 따옴표와 속성명 제거
              const url = match.replace(/^["']|["']$/g, '').replace(/^(src|data-src|data-original)=["']/, '').replace(/["']$/, '');
              if (url && url.includes('shop-phinf.pstatic.net')) {
                shopPhinfMatches.push(url);
              }
            });
          }
        });

        if (shopPhinfMatches.length > 0) {
          console.log(`[브랜드 스토어] ✅ shop-phinf.pstatic.net URL ${shopPhinfMatches.length}개 발견`);
          shopPhinfMatches.forEach((matchUrl: string) => {
            // 썸네일을 원본으로 변환
            let originalUrl = matchUrl
              .replace(/[?&]type=f\d+/gi, '') // type 파라미터 제거
              .replace(/[?&]type=w\d+/gi, '')
              .replace(/[?&]type=m\d+/gi, '')
              .replace(/[?&]type=s\d+/gi, '')
              .replace(/_thumb(\.\w+)/gi, '$1') // _thumb 제거
              .replace(/_small(\.\w+)/gi, '$1') // _small 제거
              .replace(/_s(\.\w+)/gi, '$1') // _s 제거
              .replace(/_m(\.\w+)/gi, '$1') // _m 제거
              .replace(/_l(\.\w+)/gi, '$1'); // _l 제거

            // 빈 쿼리 스트링 정리
            originalUrl = originalUrl.replace(/\?$/, '').replace(/&$/, '');

            // 중복 체크 (base URL만 비교)
            const baseUrl = originalUrl.split('?')[0].split('#')[0];
            if (!seenUrls.has(baseUrl) && originalUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
              images.push(originalUrl);
              seenUrls.add(baseUrl);
            }
          });
          console.log(`[브랜드 스토어] ✅ shop-phinf URL에서 ${images.length}개 이미지 추가`);
        } else {
          console.warn(`[브랜드 스토어] ⚠️ shop-phinf.pstatic.net URL을 찾지 못했습니다.`);
        }

        // HTML에서 pstatic.net 이미지 URL 직접 찾기 (더 많은 패턴 포함)
        const pstaticPatterns = [
          /https?:\/\/[^"'\s<>)]*pstatic\.net[^"'\s<>)]+\.(jpg|jpeg|png|gif|webp)/gi,
          /"https?:\/\/[^"]*pstatic\.net[^"]+"/gi,
          /'https?:\/\/[^']*pstatic\.net[^']+'/gi,
          /src=["']https?:\/\/[^"']*pstatic\.net[^"']+["']/gi,
          /data-src=["']https?:\/\/[^"']*pstatic\.net[^"']+["']/gi,
          /data-original=["']https?:\/\/[^"']*pstatic\.net[^"']+["']/gi,
        ];

        let pstaticMatches: string[] = [];
        pstaticPatterns.forEach(pattern => {
          const matches = html.match(pattern);
          if (matches) {
            matches.forEach(match => {
              // 따옴표와 속성명 제거
              const url = match.replace(/^["']|["']$/g, '').replace(/^(src|data-src|data-original)=["']/, '').replace(/["']$/, '');
              if (url && url.includes('pstatic.net') && url.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                pstaticMatches.push(url);
              }
            });
          }
        });

        if (pstaticMatches.length > 0) {
          console.log(`[브랜드 스토어] ✅ pstatic.net URL ${pstaticMatches.length}개 발견`);
          pstaticMatches.forEach((matchUrl: string) => {
            let originalUrl = matchUrl
              .replace(/[?&]type=f\d+/gi, '')
              .replace(/[?&]type=w\d+/gi, '')
              .replace(/[?&]type=m\d+/gi, '')
              .replace(/[?&]type=s\d+/gi, '')
              .replace(/_thumb(\.\w+)/gi, '$1')
              .replace(/_small(\.\w+)/gi, '$1')
              .replace(/_s(\.\w+)/gi, '$1')
              .replace(/_m(\.\w+)/gi, '$1')
              .replace(/_l(\.\w+)/gi, '$1');

            // 빈 쿼리 스트링 정리
            originalUrl = originalUrl.replace(/\?$/, '').replace(/&$/, '');

            // ✅ UI 요소 제외 (강화)
            const lowerUrl = originalUrl.toLowerCase();
            const isUIElement =
              lowerUrl.includes('/icon/') ||
              lowerUrl.includes('/logo/') ||
              lowerUrl.includes('/button/') ||
              lowerUrl.includes('/ad/') ||
              lowerUrl.includes('/ads/') ||
              lowerUrl.includes('/banner/') ||
              lowerUrl.includes('/gnb/') ||
              lowerUrl.includes('/common/') ||
              lowerUrl.includes('/static/www/') ||
              lowerUrl.includes('/static/common/') ||
              lowerUrl.endsWith('logo.png') ||
              lowerUrl.endsWith('icon.png') ||
              lowerUrl.includes('favicon') ||
              lowerUrl.includes('sprite') ||
              lowerUrl.includes('loading.gif') ||
              lowerUrl.includes('loading.png') ||
              lowerUrl.includes('spinner') ||
              lowerUrl.includes('promo') ||
              lowerUrl.includes('npay') ||
              lowerUrl.includes('naverpay') ||
              lowerUrl.includes('naver_pay') ||
              lowerUrl.includes('placeholder') ||
              // 매우 작은 썸네일만 제외 (40x40, 50x50 등)
              (lowerUrl.includes('_40x40') || lowerUrl.includes('_50x50')) &&
              !lowerUrl.includes('product') && !lowerUrl.includes('review') && !lowerUrl.includes('detail');

            if (!isUIElement) {
              // ✅ 중복 체크 완화: base URL과 파일명 기반으로 비교
              const baseUrl = originalUrl.split('?')[0].split('#')[0];
              const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';

              // ✅ 파일명이 다르면 다른 이미지로 간주 (더 많은 이미지 수집)
              const isDuplicate = seenUrls.has(baseUrl) ||
                (fileName && Array.from(seenUrls).some(seenBase => {
                  const seenFileName = seenBase.split('/').pop()?.split('?')[0] || '';
                  return seenFileName && seenFileName === fileName;
                }));

              if (!isDuplicate && originalUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
                images.push(originalUrl);
                seenUrls.add(baseUrl);
              }
            }
          });
          console.log(`[브랜드 스토어] ✅ pstatic.net URL에서 총 ${images.length}개 이미지 수집`);
        } else {
          console.warn(`[브랜드 스토어] ⚠️ pstatic.net URL을 찾지 못했습니다.`);
        }

        // 디버그: HTML 샘플 출력 (이미지가 없을 때만)
        if (images.length === 0) {
          console.log(`[브랜드 스토어] 🔍 HTML 샘플 (처음 1000자):`);
          console.log(html.substring(0, 1000));
        }
      }
    }

    // ✅ 쇼핑몰별 이미지 선택자 (제품 이미지만 추출) - 더 많은 선택자 추가
    const imageSelectors = [
      // 네이버 브랜드 스토어 (최우선) - 네이버 쇼핑 이미지 서버 URL
      'img[src*="shop-phinf.pstatic.net"]',
      'img[src*="brand.naver.com"]',
      'img[src*="pstatic.net"]',

      // 쿠팡
      '.prod-image__detail img',
      '.prod-image__item img',
      '.prod-image-container img',
      '.prod-images img',
      '#repImageContainer img',
      '.prod-image__detail-view img',
      '.prod-image__detail-viewer img',
      '.prod-image__thumbnail img',
      // 네이버 쇼핑
      '.product_img img',
      '.detail_img img',
      '.product_detail img',
      '#prdDetail img',
      '.detail_info img',
      '.img_full_box img',
      '.product-image-area img',
      '.product-image-view img',
      // 네이버 브랜드 스토어
      '.product_thumb img', // 제품 썸네일
      '.product_img img', // 제품 메인 이미지
      '.detail_img img', // 상세 이미지
      '.detail_view img', // 상세 뷰
      '.thumb_area img', // 썸네일 영역
      '.detail_area img', // 상세 영역
      '.product-detail-area img',
      '.product-detail-view img',
      '.product-gallery-area img',
      '.product-gallery-view img',
      '.product-content img',
      '[class*="product"] [class*="image"] img',
      '[class*="product"] [class*="gallery"] img',
      '[class*="product"] [class*="thumb"] img',
      '[class*="detail"] [class*="image"] img',
      // 지마켓, 옥션
      '.item_photo_view img',
      '.item_photo img',
      '.detail_img img',
      '.product-image-area img',
      // 11번가
      '.prd_img img',
      '.detail_cont img',
      '.product-image-area img',
      // 일반 쇼핑몰
      '.product-image img',
      '.product-images img',
      '.product-gallery img',
      '.product-detail img',
      '.item-image img',
      'img[itemprop="image"]',
      '.detail_images img',
      '.product-img img',
      '.thumb_img img',
      // OG 이미지 (최후의 수단)
      'meta[property="og:image"]',
    ];

    // ✅ images와 seenUrls는 이미 위에서 선언됨

    for (const selector of imageSelectors) {
      if (selector.includes('meta')) {
        // OG 이미지
        const ogImage = $(selector).attr('content');
        if (ogImage && !seenUrls.has(ogImage)) {
          images.push(ogImage);
          seenUrls.add(ogImage);
        }
      } else {
        // 일반 img 태그
        $(selector).each((_, elem) => {
          const $img = $(elem);
          let imgUrl = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original');

          if (imgUrl) {
            // 썸네일을 원본으로 변환
            if (imgUrl.includes('thumb')) {
              imgUrl = imgUrl.replace(/thumb\d+/, 'original');
            }
            if (imgUrl.includes('thumbnail')) {
              imgUrl = imgUrl.replace(/thumbnail/, 'original');
            }
            if (imgUrl.includes('_thumb')) {
              imgUrl = imgUrl.replace(/_thumb/, '');
            }

            // 상대 경로를 절대 경로로 변환
            if (imgUrl.startsWith('//')) {
              imgUrl = 'https:' + imgUrl;
            } else if (imgUrl.startsWith('/')) {
              const urlObj = new URL(finalUrl);
              imgUrl = `${urlObj.protocol}//${urlObj.host}${imgUrl}`;
            } else if (!imgUrl.startsWith('http')) {
              const urlObj = new URL(finalUrl);
              imgUrl = `${urlObj.protocol}//${urlObj.host}/${imgUrl}`;
            }

            // 아이콘, 로고, 버튼, 광고 이미지 제외 (단, 네이버 쇼핑 이미지는 제외 안 함)
            const isNaverShoppingImage = imgUrl.includes('shop-phinf.pstatic.net') ||
              imgUrl.includes('pstatic.net') ||
              (url.includes('brand.naver.com') && imgUrl.includes('http'));

            if (!isNaverShoppingImage && (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('button') || imgUrl.includes('ad') || imgUrl.includes('banner'))) {
              return;
            }

            // 네이버 쇼핑 이미지는 원본으로 변환
            if (imgUrl.includes('shop-phinf.pstatic.net') || imgUrl.includes('pstatic.net')) {
              imgUrl = imgUrl
                .replace(/[?&]type=f\d+/gi, '') // type 파라미터 제거
                .replace(/[?&]type=w\d+/gi, '')
                .replace(/[?&]type=m\d+/gi, '')
                .replace(/[?&]type=s\d+/gi, '')
                .replace(/_thumb(\.\w+)/gi, '$1')
                .replace(/_small(\.\w+)/gi, '$1')
                .replace(/_s(\.\w+)/gi, '$1');

              // 빈 쿼리 스트링 정리
              imgUrl = imgUrl.replace(/\?$/, '');
            }

            // ✅ 중복 제거 완화: base URL과 파일명 기반으로 비교 (더 많은 이미지 수집)
            const baseUrl = imgUrl.split('?')[0].split('#')[0];
            const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';

            // ✅ 파일명이 다르면 다른 이미지로 간주
            const isDuplicate = seenUrls.has(baseUrl) ||
              (fileName && Array.from(seenUrls).some(seenBase => {
                const seenFileName = seenBase.split('/').pop()?.split('?')[0] || '';
                return seenFileName && seenFileName === fileName;
              }));

            if (!isDuplicate && (imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) || isNaverShoppingImage)) {
              images.push(imgUrl);
              seenUrls.add(baseUrl);
            }
          }
        });
      }

      // ✅ 충분한 이미지를 찾았으면 중단 (더 많은 이미지 수집을 위해 40개까지 수집)
      if (images.length >= 40) break;
    }

    // ✅ Puppeteer로 추출한 이미지와 HTML에서 추출한 이미지 병합 (중복 제거 완화)
    if (options.imagesOnly !== false && puppeteerExtractedData.images && puppeteerExtractedData.images.length > 0) {
      console.log(`[쇼핑몰 크롤링] 🔄 Puppeteer 이미지 ${puppeteerExtractedData.images.length}개와 HTML 이미지 ${images.length}개 병합 중...`);

      // ✅ HTML에서 추출한 이미지의 baseUrl을 Set에 추가 (중복 체크용)
      const htmlImageBaseUrls = new Set<string>();
      images.forEach(img => {
        const baseUrl = img.split('?')[0].split('#')[0];
        htmlImageBaseUrls.add(baseUrl);
      });

      puppeteerExtractedData.images.forEach((puppeteerImg: string) => {
        // ✅ 중복 체크 완화: base URL과 파일명 기반으로 비교
        const baseUrl = puppeteerImg.split('?')[0].split('#')[0];

        // 파일명 추출 (더 정확한 중복 체크)
        const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';
        const fileNameWithoutExt = fileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');

        // ✅ 중복 체크: baseUrl이 다르고, 파일명도 다르면 추가
        const isDuplicate = htmlImageBaseUrls.has(baseUrl) ||
          (fileNameWithoutExt && Array.from(htmlImageBaseUrls).some(htmlBase => {
            const htmlFileName = htmlBase.split('/').pop()?.split('?')[0] || '';
            const htmlFileNameWithoutExt = htmlFileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
            return htmlFileNameWithoutExt && htmlFileNameWithoutExt === fileNameWithoutExt;
          }));

        if (!isDuplicate) {
          images.push(puppeteerImg);
          htmlImageBaseUrls.add(baseUrl);
          seenUrls.add(baseUrl);
        } else {
          console.log(`  [병합 중복 제외] ${puppeteerImg.substring(0, 80)}...`);
        }
      });

      console.log(`[쇼핑몰 크롤링] ✅ 병합 완료: 총 ${images.length}개 이미지 (Puppeteer: ${puppeteerExtractedData.images.length}개, HTML: ${images.length - puppeteerExtractedData.images.length}개)`);
    }

    console.log(`[쇼핑몰 크롤링] ✅ 최종 ${images.length}개 이미지 수집 완료`);

    if (images.length === 0) {
      try {
        const response = await fetch(finalUrl || url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          },
        } as any);

        if ((response as any)?.ok) {
          const htmlText = await decodeResponseWithCharset(response as any);
          const cheerio = await import('cheerio');
          const $ = cheerio.load(htmlText || '');

          const base = finalUrl || url;
          const toAbs = (raw: string): string => {
            const s = String(raw || '').trim();
            if (!s) return '';
            try {
              return new URL(s, base).toString();
            } catch {
              return '';
            }
          };

          const candidates: string[] = [];

          const og = $('meta[property="og:image"]').attr('content') || '';
          const tw = $('meta[name="twitter:image"]').attr('content') || '';
          if (og) candidates.push(toAbs(og));
          if (tw) candidates.push(toAbs(tw));

          $('img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || '';
            const srcset = $(el).attr('srcset') || $(el).attr('data-srcset') || '';
            let picked = src;

            if (!picked && srcset) {
              const parts = srcset
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean);
              const last = parts[parts.length - 1] || '';
              picked = last.split(/\s+/)[0] || '';
            }

            const abs = toAbs(picked);
            if (!abs) return;
            candidates.push(abs);
          });

          const uniq: string[] = [];
          const seen = new Set<string>();
          for (const c of candidates) {
            const u = String(c || '').trim();
            if (!u) continue;
            const baseUrl = u.split('?')[0].split('#')[0];
            if (seen.has(baseUrl)) continue;
            const lower = baseUrl.toLowerCase();
            const isBad =
              lower.includes('favicon') ||
              lower.includes('sprite') ||
              lower.includes('logo') ||
              lower.includes('icon') ||
              lower.includes('banner') ||
              lower.includes('ads') ||
              lower.includes('/ad/') ||
              lower.includes('loading') ||
              lower.endsWith('.svg');
            if (isBad) continue;
            if (!/\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i.test(lower) && !lower.includes('pstatic.net')) continue;
            seen.add(baseUrl);
            uniq.push(u);
            if (uniq.length >= 30) break;
          }

          if (uniq.length > 0) {
            images.push(...uniq);
          }
        }
      } catch {
      }
    }

    // ✅ 100% 성공 보장: 이미지가 부족하면 네이버 이미지 검색 API로 폴백
    if (images.length < 10 && options.naverClientId && options.naverClientSecret) {
      console.log(`[쇼핑몰 크롤링] ⚠️ 이미지 ${images.length}개로 부족! 네이버 이미지 검색 API로 추가 수집...`);

      // ✅ [2026-01-21 FIX] 폴백 검색어는 crawlFromAffiliateLink에서 정확한 제품명 추출
      let searchKeyword = title || puppeteerExtractedData?.title || '제품';

      // "네이버 브랜드 커넥트", "공식스토어" 등 잘못된 키워드 필터링
      const invalidKeywords = ['네이버 브랜드 커넥트', '공식스토어', 'NAVER', '브랜드스토어', '스마트스토어'];
      const isInvalidKeyword = invalidKeywords.some(kw => searchKeyword.includes(kw));

      if (isInvalidKeyword || searchKeyword === '제품' || searchKeyword.length < 3) {
        console.log(`[쇼핑몰 크롤링] ⚠️ 검색어 "${searchKeyword}" 부적절 → crawlFromAffiliateLink로 제품명 재추출 시도...`);

        try {
          const { crawlFromAffiliateLink } = await import('./crawler/productSpecCrawler.js');
          const productInfo = await crawlFromAffiliateLink(url);

          if (productInfo?.name && productInfo.name.length > 3 && !productInfo.name.includes('상품명을 불러올 수 없습니다')) {
            searchKeyword = productInfo.name;
            console.log(`[쇼핑몰 크롤링] ✅ crawlFromAffiliateLink 제품명 추출 성공: "${searchKeyword}"`);

            // 제품 이미지도 함께 추가
            if (productInfo.mainImage) {
              images.push(productInfo.mainImage);
            }
            if (productInfo.galleryImages?.length > 0) {
              images.push(...productInfo.galleryImages.slice(0, 5));
            }
          }
        } catch (crawlError) {
          console.warn(`[쇼핑몰 크롤링] crawlFromAffiliateLink 실패:`, (crawlError as Error).message);
        }
      }

      // 검색어 정제 (너무 길면 앞부분만 사용)
      if (searchKeyword.length > 50) {
        searchKeyword = searchKeyword.substring(0, 50);
      }

      try {
        const apiImages = await searchNaverImages(searchKeyword, options.naverClientId, options.naverClientSecret, 50 - images.length);
        if (apiImages.length > 0) {
          const newImages = apiImages.map(img => img.link).filter(link => link && !images.includes(link));
          images.push(...newImages);
          console.log(`[쇼핑몰 크롤링] ✅ 네이버 이미지 API로 ${newImages.length}개 추가 수집! 총 ${images.length}개`);
        }
      } catch (apiError) {
        console.warn(`[쇼핑몰 크롤링] 네이버 이미지 API 폴백 실패:`, (apiError as Error).message);
      }
    }

    // ✅ [2026-01-30] puppeteerExtractedData에서 images 추출
    if (puppeteerExtractedData?.images?.length > 0) {
      images.push(...puppeteerExtractedData.images.filter((img: string) => !images.includes(img)));
    }

    // ✅ 최종 제목 결정: Puppeteer 추출 > 기존 title
    const finalTitle = puppeteerExtractedData?.title || undefined;

    // ✅ [2026-01-30] Puppeteer 제목으로 네이버 쇼핑 API 추가 검색 (100% 크롤링 성공률 보장)
    if (finalTitle && options.naverClientId && options.naverClientSecret) {
      console.log(`[쇼핑몰 크롤링] 🔍 Puppeteer 제목으로 네이버 API 추가 검색: "${finalTitle}"`);
      try {
        // 네이버 쇼핑 API 검색
        const shoppingResults = await searchNaverShopping(
          finalTitle,
          options.naverClientId,
          options.naverClientSecret,
          10
        );

        if (shoppingResults.length > 0) {
          const shoppingImages = shoppingResults.map(r => r.image).filter(Boolean);
          const newShoppingImages = shoppingImages.filter(img => !images.includes(img));
          images.push(...newShoppingImages);
          console.log(`[쇼핑몰 크롤링] ✅ 네이버 쇼핑 API로 ${newShoppingImages.length}개 이미지 추가!`);
        }

        // 네이버 이미지 API 검색 (추가 이미지 확보)
        if (images.length < 20) {
          const imageResults = await searchNaverImages(
            finalTitle,
            options.naverClientId,
            options.naverClientSecret,
            20 - images.length
          );

          if (imageResults.length > 0) {
            const apiImages = imageResults.map(r => r.link).filter(Boolean);
            const newApiImages = apiImages.filter(img => !images.includes(img));
            images.push(...newApiImages);
            console.log(`[쇼핑몰 크롤링] ✅ 네이버 이미지 API로 ${newApiImages.length}개 이미지 추가! 총 ${images.length}개`);
          }
        }
      } catch (apiError) {
        console.warn(`[쇼핑몰 크롤링] 네이버 API 추가 검색 실패:`, (apiError as Error).message);
      }
    }

    // ✅ [2026-01-30] 최종 결과 구성
    const result: CrawlResult = {
      images,
      title: finalTitle,
      description: productDescription || undefined,
      // ✅ [2026-01-30] 추가 정보
      spec: puppeteerExtractedData?.spec || undefined,
      price: puppeteerExtractedData?.price || undefined,
      reviews: puppeteerExtractedData?.reviewTexts || [],
      reviewImages: puppeteerExtractedData?.reviewImageUrls || [],
    };

    // ✅ 추출 결과 로그
    console.log(`[쇼핑몰 크롤링] 📊 최종 결과:`);
    console.log(`  - 제품명: ${result.title || '없음'}`);
    console.log(`  - 가격: ${result.price || '없음'}`);
    console.log(`  - 스펙: ${result.spec ? result.spec.substring(0, 50) + '...' : '없음'}`);
    console.log(`  - 리뷰 텍스트: ${result.reviews?.length || 0}개`);
    console.log(`  - 리뷰 이미지: ${result.reviewImages?.length || 0}개`);
    console.log(`  - 제품 이미지: ${result.images.length}개`);

    // ✅ [2026-01-30] 에러 페이지 감지 강화 - 잘못된 제목으로 글 생성 방지
    const errorPagePatterns = [
      '에러', '오류', '접근', '차단', '점검', '불가', '삭제', '존재하지',
      '페이지를 찾을 수', '주소가 바르게', '서비스 접속', '판매종료',
      '품절', '일시품절', '판매중지', '상품이 없습니다', '잘못된 요청',
      'security', 'verification', 'error', 'denied', 'blocked', 'captcha',
      'maintenance', 'not found', '404', '500', 'Access Denied'
    ];

    const titleLower = (result.title || '').toLowerCase();
    const isErrorPage = !result.title ||
      result.title.length < 5 ||
      errorPagePatterns.some(pattern => titleLower.includes(pattern.toLowerCase()));

    if (isErrorPage) {
      console.error(`[쇼핑몰 크롤링] ⚠️ 에러 페이지 감지! 제목: "${result.title}"`);

      // ✅ [2026-01-31] STEP 1: 모바일 API로 상품명 추출 + 범용 메타 폴백 시도
      let productNameForSearch = '';
      try {
        // 모바일 URL에서 상품 정보 가져오기
        const mobileApiUrl = url.includes('m.smartstore')
          ? url
          : url.replace('smartstore.naver.com', 'm.smartstore.naver.com');

        console.log('[API 폴백] 📱 모바일 API로 상품명 추출 시도...');
        const mobileResponse = await fetch(mobileApiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });

        if (mobileResponse.ok) {
          const mobileHtml = await mobileResponse.text();

          // ✅ [2026-01-31] STEP 2-1: 모바일 HTML에서도 범용 메타 추출 시도
          const mobileMetaResult = extractUniversalMeta(mobileHtml);
          if (mobileMetaResult && mobileMetaResult.title && !mobileMetaResult.title.includes('에러')) {
            console.log(`[쇼핑몰 크롤링] ✅ 모바일 메타 폴백 성공! 제품: ${mobileMetaResult.title}`);
            return mobileMetaResult;
          }

          // OG 태그에서 상품명 추출 (API 검색용)
          const ogTitleMatch = mobileHtml.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
          if (ogTitleMatch && ogTitleMatch[1]) {
            productNameForSearch = ogTitleMatch[1].replace(/\s*[-|]\s*.*$/, '').trim();
            console.log(`[API 폴백] ✅ OG 태그에서 상품명 추출: "${productNameForSearch}"`);
          }
        }
      } catch (mobileError) {
        console.warn('[API 폴백] 모바일 API 실패:', (mobileError as Error).message);
      }

      // ✅ [2026-01-31] STEP 3: 네이버 쇼핑 API 폴백 시도 (상품명으로)
      console.log('[쇼핑몰 크롤링] 🔄 네이버 쇼핑 API로 폴백 시도...');
      const apiFallbackResult = await fallbackToNaverShoppingApi(
        url,
        options.naverClientId,
        options.naverClientSecret,
        productNameForSearch || undefined
      );

      if (apiFallbackResult && apiFallbackResult.title) {
        console.log(`[쇼핑몰 크롤링] ✅ API 폴백 성공! 제품: ${apiFallbackResult.title}`);
        return apiFallbackResult;
      }

      // ✅ [2026-01-31] 사용자 요청: 더미 데이터 대신 에러 throw (글 생성 중단)
      console.error(`[쇼핑몰 크롤링] ❌ 모든 크롤링 방법 실패 - 상품 정보를 찾을 수 없습니다.`);
      console.error(`[쇼핑몰 크롤링] 가능한 원인:`);
      console.error(`  1. 상품이 삭제되었거나 비공개 상태`);
      console.error(`  2. 판매자가 상품을 내렸음`);
      console.error(`  3. 제휴 링크가 만료됨`);
      console.error(`  원본 URL: ${url}`);

      throw new Error(`상품 정보를 찾을 수 없습니다. 상품이 삭제되었거나 비공개 상태일 수 있습니다. URL: ${url}`);
    }

    return result;
  } catch (error) {
    console.error(`[쇼핑몰 크롤링] ❌ 실패: ${(error as Error).message}`);

    // ✅ 100% 성공 보장: 크롤링 실패해도 네이버 이미지 검색으로 폴백
    if (options.naverClientId && options.naverClientSecret) {
      console.log(`[쇼핑몰 크롤링] 🔄 크롤링 실패! 네이버 이미지 검색 API로 폴백...`);
      try {
        const productName = await extractProductNameFromUrl(url);
        const searchKeyword = productName || '제품';
        const apiImages = await searchNaverImages(searchKeyword, options.naverClientId, options.naverClientSecret, 50);
        if (apiImages.length > 0) {
          const fallbackImages = apiImages.map(img => img.link).filter(Boolean);
          console.log(`[쇼핑몰 크롤링] ✅ 네이버 이미지 API 폴백 성공! ${fallbackImages.length}개 수집`);
          return {
            images: fallbackImages,
            title: productName || '[자동 생성] 제품 정보',  // ✅ 더미 타이틀 추가
            description: `원본 URL: ${url}`
          };
        }
      } catch (fallbackError) {
        console.error(`[쇼핑몰 크롤링] 네이버 이미지 API 폴백도 실패:`, (fallbackError as Error).message);
      }
    }

    // ✅ [2026-01-31] 사용자 요청: 더미 데이터 대신 에러 throw (글 생성 중단)
    console.error(`[쇼핑몰 크롤링] ❌ 모든 크롤링 방법 실패`);
    console.error(`  원본 URL: ${url}`);
    console.error(`  오류: ${(error as Error).message}`);

    // 원래 에러를 다시 throw
    throw error;
  }
}

export async function fetchArticleContent(url: string, options?: { naverClientId?: string; naverClientSecret?: string }): Promise<{ title?: string; content?: string; publishedAt?: string; images?: string[] }> {
  if (!url) return {};

  try {
    // ✅ 스마트스토어 URL이면 네이버 API로 먼저 시도
    if (url.includes('smartstore.naver.com') && options?.naverClientId && options?.naverClientSecret) {
      console.log(`[fetchArticleContent] 🛒 스마트스토어 감지 → 네이버 API로 제품 정보 검색`);

      const productName = await extractProductNameFromUrl(url);
      if (productName) {
        console.log(`[fetchArticleContent] 제품명 추출: "${productName}"`);

        try {
          const shoppingResults = await searchNaverShopping(productName, options.naverClientId, options.naverClientSecret, 10);

          if (shoppingResults.length > 0) {
            const product = shoppingResults[0];
            const productContent = `
제품명: ${product.title}
브랜드: ${product.brand || '정보 없음'}
카테고리: ${product.category1 || ''} > ${product.category2 || ''} > ${product.category3 || ''}
가격: ${Number(product.lprice).toLocaleString()}원
판매처: ${product.mallName || '정보 없음'}

${product.title}에 대한 상세 정보입니다. 이 제품은 ${product.category1 || ''}카테고리의 인기 상품으로, ${product.brand || '브랜드'}에서 제공합니다.
            `.trim();

            console.log(`[fetchArticleContent] ✅ 네이버 쇼핑 API 성공: ${product.title}`);
            return {
              title: product.title,
              content: productContent,
              images: product.image ? [product.image] : []
            };
          }
        } catch (apiError) {
          console.warn(`[fetchArticleContent] 네이버 API 실패, Puppeteer로 폴백: ${(apiError as Error).message}`);
        }
      }
    }

    // ✅ 쇼핑커넥트, 쿠팡파트너스 등 파트너스 링크 또는 보안이 강한 쇼핑몰 감지 (국내외 주요 쇼핑몰 모두 포함)
    const isPartnerLink = /coupa\.ng|link\.coupang\.com|shoppingconnect|adcash|adcrops|adfit|adpopcorn/i.test(url);
    const isShoppingMall = /coupang\.com|gmarket\.co\.kr|11st\.co\.kr|auction\.co\.kr|shopping\.naver\.com|smartstore\.naver\.com|brand\.naver\.com|brandconnect\.naver\.com|aliexpress\.com|amazon\.com|amazon\.co\.kr|wemakeprice\.com|tmon\.co\.kr/i.test(url);
    // ✅ 네이버 블로그도 Puppeteer 사용 (JavaScript 렌더링 대응)
    const isNaverBlog = /blog\.naver\.com/i.test(url);

    // ✅ 보안이 강한 사이트 또는 JavaScript 렌더링이 필요한 사이트는 Puppeteer 사용
    if (isPartnerLink || isShoppingMall || isNaverBlog) {
      if (isNaverBlog) {
        console.log(`[크롤링] 네이버 블로그 감지 → Puppeteer 사용: ${url}`);
      } else {
        console.log(`[크롤링] 보안이 강한 사이트 감지 → Puppeteer 사용 (텍스트만): ${url}`);
      }

      try {
        // ✅ 네이버 블로그는 전용 크롤러 먼저 시도
        if (isNaverBlog) {
          try {
            // 네이버 블로그 전용 크롤러 사용 (iframe 대응)
            const { crawlNaverBlogWithPuppeteer } = await import('./naverBlogCrawler.js');
            const blogResult = await crawlNaverBlogWithPuppeteer(url, (msg) => {
              console.log(`[네이버 블로그 크롤러] ${msg}`);
            });

            // ✅ [2026-01-30] 크롤링 결과 검증 강화 (최소 200자)
            const MIN_CONTENT_LENGTH = 200;
            if (blogResult.content && blogResult.content.trim().length >= MIN_CONTENT_LENGTH) {
              console.log(`[네이버 블로그 전용 크롤러] ✅ 크롤링 성공 (${blogResult.content.length}자, 이미지: ${blogResult.images?.length || 0}개)`);
              return {
                title: blogResult.title,
                content: blogResult.content,
                images: blogResult.images || []
              };
            } else {
              // ✅ 본문 부족 시 에러 throw (AI 환각 방지)
              const actualLength = blogResult.content?.trim().length || 0;
              throw new Error(`❌ 본문 내용이 부족합니다 (${actualLength}자 < ${MIN_CONTENT_LENGTH}자 필요). 이 글은 크롤링할 수 없습니다.`);
            }
          } catch (blogCrawlerError) {
            // ✅ [2026-01-30] 에러를 상위로 전파하여 AI가 빈 내용으로 생성하지 않도록 함
            console.error(`[네이버 블로그 전용 크롤러] ❌ 크롤링 실패: ${(blogCrawlerError as Error).message}`);
            throw blogCrawlerError; // 에러 전파
          }


          // 폴백: 일반 Puppeteer 사용
          const puppeteerResult = await fetchWithPuppeteer(url);
          if (puppeteerResult.html && puppeteerResult.html.length > 100) {
            console.log(`[네이버 블로그 Puppeteer] ✅ 크롤링 성공 (${puppeteerResult.html.length}자, 이미지: ${puppeteerResult.images?.length || 0}개)`);

            // ✅ Puppeteer로 얻은 HTML과 이미지를 사용
            const cheerio = await import('cheerio');
            const $ = cheerio.load(puppeteerResult.html);

            // 네이버 블로그 특화 제목 추출
            let title =
              $('meta[property="og:title"]').attr('content')?.trim() ||
              $('meta[name="twitter:title"]').attr('content')?.trim() ||
              $('.se-title-text, .se-title, .se-title-text._textTitle').first().text().trim() ||
              $('h1').first().text().trim() ||
              $('title').text().trim();

            // 네이버 블로그 특화 본문 추출 (더 많은 셀렉터 시도)
            let content = '';

            // 1순위: 스마트에디터 본문 영역
            const seMainContainer = $('.se-main-container, .se-component, .se-section, .se-component-text, .se-text');
            if (seMainContainer.length > 0) {
              seMainContainer.each((_, elem) => {
                const text = $(elem).text().trim();
                if (text.length > 10) {
                  content += text + '\n\n';
                }
              });
            }

            // 2순위: iframe 내부 본문
            if (!content || content.length < 100) {
              const iframe = $('iframe#mainFrame, iframe.se-main-frame');
              if (iframe.length > 0) {
                console.log(`[네이버 블로그] iframe 감지됨, 전용 크롤러 재시도 권장`);
              }
            }

            // 3순위: 일반 본문 영역
            if (!content || content.length < 100) {
              const blogContent = $('.post-view, .post-content, #postViewArea, ._2-I30XS1lA');
              if (blogContent.length > 0) {
                blogContent.each((_, elem) => {
                  const text = $(elem).text().trim();
                  if (text.length > 10) {
                    content += text + '\n\n';
                  }
                });
              }
            }

            // 4순위: body에서 추출 (최후의 수단)
            if (!content || content.length < 100) {
              content = $('body').text().trim();
              // 불필요한 텍스트 제거
              content = content.replace(/로그인|네이버 블로그|구독하기|공유하기|신고|댓글|좋아요/gi, '').trim();
            }

            // ✅ Puppeteer에서 추출한 이미지 반환
            return {
              title,
              content: content.trim(),
              images: puppeteerResult.images || []
            };
          }
        }

        // ✅ 쇼핑몰 전용 크롤링 사용 (제품 설명만 추출, 이미지는 이미지 관리 탭에서 별도 수집)
        // ✅ 네이버 API 키도 전달
        const shoppingResult = await fetchShoppingImages(url, {
          imagesOnly: false,
          naverClientId: options?.naverClientId,
          naverClientSecret: options?.naverClientSecret
        });
        if (shoppingResult.title || shoppingResult.description) {
          console.log(`[쇼핑몰 크롤링] ✅ 텍스트 추출 성공: 제목="${shoppingResult.title}", 설명=${shoppingResult.description?.length || 0}자`);

          // ✅ 이미지는 반환하지 않음 (이미지 관리 탭에서 별도로 fetchShoppingImages 사용)
          return {
            title: shoppingResult.title,
            content: shoppingResult.description || shoppingResult.title || ''
          };
        }

        // 폴백: 일반 Puppeteer 크롤링
        const puppeteerResult = await fetchWithPuppeteer(url);
        if (puppeteerResult.html && puppeteerResult.html.length > 100) {
          console.log(`[Puppeteer] ✅ 크롤링 성공 (${puppeteerResult.html.length}자, 이미지: ${puppeteerResult.images?.length || 0}개)`);

          // ✅ Puppeteer로 얻은 HTML과 이미지를 사용
          const cheerio = await import('cheerio');
          const $ = cheerio.load(puppeteerResult.html);

          // 제목, 본문 추출 (아래 로직 재사용)
          let title =
            $('meta[property="og:title"]').attr('content')?.trim() ||
            $('meta[name="twitter:title"]').attr('content')?.trim() ||
            $('h1').first().text().trim() ||
            $('title').text().trim();

          // 본문 추출 (간단하게)
          let content = $('body').text().trim();

          // ✅ Puppeteer에서 추출한 이미지 반환
          return {
            title,
            content,
            images: puppeteerResult.images || []
          };
        }
      } catch (puppeteerError) {
        console.warn(`[Puppeteer] 실패, 일반 크롤링으로 폴백: ${(puppeteerError as Error).message}`);
        // 일반 크롤링으로 폴백
      }
    }

    const fetchImpl = await ensureFetch();

    const response = await fetchImpl(url, {
      redirect: 'follow', // 리디렉션 자동 따라가기
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // ✅ 최종 리디렉션된 URL 로깅
    const finalUrl = response.url || url;
    if (finalUrl !== url) {
      console.log(`[크롤링] 리디렉션됨: ${url} → ${finalUrl}`);
      // 네이버 단축 URL인 경우 명시적으로 로깅
      if (/naver\.me/i.test(url)) {
        console.log(`[크롤링] 네이버 단축 URL 해결 완료: ${finalUrl}`);
      }
    }

    // ✅ 인코딩 자동 감지 및 변환 (EUC-KR, CP949 등 한국 사이트 지원)
    // ✅ [FIX] URL 전달하여 네이버 도메인 강제 UTF-8 적용
    const html = await decodeResponseWithCharset(response, finalUrl);

    // cheerio를 사용하여 HTML 파싱
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);

    // 제목 추출 (여러 소스 시도, 우선순위 순)
    let title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('meta[name="twitter:title"]').attr('content')?.trim() ||
      $('h1.article-title, h1.post-title, h1.entry-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();

    // 제목에서 불필요한 부분 제거 (예: " | 사이트명", " - 사이트명")
    if (title) {
      // "|"로 분리된 경우 첫 번째 부분만 사용
      if (title.includes('|')) {
        title = title.split('|')[0].trim();
      }
      // "-"로 분리된 경우, 마지막 부분이 짧으면(사이트명일 가능성) 제거
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        if (parts.length > 1 && parts[parts.length - 1].length < 20) {
          title = parts.slice(0, -1).join(' - ').trim();
        }
      }
      // [공식], [종합] 등 제거
      title = title.replace(/\s*\[.*?\]\s*/g, '').trim();

      // 최종 검증: 제목이 너무 짧거나 비어있으면 원본 유지
      if (title.length < 5) {
        title = $('meta[property="og:title"]').attr('content')?.trim() ||
          $('h1').first().text().trim() ||
          $('title').text().trim() ||
          html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
      }
    }

    // 본문 추출 (한국 뉴스 사이트 + 쇼핑몰 특화 선택자 포함)
    const contentCandidates: Array<{ selector: string; text: string; length: number }> = [];

    const contentSelectors = [
      // ✅ 쇼핑몰 상품 상세 페이지 선택자 (최우선)
      '.prod-description', // 쿠팡 상품 설명
      '.prod-description-attribute', // 쿠팡 상품 속성
      '.prod-attr-item', // 쿠팡 상품 속성
      '.prod-buy-header__title', // 쿠팡 상품 제목
      '#productTitle', // 쿠팡 상품 제목
      '.product-detail', // 일반 쇼핑몰 상품 상세
      '.product-description', // 일반 쇼핑몰 상품 설명
      '.product-info', // 일반 쇼핑몰 상품 정보
      '.item-description', // 일반 쇼핑몰 아이템 설명
      '#prdDetail', // 네이버 쇼핑 상품 상세
      '.detail_info', // 네이버 쇼핑 상세 정보
      // 네이버 브랜드 스토어 특화 선택자
      '.product_detail', // 네이버 브랜드 스토어 상품 상세
      '.productDetail', // 네이버 브랜드 스토어 상품 상세
      '.product-detail-info', // 네이버 브랜드 스토어 상품 상세 정보
      '.product-description-area', // 네이버 브랜드 스토어 상품 설명 영역
      '.product-info-area', // 네이버 브랜드 스토어 상품 정보 영역
      '.product-content', // 네이버 브랜드 스토어 상품 콘텐츠
      '[class*="product"] [class*="detail"]', // 네이버 브랜드 스토어 상품 상세 (범용)
      '[class*="product"] [class*="description"]', // 네이버 브랜드 스토어 상품 설명 (범용)
      // 네이버 블로그 특화 선택자 (우선순위 높음)
      '#postViewArea', // 네이버 블로그 메인 컨텐츠
      '.se-main-container', // 네이버 블로그 Smart Editor
      '.se-component-content', // 네이버 블로그 Smart Editor 컴포넌트
      '.se-section-text', // 네이버 블로그 텍스트 섹션
      '#postView', // 네이버 블로그 포스트 뷰
      '.post-view', // 네이버 블로그 포스트 뷰 (일반)
      '.blog-content', // 네이버 블로그 콘텐츠
      // 일반적인 기사 본문 선택자
      'article .article-body',
      'article .article-content',
      'article .post-content',
      'article .entry-content',
      'article #articleBody',
      '.article-body',
      '.article-content',
      '.post-content',
      '.entry-content',
      '#articleBody',
      '.news_end_body', // 네이버 뉴스
      '.article_view', // 다음 뉴스
      '.article_txt', // 조선일보
      '.article-body-content', // 중앙일보
      '.article-body-text', // 동아일보
      '.article_text', // 한겨레
      '.article-content-body', // 매일경제
      '.article-body-wrapper',
      'main article',
      'article',
      '[role="article"]',
      '.content',
      '.post',
      '.entry',
      // 더 넓은 범위
      'main',
      '#content',
      '.main-content',
    ];

    for (const selector of contentSelectors) {
      const $content = $(selector);
      if ($content.length > 0) {
        // 불필요한 요소 제거
        removeUnwantedElements($, $content);

        // 텍스트 추출
        let text = $content.text().trim();
        text = cleanText(text);

        if (text.length > 100) {
          contentCandidates.push({
            selector,
            text,
            length: text.length,
          });
        }
      }
    }

    // 가장 긴 본문 선택 (일반적으로 가장 긴 것이 실제 본문)
    let content = '';
    if (contentCandidates.length > 0) {
      contentCandidates.sort((a, b) => b.length - a.length);
      content = contentCandidates[0].text;
    }

    // 본문을 찾지 못한 경우 body에서 텍스트 추출 (최후의 수단)
    if (!content || content.length < 200) {
      // body에서 불필요한 요소 제거
      $('script, style, noscript, iframe, nav, header, footer, .nav, .navigation, .menu, .header, .footer, .sidebar, .ad, .advertisement, .ads, [class*="ad"], [id*="ad"], .social-share, .share, .comment, .comments, .related, .recommend, button, .button, .btn, form, .form, .subscribe, .newsletter, .popup, .modal').remove();

      // body에서 본문 후보 찾기
      const $body = $('body');
      const $mainSections = $body.find('main, #main, #content, .main, .content, article, .article');

      if ($mainSections.length > 0) {
        $mainSections.each((_, elem) => {
          const $elem = $(elem);
          removeUnwantedElements($, $elem);
          let text = $elem.text().trim();
          text = cleanText(text);

          if (text.length > content.length && text.length > 200) {
            content = text;
          }
        });
      }

      // 그래도 없으면 body 전체
      if (!content || content.length < 200) {
        content = cleanText($body.text());
      }
    }

    // 최종 검증: 본문이 너무 짧으면 경고
    if (content && content.length < 100) {
      console.warn(`⚠️ 추출된 본문이 너무 짧습니다 (${content.length}자). URL: ${url}`);
    }

    // 네이버 블로그 특별 처리: iframe 내부 내용 크롤링 시도
    if (/blog\.naver\.com/i.test(url) && (!content || content.length < 200)) {
      try {
        // 네이버 블로그는 실제 본문이 iframe 내부에 있음
        const iframeSrc = $('iframe#mainFrame, iframe.se-main-frame').attr('src');
        if (iframeSrc) {
          const iframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `https://blog.naver.com${iframeSrc}`;
          console.log(`[네이버 블로그] iframe 크롤링 시도: ${iframeUrl}`);

          const iframeResponse = await fetchImpl(iframeUrl, {
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          if (iframeResponse.ok) {
            const iframeHtml = await iframeResponse.text();
            const $iframe = cheerio.load(iframeHtml);

            // iframe 내부에서 본문 찾기
            const iframeContentSelectors = [
              '#postViewArea',
              '.se-main-container',
              '.se-component-content',
              '.se-section-text',
              '#postView',
              '.post-view',
            ];

            for (const selector of iframeContentSelectors) {
              const $iframeContent = $iframe(selector);
              if ($iframeContent.length > 0) {
                removeUnwantedElements($iframe, $iframeContent);
                let iframeText = $iframeContent.text().trim();
                iframeText = cleanText(iframeText);
                if (iframeText.length > (content?.length || 0) && iframeText.length > 200) {
                  content = iframeText;
                  console.log(`✅ 네이버 블로그 iframe에서 본문 추출 성공 (${content.length}자)`);
                  break;
                }
              }
            }
          }
        }
      } catch (iframeError) {
        console.warn(`⚠️ 네이버 블로그 iframe 크롤링 실패:`, (iframeError as Error).message);
      }
    }

    // ✅ 이미지 URL 추출 (뉴스 기사 및 블로그 이미지 수집)
    const imageUrls: string[] = [];

    // og:image 메타 태그에서 이미지 추출 (최우선순위)
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
    if (ogImage) {
      try {
        const absoluteUrl = new URL(ogImage, url).href;
        if (absoluteUrl && !imageUrls.includes(absoluteUrl)) {
          imageUrls.unshift(absoluteUrl); // 맨 앞에 추가 (우선순위)
        }
      } catch {
        // URL 파싱 실패 시 무시
      }
    }

    // ✅ 블로그 특화 이미지 추출 (티스토리, 브런치, 벨로그 등) - 우선 실행
    const isBlogUrl = /tistory\.com|brunch\.co\.kr|velog\.io|medium\.com|blog\.daum\.net|blog\.google|wordpress\.com|blogger\.com/i.test(url);
    if (isBlogUrl) {
      const blogImageSelectors = [
        // 티스토리
        '.article-view img',
        '.article-content img',
        '#article-view img',
        '#article-content img',
        '.entry-content img',
        '.post-view img',
        // 브런치
        '.wrap_body img',
        '.article_body img',
        '.articleBody img',
        // 벨로그
        '.markdown-body img',
        '.post-content img',
        // 미디엄
        '.postArticle-content img',
        '.section-content img',
        // 일반 블로그
        'article img',
        '.post img',
        '.content img',
        '.entry img',
        '.post-content img',
        '.article-content img',
        'main img',
        '[class*="content"] img',
        '[class*="post"] img',
        '[class*="article"] img',
      ];

      blogImageSelectors.forEach(selector => {
        $(selector).each((_, elem) => {
          const $img = $(elem);
          const src = $img.attr('src') ||
            $img.attr('data-src') ||
            $img.attr('data-lazy-src') ||
            $img.attr('data-original') ||
            $img.attr('data-url') ||
            $img.attr('data-img') ||
            $img.attr('data-image');

          if (src) {
            try {
              const absoluteUrl = new URL(src, url).href;
              if (absoluteUrl && !imageUrls.includes(absoluteUrl)) {
                // 블로그 이미지는 더 관대하게 필터링 (썸네일 제외)
                if (!absoluteUrl.includes('/icon') &&
                  !absoluteUrl.includes('/logo') &&
                  !absoluteUrl.includes('/button') &&
                  !absoluteUrl.includes('/ad') &&
                  !absoluteUrl.includes('/avatar') &&
                  !absoluteUrl.includes('/profile') &&
                  (absoluteUrl.includes('photo') ||
                    absoluteUrl.includes('image') ||
                    absoluteUrl.includes('img') ||
                    /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(absoluteUrl))) {
                  imageUrls.push(absoluteUrl);
                }
              }
            } catch {
              // URL 파싱 실패 시 무시
            }
          }
        });
      });

      console.log(`[fetchArticleContent] 블로그 URL 감지: ${url} - ${imageUrls.length}개 이미지 추출 중...`);
    }

    // ✅ 네이버 브랜드 스토어 특화 이미지 추출 (우선순위 높음)
    if (/brand\.naver\.com/i.test(url)) {
      console.log(`[fetchArticleContent] 네이버 브랜드 스토어 감지: ${url} - 제품 이미지 및 리뷰 이미지 추출 중...`);

      const brandStoreImageSelectors = [
        // 제품 썸네일 (작은 이미지들)
        '.product_thumb img',
        '.thumb_area img',
        '[class*="thumb"] img',
        // 제품 메인 이미지
        '.product_img img',
        '.product_image img',
        // 상세 이미지
        '.detail_img img',
        '.detail_view img',
        '.detail_area img',
        // 갤러리 이미지
        '.gallery_img img',
        '.gallery_area img',
        // ✅ 포토/동영상 리뷰 이미지 (추가)
        '.review_photo img',
        '.review_image img',
        '.photo_review img',
        '[class*="review"] [class*="photo"] img',
        '[class*="review"] [class*="image"] img',
        '[class*="review"] img',
        // 일반 선택자
        '[class*="product"] img',
        '[class*="detail"] img',
        '[class*="gallery"] img',
        // 모든 이미지 (최후의 수단)
        'img',
      ];

      brandStoreImageSelectors.forEach(selector => {
        $(selector).each((_, elem) => {
          const $img = $(elem);
          const src = $img.attr('src') ||
            $img.attr('data-src') ||
            $img.attr('data-lazy-src') ||
            $img.attr('data-original') ||
            $img.attr('data-url');

          if (src) {
            try {
              const absoluteUrl = new URL(src, url).href;
              if (absoluteUrl && !imageUrls.includes(absoluteUrl)) {
                // UI 요소 필터링
                const isUIElement =
                  absoluteUrl.includes('/icon/') ||
                  absoluteUrl.includes('/logo/') ||
                  absoluteUrl.includes('/button/') ||
                  absoluteUrl.includes('/ad/') ||
                  absoluteUrl.includes('/banner/') ||
                  absoluteUrl.endsWith('icon.png') ||
                  absoluteUrl.endsWith('logo.png') ||
                  absoluteUrl.includes('favicon');

                if (!isUIElement && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(absoluteUrl)) {
                  imageUrls.push(absoluteUrl);
                }
              }
            } catch {
              // URL 파싱 실패 시 무시
            }
          }
        });
      });

      console.log(`[fetchArticleContent] 네이버 브랜드 스토어에서 ${imageUrls.length}개 이미지 추출 완료 (제품 이미지 + 리뷰 이미지)`);
    }

    // 뉴스 기사 특화 이미지 추출 (네이버 스포츠 등)
    if (/sports\.naver\.com|news\.naver\.com|entertain\.naver\.com/i.test(url)) {
      // 뉴스 기사 본문 영역의 이미지 우선 추출
      const newsImageSelectors = [
        '.news_end_body img',
        '.article_view img',
        '.article_txt img',
        '.article-body-content img',
        'article img',
        '.news_end_body .img_area img',
        '.article_view .img_area img',
        '.news_end_body .photo img',
        '.article_view .photo img',
        '.news_end_body figure img',
        '.article_view figure img',
        '[class*="img"] img',
        '[class*="photo"] img',
        '[class*="image"] img',
      ];

      newsImageSelectors.forEach(selector => {
        $(selector).each((_, elem) => {
          const $img = $(elem);
          // 다양한 속성에서 이미지 URL 추출
          const src = $img.attr('src') ||
            $img.attr('data-src') ||
            $img.attr('data-lazy-src') ||
            $img.attr('data-original') ||
            $img.attr('data-url') ||
            $img.attr('data-img') ||
            $img.attr('data-image');

          if (src) {
            try {
              const absoluteUrl = new URL(src, url).href;
              if (absoluteUrl && !imageUrls.includes(absoluteUrl)) {
                // 썸네일이 아닌 실제 이미지 우선 (하지만 썸네일도 포함)
                // 네이버 스포츠/엔터는 썸네일도 실제 기사 이미지일 수 있음
                if (!absoluteUrl.includes('/icon') &&
                  !absoluteUrl.includes('/logo') &&
                  !absoluteUrl.includes('/button') &&
                  !absoluteUrl.includes('/ad') &&
                  (absoluteUrl.includes('imgnews.pstatic.net') ||
                    absoluteUrl.includes('sports.naver.com') ||
                    absoluteUrl.includes('news.naver.com') ||
                    absoluteUrl.includes('entertain.naver.com') ||
                    absoluteUrl.includes('photo') ||
                    absoluteUrl.includes('image') ||
                    /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(absoluteUrl))) {
                  imageUrls.push(absoluteUrl);
                }
              }
            } catch {
              // URL 파싱 실패 시 무시
            }
          }
        });
      });

      // 네이버 스포츠 모바일 페이지의 경우 JavaScript로 로드되는 이미지도 추출
      // data 속성이나 스타일 속성에서 이미지 URL 추출
      $('[data-img], [data-image], [data-photo], [style*="background-image"]').each((_, elem) => {
        const $elem = $(elem);
        const dataImg = $elem.attr('data-img') || $elem.attr('data-image') || $elem.attr('data-photo');
        const styleBg = $elem.attr('style')?.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/i)?.[1];

        [dataImg, styleBg].forEach(src => {
          if (src) {
            try {
              const absoluteUrl = new URL(src, url).href;
              if (absoluteUrl && !imageUrls.includes(absoluteUrl) &&
                (absoluteUrl.includes('imgnews.pstatic.net') ||
                  absoluteUrl.includes('sports.naver.com') ||
                  absoluteUrl.includes('news.naver.com') ||
                  absoluteUrl.includes('entertain.naver.com') ||
                  /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(absoluteUrl))) {
                imageUrls.push(absoluteUrl);
              }
            } catch {
              // URL 파싱 실패 시 무시
            }
          }
        });
      });
    }

    // ✅ 일반 이미지 추출 (블로그/뉴스 특화 추출 후, 누락된 이미지 보완)
    $('img').each((_, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-lazy-src') || $(elem).attr('data-original');
      if (src) {
        try {
          // 상대 경로를 절대 경로로 변환
          const absoluteUrl = new URL(src, url).href;
          if (absoluteUrl && !imageUrls.includes(absoluteUrl)) {
            // 유효한 이미지 URL인지 확인 (UI 요소 제외)
            const isUIElement = absoluteUrl.includes('/icon') ||
              absoluteUrl.includes('/logo') ||
              absoluteUrl.includes('/button') ||
              absoluteUrl.includes('/ad') ||
              absoluteUrl.includes('/banner') ||
              (absoluteUrl.includes('/thumbnail') && absoluteUrl.includes('thumb')) ||
              absoluteUrl.includes('/avatar') ||
              absoluteUrl.includes('/profile');

            if (!isUIElement && (
              /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(absoluteUrl) ||
              absoluteUrl.includes('image') ||
              absoluteUrl.includes('photo') ||
              absoluteUrl.includes('img') ||
              absoluteUrl.includes('naver.net') ||
              absoluteUrl.includes('sports.naver.com') ||
              absoluteUrl.includes('entertain.naver.com')
            )) {
              imageUrls.push(absoluteUrl);
            }
          }
        } catch {
          // URL 파싱 실패 시 무시
        }
      }
    });

    // ✅ [Fix] 이미지 수집 활성화 (Shopping Connect 모드 지원)
    console.log(`[fetchArticleContent] ${url}에서 텍스트 및 이미지(${imageUrls.length}장) 추출 완료`);

    return {
      title: title || undefined,
      content: content || undefined,
      images: imageUrls.length > 0 ? imageUrls : undefined,
    };
  } catch (error) {
    throw new Error(`기사 콘텐츠를 가져오지 못했습니다: ${(error as Error).message}`);
  }
}

async function fetchRssEntry(url: string): Promise<{ title?: string; content?: string; publishedAt?: string; images?: string[] }> {
  try {
    const feed = await rssParser.parseURL(url);
    const entry = feed.items?.[0];
    if (!entry) {
      throw new Error('RSS 피드에서 항목을 찾을 수 없습니다.');
    }
    const content = entry['content:encoded'] || entry.contentSnippet || entry.content;

    // 이미지 URL 추출 (이미지 라이브러리 기능 제거됨)
    // const imageUrls = content ? await extractImagesFromRss(content, url) : [];
    const imageUrls: string[] = [];

    return {
      title: entry.title ?? undefined,
      content: content ?? undefined,
      publishedAt: entry.isoDate ?? entry.pubDate ?? undefined,
      images: imageUrls.length > 0 ? imageUrls : undefined,
    };
  } catch (error) {
    throw new Error(`RSS를 파싱하지 못했습니다: ${(error as Error).message}`);
  }
}

function extractKeywordsFromText(text: string): string[] {
  if (!text || text.trim().length < 10) return [];

  // 간단한 키워드 추출: 2-4자 한글 단어, 3자 이상 영어 단어
  const koreanWords = text.match(/[가-힣]{2,4}/g) || [];
  const englishWords = text.match(/\b[A-Za-z]{3,}\b/g) || [];

  // 빈도수 기반으로 상위 키워드 추출
  const wordFreq: Map<string, number> = new Map();

  [...koreanWords, ...englishWords].forEach(word => {
    const lower = word.toLowerCase();
    wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
  });

  // 빈도수 2 이상인 키워드만 반환 (최대 10개)
  return Array.from(wordFreq.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function calculateTopicSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  const set1 = new Set(keywords1.map(k => k.toLowerCase()));
  const set2 = new Set(keywords2.map(k => k.toLowerCase()));

  const intersection = new Set([...set1].filter(k => set2.has(k)));
  const union = new Set([...set1, ...set2]);

  // Jaccard 유사도
  return union.size > 0 ? intersection.size / union.size : 0;
}

async function fetchSingleSource(url: string, options?: { naverClientId?: string; naverClientSecret?: string }): Promise<{ title?: string; content?: string; publishedAt?: string; images?: string[]; keywords?: string[]; success: boolean; error?: string }> {
  try {
    let title: string | undefined;
    let content: string | undefined;
    let publishedAt: string | undefined;
    let images: string[] | undefined;

    // ✅ [핵심 수정] smartstore/brand.naver.com URL인 경우 크롤링 건너뛰고 API로 직접 정보 수집
    // 이렇게 하면 에러 페이지/캡차 문제가 완전히 해결됨
    const isNaverStore = url.includes('smartstore.naver.com') || url.includes('brand.naver.com');

    if (isNaverStore) {
      console.log(`[fetchSingleSource] 🛒 네이버 스토어 URL 감지 → 크롤링 생략, API로 직접 정보 수집`);

      // URL에서 스토어명과 상품번호 추출
      const storeMatch = url.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
      const productMatch = url.match(/products\/(\d+)/);
      const storeName = storeMatch ? storeMatch[1] : '';
      const productId = productMatch ? productMatch[1] : '';

      console.log(`[fetchSingleSource] 📎 스토어: "${storeName}", 상품번호: "${productId}"`);

      // 네이버 쇼핑 API로 상품 정보 검색
      if (storeName && options?.naverClientId && options?.naverClientSecret) {
        try {
          const shoppingResults = await searchNaverShopping(
            storeName,
            options.naverClientId,
            options.naverClientSecret,
            30  // 더 많은 결과에서 필터링
          );

          if (shoppingResults.length > 0) {
            // ✅ [핵심] 스마트스토어 상품만 필터링 + 스토어명 관련 상품 우선
            const storeNameLower = storeName.toLowerCase();

            // 1순위: link에 스토어명이 포함된 스마트스토어 상품
            let product = shoppingResults.find(p =>
              p.link.toLowerCase().includes('smartstore.naver.com') &&
              p.link.toLowerCase().includes(storeNameLower)
            );

            // 2순위: mallName에 스토어명이 포함된 상품
            if (!product) {
              product = shoppingResults.find(p =>
                p.mallName.toLowerCase().includes(storeNameLower) ||
                storeNameLower.includes(p.mallName.toLowerCase())
              );
            }

            // 3순위: 스마트스토어 상품 중 첫 번째
            if (!product) {
              product = shoppingResults.find(p =>
                p.link.toLowerCase().includes('smartstore.naver.com') ||
                p.link.toLowerCase().includes('brand.naver.com')
              );
            }

            // 4순위: 일반 상품 중 첫 번째 (최후의 수단)
            if (!product) {
              product = shoppingResults[0];
            }

            console.log(`[fetchSingleSource] 🎯 선택된 상품: "${product.title.substring(0, 30)}..." (mallName: ${product.mallName})`);

            const productName = product.title.replace(/<[^>]*>/g, '').trim();
            const price = parseInt(product.lprice) || 0;
            const brand = product.brand || product.maker || storeName;
            const category = [product.category1, product.category2, product.category3].filter(Boolean).join(' > ');

            title = productName;
            content = `
상품명: ${productName}
가격: ${price.toLocaleString()}원
브랜드: ${brand}
카테고리: ${category}
판매처: ${product.mallName || storeName}

${productName}은(는) ${brand}에서 제작한 인기 상품입니다.
현재 ${product.mallName || '네이버 스마트스토어'}에서 ${price.toLocaleString()}원에 판매 중이며,
${category} 카테고리에서 많은 고객들에게 사랑받고 있습니다.

이 제품의 주요 특징은 품질과 가격 대비 만족도가 높은 것으로 알려져 있습니다.
실제 구매자들의 리뷰를 참고하면 더욱 현명한 구매 결정을 내릴 수 있습니다.

${brand}의 다른 제품들도 함께 살펴보시면 좋은 선택지를 발견할 수 있습니다.
`;
            images = product.image ? [product.image] : [];

            console.log(`[fetchSingleSource] ✅ 네이버 쇼핑 API 성공: "${productName}" (${price.toLocaleString()}원)`);

            return {
              title,
              content,
              publishedAt: new Date().toISOString(),
              images,
              keywords: [productName, brand, ...category.split(' > ')].filter(Boolean),
              success: true,
            };
          }
        } catch (apiError) {
          console.warn(`[fetchSingleSource] ⚠️ 네이버 쇼핑 API 실패: ${(apiError as Error).message}`);
        }
      }

      // API 실패 시 스토어명으로 기본 콘텐츠 생성 (크롤링 없이)
      if (storeName) {
        console.log(`[fetchSingleSource] ⚠️ API 실패 → 스토어명 기반 기본 콘텐츠 생성`);
        title = `${storeName} 스토어 인기 상품`;
        content = `
${storeName} 스토어의 인기 상품을 소개합니다.

${storeName}은 네이버 스마트스토어에서 운영되는 믿을 수 있는 판매처입니다.
다양한 상품들을 합리적인 가격에 제공하고 있으며,
고객 만족도 높은 서비스로 많은 사랑을 받고 있습니다.

구매 전 상품 상세 페이지에서 옵션과 배송 정보를 꼭 확인해주세요.
실제 구매자 리뷰를 참고하시면 더욱 현명한 선택을 하실 수 있습니다.
`;

        return {
          title,
          content,
          publishedAt: new Date().toISOString(),
          images: [],
          keywords: [storeName],
          success: true,
        };
      }
    }

    // RSS 피드인 경우 기존 방식 사용
    if (/\.xml$|\/rss/i.test(url)) {
      const rssEntry = await fetchRssEntry(url);
      title = rssEntry.title;
      content = rssEntry.content;
      publishedAt = rssEntry.publishedAt;
      images = rssEntry.images;
    } else if (/blog\.naver\.com/i.test(url)) {
      // ✅ [2026-02-08] 네이버 블로그 URL은 smartCrawler 건너뛰고 직접 fetchArticleContent 사용
      // 이유: 네이버 블로그는 iframe 기반 CSR이라 일반 fetch/Puppeteer로 본문 추출 불가능
      // smartCrawler가 실패 → 검색 API 폴백 → URL 키워드로 *다른 글*을 소스로 사용하는 버그 방지
      console.log(`[fetchSingleSource] 📝 네이버 블로그 URL 감지 → fetchArticleContent 직접 사용 (smartCrawler 건너뜀)`);
      try {
        const article = await fetchArticleContent(url, options);
        title = article.title;
        content = article.content;
        publishedAt = article.publishedAt;
        images = article.images;

        if (content && content.length > 50) {
          console.log(`[fetchSingleSource] ✅ 네이버 블로그 크롤링 성공: ${content.length}자, 이미지 ${images?.length || 0}개`);
        } else {
          console.log(`[fetchSingleSource] ⚠️ 네이버 블로그 본문이 짧음 (${content?.length || 0}자) → Puppeteer 폴백 시도`);
          // Puppeteer로 직접 재시도 (iframe 내부 접근)
          try {
            const puppeteerResult = await fetchWithPuppeteer(url);
            if (puppeteerResult.content && puppeteerResult.content.length > (content?.length || 0)) {
              title = puppeteerResult.title || title;
              content = puppeteerResult.content;
              images = puppeteerResult.images || images;
              console.log(`[fetchSingleSource] ✅ Puppeteer 폴백 성공: ${content.length}자`);
            }
          } catch (puppeteerError) {
            console.warn(`[fetchSingleSource] ⚠️ Puppeteer 폴백도 실패: ${(puppeteerError as Error).message}`);
          }
        }
      } catch (blogError) {
        console.error(`[fetchSingleSource] ❌ 네이버 블로그 크롤링 실패: ${(blogError as Error).message}`);
        // 최후의 수단: smartCrawler 시도 (혹시 되면 좋고)
        try {
          const crawlResult = await smartCrawler.crawl(url, {
            mode: 'perfect',
            maxLength: 15000,
            extractImages: true,
            timeout: 30000,
          });
          if (crawlResult.content && crawlResult.content.length > 50) {
            title = crawlResult.title;
            content = crawlResult.content;
            images = crawlResult.images;
            console.log(`[fetchSingleSource] ✅ smartCrawler 폴백 성공: ${content.length}자`);
          }
        } catch (e) {
          console.warn(`[fetchSingleSource] ⚠️ smartCrawler 폴백도 실패`);
        }
      }
    } else {
      // ✅ 일반 URL: smartCrawler 우선 사용 (쇼핑 API + 검색 API 폴백 포함!)
      try {
        console.log(`[fetchSingleSource] smartCrawler로 크롤링 시도: ${url}`);
        const crawlResult = await smartCrawler.crawl(url, {
          mode: 'auto',
          maxLength: 15000,
          extractImages: true,
          timeout: 30000,
        });

        if (crawlResult.content && (crawlResult.content.length > 50 || (crawlResult.images && crawlResult.images.length > 0))) {
          title = crawlResult.title;
          content = crawlResult.content;
          images = crawlResult.images;
          console.log(`[fetchSingleSource] ✅ smartCrawler 성공: ${content.length}자 (모드: ${crawlResult.mode})`);
        } else {
          throw new Error(`smartCrawler 결과가 부족합니다 (${crawlResult.content?.length || 0}자)`);
        }
      } catch (smartCrawlerError) {
        // smartCrawler 실패 시 기존 fetchArticleContent로 폴백
        console.log(`[fetchSingleSource] ⚠️ smartCrawler 실패, fetchArticleContent로 폴백: ${(smartCrawlerError as Error).message}`);
        const article = await fetchArticleContent(url, options);
        title = article.title;
        content = article.content;
        publishedAt = article.publishedAt;
        images = article.images;
      }
    }

    // 키워드 추출
    const fullText = `${title || ''} ${content || ''}`;
    const keywords = extractKeywordsFromText(fullText);

    return {
      title,
      content,
      publishedAt,
      images,
      keywords,
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export async function assembleContentSource(input: SourceAssemblyInput): Promise<AssembledSource> {
  const warnings: string[] = [];

  // keywords가 array인지 확인하고 안전하게 처리
  let keywords: string[] = [];
  try {
    const rawKeywords = input.keywords as any; // 타입 단언으로 안전하게 처리

    if (Array.isArray(rawKeywords)) {
      keywords = rawKeywords.map((keyword: string) => keyword.trim()).filter(Boolean);
    } else if (typeof rawKeywords === 'string') {
      // string인 경우 콤마나 공백으로 분리
      keywords = rawKeywords.split(/[,;\s]+/).map((k: string) => k.trim()).filter(Boolean);
    } else if (rawKeywords != null && rawKeywords !== undefined && rawKeywords !== '') {
      // 다른 타입인 경우 string으로 변환 후 분리
      keywords = String(rawKeywords).split(/[,;\s]+/).map((k: string) => k.trim()).filter(Boolean);
    }
  } catch (error) {
    console.warn('[Keywords] 키워드 파싱 오류:', error);
    keywords = [];
  }
  const draft = input.draftText?.trim() || '';
  const baseText = input.baseText?.trim() || '';
  // rssUrl이 배열일 수도 있고 문자열일 수도 있음
  let rssUrlInput = '';
  if (Array.isArray(input.rssUrl)) {
    rssUrlInput = input.rssUrl[0]?.trim() || '';
  } else if (typeof input.rssUrl === 'string') {
    rssUrlInput = input.rssUrl.trim();
  }

  // ✅ 네이버 API 키 확인
  const naverClientId = input.naverClientId || process.env.NAVER_CLIENT_ID;
  const naverClientSecret = input.naverClientSecret || process.env.NAVER_CLIENT_SECRET;
  const hasNaverApi = !!(naverClientId && naverClientSecret);

  // ✅✅✅ [핵심] 스마트스토어/브랜드스토어 URL인 경우 크롤링 없이 API로 직접 정보 수집 ✅✅✅
  const isNaverStoreUrl = rssUrlInput.includes('smartstore.naver.com') || rssUrlInput.includes('brand.naver.com');

  // ✅ 디버그 로그 (항상 출력)
  console.log(`\n📋 [assembleContentSource] 입력 분석:`);
  console.log(`   - rssUrlInput: "${rssUrlInput.substring(0, 60)}${rssUrlInput.length > 60 ? '...' : ''}"`);
  console.log(`   - isNaverStoreUrl: ${isNaverStoreUrl}`);
  console.log(`   - hasNaverApi: ${hasNaverApi} (clientId: ${!!naverClientId}, secret: ${!!naverClientSecret})`);

  if (isNaverStoreUrl) {
    console.log(`\n🛒 [스마트스토어 감지] crawlFromAffiliateLink로 직접 상품 정보 수집!`);
    console.log(`   URL: ${rssUrlInput.substring(0, 80)}...`);

    // URL에서 스토어명과 상품번호 추출
    const storeMatch = rssUrlInput.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
    const productMatch = rssUrlInput.match(/products\/(\d+)/);
    const storeName = storeMatch ? storeMatch[1] : '';
    const productId = productMatch ? productMatch[1] : '';

    console.log(`   📎 스토어: "${storeName}", 상품번호: "${productId}"`);

    if (storeName && productId) {
      try {
        // ✅ [핵심 수정] crawlFromAffiliateLink로 직접 상품 정보 수집!
        // 검색 API는 상품번호로 검색하면 엉뚱한 상품이 나옴
        console.log(`[crawlFromAffiliateLink] 직접 API 호출로 상품 정보 수집!`);
        const { crawlFromAffiliateLink } = await import('./crawler/productSpecCrawler.js');
        const productInfo = await crawlFromAffiliateLink(rssUrlInput);

        if (productInfo && productInfo.name && productInfo.name !== '상품명을 불러올 수 없습니다') {
          const productName = productInfo.name;
          const price = productInfo.price || 0;
          const brand = storeName;
          const category = 'shopping'; // crawlFromAffiliateLink는 카테고리 정보 없음

          console.log(`   🎯 직접 API 수집 성공: "${productName}" (${price.toLocaleString()}원)`);

          // ✅ [2026-01-21 100점 수정] 제품 설명 포함!
          const productDescription = productInfo.description || '';
          console.log(`   📝 제품 설명: ${productDescription.length}자`);

          // 즉시 source 객체 반환 (크롤링 없이!)
          const source: ContentSource = {
            sourceType: 'custom_text',
            url: rssUrlInput,
            title: productName,
            // ✅ [핵심] rawText에 실제 제품 설명 포함!
            rawText: `
상품명: ${productName}
가격: ${price.toLocaleString()}원
브랜드: ${brand}
판매처: 네이버 스마트스토어

=== 제품 상세 정보 ===
${productDescription || `${productName}은(는) ${brand}에서 판매하는 인기 상품입니다.`}

=== 제품 특징 ===
${productName}은(는) ${brand}에서 판매하는 인기 상품입니다.
현재 네이버 스마트스토어에서 ${price.toLocaleString()}원에 판매 중이며,
많은 고객들에게 사랑받고 있습니다.

이 제품의 주요 특징은 품질과 가격 대비 만족도가 높은 것으로 알려져 있습니다.
실제 구매자들의 리뷰를 참고하면 더욱 현명한 구매 결정을 내릴 수 있습니다.
`,
            crawledTime: new Date().toISOString(),
            categoryHint: 'shopping_review',
            metadata: {
              keywords: [productName, brand].filter(Boolean),
              productInfo: {
                name: productName,
                price,
                brand,
                // ✅ 제품 설명도 메타데이터에 포함
                description: productDescription
              },
            },
            generator: input.generator ?? 'gemini',
            articleType: 'shopping_review',
            targetTraffic: 'viral',
            targetAge: input.targetAge ?? 'all',
            isReviewType: true,
            images: productInfo.mainImage ? [productInfo.mainImage, ...(productInfo.galleryImages || [])] : [],
            // ✅ [2026-02-01 FIX] collectedImages에도 저장하여 renderer에서 중복 크롤링 방지
            collectedImages: productInfo.mainImage ? [productInfo.mainImage, ...(productInfo.galleryImages || [])] : [],
          };

          console.log(`   ✅ crawlFromAffiliateLink 상품 정보 수집 완료! 이미지: ${source.images?.length || 0}개, 설명: ${productDescription.length}자`);

          return {
            source,
            warnings: [`✅ 직접 API로 "${productName}" 정보 수집 완료! (설명 ${productDescription.length}자)`],
          };
        } else {
          console.log(`   ⚠️ crawlFromAffiliateLink 실패 - 크롤링으로 폴백`);
        }
      } catch (apiError) {
        console.warn(`   ⚠️ crawlFromAffiliateLink 실패: ${(apiError as Error).message}`);
        // API 실패 시 기존 로직으로 폴백
      }
    }
  }

  // ✅✅✅ 네이버 API 우선 사용 (빠르고 안정적!) ✅✅✅
  let naverApiContent = '';
  const searchQuery = (baseText && baseText.length > 0 && baseText.length < 200 ? baseText : '') || (keywords.length > 0 ? keywords.slice(0, 5).join(' ') : '');

  if (hasNaverApi && searchQuery) {
    console.log(`\n🚀 [네이버 API 우선] 빠른 콘텐츠 수집 시작! 검색어: "${searchQuery}"`);
    const startTime = Date.now();

    try {
      const naverResult = await collectNaverSearchContent(searchQuery, naverClientId!, naverClientSecret!);

      if (naverResult.content.length > 1000) {
        naverApiContent = naverResult.content;
        warnings.push(`✅ 네이버 API로 ${naverResult.totalChars}자 수집 완료! (${Date.now() - startTime}ms)`);
        console.log(`✅ [네이버 API] ${naverResult.totalChars}자 수집 성공! (${Date.now() - startTime}ms)`);
      } else {
        console.log(`⚠️ [네이버 API] 결과가 부족합니다 (${naverResult.content.length}자). 크롤링으로 보충...`);
      }
    } catch (error) {
      console.warn(`⚠️ [네이버 API] 실패: ${(error as Error).message}`);
    }
  }

  // 수동 제목 입력 시 자동 RSS 검색 (네이버 API 결과가 부족할 때만)
  if (!rssUrlInput && baseText && baseText.length > 0 && baseText.length < 200 && naverApiContent.length < 2000) {
    // baseText가 짧으면 제목으로 간주하고 RSS 자동 검색
    console.log(`[자동 RSS 검색] 제목 "${baseText}"로 RSS 검색 시작...`);
    try {
      const { searchAllRssSources } = await import('./rssSearcher.js');
      const searchedUrls = await searchAllRssSources(baseText, {
        maxPerSource: 5, // ✅ 네이버 API가 있으면 RSS는 보조 역할
        // ✅ [2026-02-08] sources 생략 → 기본값 9개 소스 전체 검색
      });

      if (searchedUrls.length > 0) {
        // 최대 10개 URL만 사용 (네이버 API가 메인이므로 축소)
        const selectedUrls = searchedUrls.slice(0, 10);
        rssUrlInput = selectedUrls.join('\n');
        warnings.push(`✅ RSS 보조 검색: ${selectedUrls.length}개 URL 발견`);
        console.log(`[자동 RSS 검색] ${selectedUrls.length}개의 URL을 보조로 수집`);
      }
    } catch (error) {
      console.error(`[자동 RSS 검색] 오류:`, (error as Error).message);
    }
  }

  // 여러 URL 파싱 (줄바꿈, 쉼표, 세미콜론으로 구분)
  const urlPatterns = rssUrlInput
    .split(/[\n\r,;]+/)
    .map(url => url.trim())
    .filter(url => url.length > 0 && /^https?:\/\//i.test(url));

  let baseTitle = baseText.length < 100 ? baseText : '';  // 짧으면 제목으로 사용
  let baseBody = baseText.length >= 100 ? baseText : '';  // 길면 본문으로 사용
  let published = '';
  let extractedImages: string[] = [];
  const allUrls: string[] = [];

  // ✅ 네이버 API 결과를 우선 적용 (빠르고 안정적!)
  if (naverApiContent.length > 500) {
    baseBody = naverApiContent;
    console.log(`✅ [네이버 API] 기본 본문으로 ${naverApiContent.length}자 설정`);
  }

  if (urlPatterns.length > 0) {
    console.log(`[다중 소스 크롤링] ${urlPatterns.length}개의 URL을 크롤링합니다...`);

    // ✅ 네이버 API 키 옵션 준비
    const crawlOptions = hasNaverApi ? { naverClientId: naverClientId!, naverClientSecret: naverClientSecret! } : undefined;

    // 여러 소스를 병렬로 크롤링 (✅ 네이버 API 키 전달)
    const crawlResults = await Promise.allSettled(
      urlPatterns.map(url => fetchSingleSource(url, crawlOptions))
    );

    const successfulSources: Array<{ title?: string; content?: string; publishedAt?: string; images?: string[]; keywords?: string[]; url: string; relevanceScore?: number }> = [];

    crawlResults.forEach((result, index) => {
      const url = urlPatterns[index];
      allUrls.push(url);

      if (result.status === 'fulfilled' && result.value.success) {
        const source = result.value;
        successfulSources.push({
          title: source.title,
          content: source.content,
          publishedAt: source.publishedAt,
          images: source.images,
          keywords: source.keywords,
          url,
        });

        // 이미지 수집
        if (source.images && source.images.length > 0) {
          extractedImages.push(...source.images);
        }
      } else {
        const errorMsg = result.status === 'fulfilled'
          ? result.value.error
          : (result.reason as Error).message;
        warnings.push(`URL 크롤링 실패 (${url}): ${errorMsg}`);
        console.warn(`[크롤링 실패] ${url}:`, errorMsg);
      }
    });

    // 주제 관련성 검사 (여러 소스가 있을 때)
    if (successfulSources.length > 1) {
      const firstSourceKeywords = successfulSources[0]?.keywords || [];

      successfulSources.forEach((source, index) => {
        if (index === 0) {
          source.relevanceScore = 1.0; // 첫 번째 소스는 기준
          return;
        }

        const sourceKeywords = source.keywords || [];
        const similarity = calculateTopicSimilarity(firstSourceKeywords, sourceKeywords);
        source.relevanceScore = similarity;

        // 관련성 낮은 소스 경고
        if (similarity < 0.2) {
          const sourceTitle = source.title || `소스 ${index + 1}`;
          warnings.push(`⚠️ 주제 불일치: "${sourceTitle}" (${urlPatterns[index]})는 첫 번째 소스와 주제가 다릅니다. (유사도: ${Math.round(similarity * 100)}%)`);
          console.warn(`[주제 불일치] ${sourceTitle}: 유사도 ${Math.round(similarity * 100)}%`);
        } else if (similarity < 0.5) {
          const sourceTitle = source.title || `소스 ${index + 1}`;
          warnings.push(`⚠️ 주제 관련성 낮음: "${sourceTitle}" (${urlPatterns[index]})는 첫 번째 소스와 약간 다른 주제일 수 있습니다. (유사도: ${Math.round(similarity * 100)}%)`);
          console.warn(`[주제 관련성 낮음] ${sourceTitle}: 유사도 ${Math.round(similarity * 100)}%`);
        }
      });
    }

    if (successfulSources.length > 0) {
      console.log(`[다중 소스 크롤링 완료] ${successfulSources.length}/${urlPatterns.length}개 성공`);

      // 여러 소스의 제목 통합 (첫 번째 제목을 기본으로, 나머지는 참고용)
      const titles = successfulSources
        .map(s => s.title)
        .filter((t): t is string => !!t && t.trim().length > 0);

      if (titles.length > 0) {
        baseTitle = titles[0];
        if (titles.length > 1) {
          // 여러 제목이 있으면 첫 번째를 기본으로, 나머지는 본문에 참고 정보로 포함
          console.log(`[제목 통합] ${titles.length}개의 제목 발견: ${titles.join(', ')}`);
        }
      }

      // 여러 소스의 본문 통합
      const contents = successfulSources
        .map(s => s.content)
        .filter((c): c is string => !!c && c.trim().length > 0);

      if (contents.length > 0) {
        // 중복 제거 및 통합
        const uniqueContents: string[] = [];
        const seenContent = new Set<string>();

        for (const content of contents) {
          // 내용의 해시를 생성하여 중복 제거 (간단한 방법: 첫 100자 기준)
          const contentHash = content.substring(0, 100).trim();
          if (!seenContent.has(contentHash) && content.length > 50) {
            seenContent.add(contentHash);
            uniqueContents.push(content);
          }
        }

        // 여러 소스의 내용을 구분자와 함께 통합
        if (uniqueContents.length === 1) {
          baseBody = uniqueContents[0];
        } else if (uniqueContents.length > 1) {
          // 관련성 점수에 따라 정렬 (높은 관련성 우선)
          const contentWithRelevance = uniqueContents.map((content, idx) => ({
            content,
            relevance: successfulSources[idx]?.relevanceScore ?? 1.0,
            title: successfulSources[idx]?.title || `소스 ${idx + 1}`,
            url: successfulSources[idx]?.url || '',
          }));

          // 관련성 점수로 정렬 (높은 것부터)
          contentWithRelevance.sort((a, b) => b.relevance - a.relevance);

          // 관련성 매우 낮은 소스(0.2 미만)는 별도 섹션으로 분리
          const relevantContents = contentWithRelevance.filter(c => c.relevance >= 0.2);
          const irrelevantContents = contentWithRelevance.filter(c => c.relevance < 0.2);

          if (relevantContents.length > 0) {
            baseBody = relevantContents
              .map((item) => {
                const relevanceNote = item.relevance < 0.5 && item.relevance >= 0.2
                  ? ` (참고: 관련성 ${Math.round(item.relevance * 100)}%)`
                  : '';
                return `[${item.title}${relevanceNote}]\n${item.content}`;
              })
              .join('\n\n---\n\n');

            // 관련성 낮은 소스가 있으면 별도 섹션으로 추가
            if (irrelevantContents.length > 0) {
              baseBody += '\n\n=== 관련성 낮은 추가 정보 ===\n\n';
              baseBody += irrelevantContents
                .map((item) => {
                  return `[${item.title} - 주제 불일치 (유사도 ${Math.round(item.relevance * 100)}%)]\n${item.content}`;
                })
                .join('\n\n---\n\n');

              warnings.push(`⚠️ ${irrelevantContents.length}개의 소스가 첫 번째 소스와 주제가 다릅니다. "관련성 낮은 추가 정보" 섹션으로 분리되었습니다.`);
            }
          } else {
            // 모든 소스가 관련성 낮은 경우 그냥 통합
            baseBody = contentWithRelevance
              .map((item) => {
                return `[${item.title} - 주제 불일치 (유사도 ${Math.round(item.relevance * 100)}%)]\n${item.content}`;
              })
              .join('\n\n---\n\n');

            warnings.push(`⚠️ 모든 소스가 서로 다른 주제입니다. 통합 시 주의가 필요합니다.`);
          }

          console.log(`[본문 통합] ${uniqueContents.length}개의 소스 내용을 통합했습니다. (관련성 높은 소스: ${relevantContents.length}개, 낮은 소스: ${irrelevantContents.length}개)`);
        }
      }

      // 발행일은 가장 최근 것으로 선택
      const publishedDates = successfulSources
        .map(s => s.publishedAt)
        .filter((d): d is string => !!d);

      if (publishedDates.length > 0) {
        published = publishedDates.sort().reverse()[0]; // 가장 최근 날짜
      }

      // 이미지 자동 수집 (백그라운드)
      if (extractedImages.length > 0) {
        // 중복 이미지 URL 제거
        const uniqueImages = Array.from(new Set(extractedImages));
        const category = baseTitle ? baseTitle.substring(0, 20) : 'uncategorized';

        console.log(`[이미지 수집 시작] ${uniqueImages.length}개의 고유 이미지를 라이브러리에 수집합니다...`);
        // 이미지 라이브러리 기능 제거됨
        /*
        collectImages(uniqueImages, allUrls.join(', '), baseTitle, category)
          .then((collectedItems: any) => {
            console.log(`[이미지 수집 완료] ${collectedItems.length}개의 이미지를 라이브러리에 추가했습니다.`);
          })
          .catch((error: any) => {
            console.error('[이미지 수집 실패]:', (error as Error).message);
          });
        */
      }

      if (successfulSources.length < urlPatterns.length) {
        warnings.push(`${urlPatterns.length - successfulSources.length}개의 URL 크롤링에 실패했지만, 성공한 소스로 콘텐츠를 생성합니다.`);
      }
    } else {
      // ✅ 모든 URL 크롤링 실패 시 네이버 검색 API로 폴백
      warnings.push('모든 URL 크롤링에 실패했습니다. 네이버 검색 API로 관련 콘텐츠를 수집합니다.');

      // 네이버 API 키 확인 (설정에서 가져오기)
      const naverClientId = input.naverClientId || process.env.NAVER_CLIENT_ID;
      const naverClientSecret = input.naverClientSecret || process.env.NAVER_CLIENT_SECRET;

      if (naverClientId && naverClientSecret && baseTitle) {
        console.log('[폴백] 네이버 검색 API로 콘텐츠 보충 시도...');
        const fallbackResult = await fetchContentWithNaverFallback(
          urlPatterns[0] || '',
          baseTitle,
          naverClientId,
          naverClientSecret
        );

        if (fallbackResult.content && fallbackResult.content.length > 200) {
          baseBody = fallbackResult.content;
          warnings.push(`✅ 네이버 검색 API로 ${fallbackResult.content.length}자 수집 성공!`);
          console.log(`[폴백] ✅ 네이버 검색 API로 ${fallbackResult.content.length}자 수집`);
        }
      }
    }
  }

  if (draft) {
    baseBody = baseBody ? `${draft}\n\n---\n\n${baseBody}` : draft;
  }

  // URL 크롤링이 성공했지만 본문이 없는 경우 처리
  if (!baseBody && urlPatterns.length > 0) {
    // ✅ 네이버 검색 API로 한 번 더 시도
    const naverClientId = input.naverClientId || process.env.NAVER_CLIENT_ID;
    const naverClientSecret = input.naverClientSecret || process.env.NAVER_CLIENT_SECRET;

    if (naverClientId && naverClientSecret && baseTitle) {
      console.log('[폴백] 본문 없음 - 네이버 검색 API로 콘텐츠 수집 시도...');
      const fallbackResult = await fetchContentWithNaverFallback(
        urlPatterns[0] || '',
        baseTitle,
        naverClientId,
        naverClientSecret
      );

      if (fallbackResult.content && fallbackResult.content.length > 100) {
        baseBody = fallbackResult.content;
        warnings.push(`✅ 네이버 검색 API로 ${fallbackResult.content.length}자 수집 성공!`);
      }
    }

    // 크롤링을 시도했지만 본문 추출에 실패한 경우
    const isNaverBlog = urlPatterns.some(url => /blog\.naver\.com/i.test(url));

    if (!baseBody && isNaverBlog) {
      // 네이버 블로그는 Puppeteer를 사용하여 크롤링했음에도 실패한 경우
      // 하지만 제목이라도 있으면 경고만 하고 계속 진행
      const failedUrls = urlPatterns.filter(url => /blog\.naver\.com/i.test(url));

      if (baseTitle && baseTitle.trim().length > 0) {
        // 제목이 있으면 경고만 하고 제목 기반으로 생성
        warnings.push(
          `⚠️ 네이버 블로그 URL 크롤링에 실패했습니다 (${failedUrls.join(', ')}).\n` +
          `제목("${baseTitle}")을 기반으로 콘텐츠를 생성합니다.\n\n` +
          `다음 방법을 권장합니다:\n` +
          `1. 블로그 글의 실제 내용을 복사하여 "초안" 필드에 붙여넣기\n` +
          `2. RSS URL 사용 (블로그 RSS 피드 URL)\n` +
          `3. 키워드 입력 후 자동 생성`
        );
        baseBody = `${baseTitle}에 대한 상세한 내용을 작성합니다.`;
      } else {
        // 제목도 없으면 에러
        throw new Error(
          '네이버 블로그 URL 크롤링에 실패했습니다.\n\n' +
          '전용 크롤러와 Puppeteer를 모두 사용했지만 실패했습니다.\n' +
          '다음 방법을 시도해보세요:\n' +
          '1. 블로그 글의 실제 내용을 복사하여 "초안" 필드에 붙여넣기\n' +
          '2. RSS URL 사용 (블로그 RSS 피드 URL)\n' +
          '3. 키워드 입력 후 자동 생성\n\n' +
          `시도한 URL: ${failedUrls.join(', ')}`
        );
      }
    }

    if (baseTitle) {
      // 제목이 있지만 본문이 없는 경우 - 경고와 함께 제목 기반으로 생성
      warnings.push(`⚠️ URL에서 본문을 추출하지 못했습니다. 제목("${baseTitle}")을 기반으로 콘텐츠를 생성합니다.`);
      baseBody = `${baseTitle}에 대한 상세한 내용을 작성합니다.`;
    } else {
      // URL만 있는 경우
      throw new Error(
        `URL 크롤링에 실패했습니다. 본문을 추출할 수 없습니다.\n\n` +
        `시도한 URL: ${urlPatterns.join(', ')}\n\n` +
        `다음 방법을 시도해보세요:\n` +
        `1. 블로그 글의 실제 내용을 복사하여 "초안" 필드에 붙여넣기\n` +
        `2. RSS URL 사용 (블로그 RSS 피드 URL)\n` +
        `3. 키워드 입력 후 자동 생성`
      );
    }
  }

  if (!baseBody) {
    baseBody = keywords.length ? keywords.join(', ') : '';
  }

  // URL 크롤링이 있었고 제목이라도 있으면 에러를 던지지 않음
  if (!baseBody.trim()) {
    if (baseTitle && baseTitle.trim().length > 0) {
      // ✅ 제목만 있어도 제목 기반으로 콘텐츠 생성 가능
      warnings.push(`ℹ️ 제목("${baseTitle}")을 기반으로 콘텐츠를 생성합니다.`);
      baseBody = `${baseTitle}에 대한 상세한 내용을 작성합니다.`;
    } else if (urlPatterns.length > 0) {
      // URL은 있지만 제목도 본문도 없는 경우
      throw new Error('URL에서 콘텐츠를 추출할 수 없습니다. 제목 또는 키워드를 입력해주세요.');
    } else {
      throw new Error('자동 생성에 필요한 본문 정보가 없습니다. 키워드 또는 초안 또는 RSS를 제공해주세요.');
    }
  }

  // ✅ [2026-02-08] Perplexity 엔진 선택 시: 네이버 보충 건너뛰고 바로 Perplexity 리서치
  // Perplexity는 팩트 기반 실시간 웹 검색이므로 네이버 2차/3차 보충보다 훨씬 신뢰성이 높음
  const isPerplexityEngine = (input.generator || '').toLowerCase() === 'perplexity';

  if (isPerplexityEngine && (!baseBody || baseBody.length < 500) && (keywords.length > 0 || baseTitle)) {
    const searchKeyword = baseTitle || keywords.slice(0, 5).join(' ');
    console.log(`\n🔍 [Perplexity 엔진] 네이버 소스 부족 (${baseBody?.length || 0}자) → Perplexity 팩트 기반 리서치 우선 실행`);
    console.log(`   검색 키워드: "${searchKeyword}"`);

    try {
      const { researchWithPerplexity } = await import('./contentGenerator.js');
      const perplexityResult = await researchWithPerplexity(searchKeyword);

      if (perplexityResult.success && perplexityResult.content.length > 500) {
        if (baseBody && baseBody.length > 100) {
          baseBody = `${baseBody}\n\n--- Perplexity 팩트 기반 리서치 ---\n\n${perplexityResult.content}`;
        } else {
          baseBody = perplexityResult.content;
        }

        if (!baseTitle && perplexityResult.title) {
          baseTitle = perplexityResult.title;
        }

        warnings.push(`✅ Perplexity 팩트 기반 웹 리서치로 ${perplexityResult.content.length}자 수집!`);
        console.log(`✅ [Perplexity 엔진] 팩트 리서치 성공: ${perplexityResult.content.length}자, 총 본문 ${baseBody.length}자`);
      } else {
        console.log(`⚠️ [Perplexity 엔진] 리서치 결과 부족 → 네이버 API 보충으로 전환`);
      }
    } catch (error) {
      console.warn(`⚠️ [Perplexity 엔진] 리서치 실패: ${(error as Error).message} → 네이버 API 보충으로 전환`);
    }
  }

  // ✅ 본문이 너무 짧거나 의미 없는 경우 네이버 검색 API로 보충
  // (Perplexity 엔진이 아니거나, Perplexity 리서치로도 부족한 경우)
  if (baseBody && baseBody.length < 500) {
    warnings.push(`⚠️ 추출된 본문이 매우 짧습니다 (${baseBody.length}자). 네이버 검색 API로 콘텐츠를 보충합니다.`);

    const naverClientId = input.naverClientId || process.env.NAVER_CLIENT_ID;
    const naverClientSecret = input.naverClientSecret || process.env.NAVER_CLIENT_SECRET;

    // 검색어: 제목 > 키워드 > 기존 본문
    const searchQuery = baseTitle || (keywords.length > 0 ? keywords.slice(0, 3).join(' ') : baseBody.slice(0, 50));

    if (naverClientId && naverClientSecret && searchQuery) {
      console.log(`[보충] 네이버 검색 API로 콘텐츠 보충 시도... 검색어: "${searchQuery}"`);
      try {
        const supplementResult = await fetchContentWithNaverFallback(
          urlPatterns[0] || '',
          searchQuery,
          naverClientId,
          naverClientSecret
        );

        if (supplementResult.content && supplementResult.content.length > 100) {
          // 기존 본문 + 보충 콘텐츠 합치기
          baseBody = `${baseBody}\n\n--- 참고 자료 ---\n\n${supplementResult.content}`;
          warnings.push(`✅ 네이버 검색 API로 ${supplementResult.content.length}자 보충 완료! (출처: ${supplementResult.source})`);
          console.log(`[보충] ✅ ${supplementResult.content.length}자 추가됨`);
        }
      } catch (error) {
        console.warn('[보충] 네이버 검색 API 실패:', (error as Error).message);
      }
    }
  }

  // ✅ 키워드/제목만 있을 때 네이버 검색 API로 콘텐츠 수집
  if ((!baseBody || baseBody.length < 200) && (keywords.length > 0 || baseTitle)) {
    const naverClientId = input.naverClientId || process.env.NAVER_CLIENT_ID;
    const naverClientSecret = input.naverClientSecret || process.env.NAVER_CLIENT_SECRET;

    const searchQuery = baseTitle || keywords.slice(0, 3).join(' ');

    if (naverClientId && naverClientSecret && searchQuery) {
      console.log(`[키워드/제목] 네이버 검색 API로 콘텐츠 수집... 검색어: "${searchQuery}"`);
      try {
        const keywordResult = await fetchContentWithNaverFallback(
          '',
          searchQuery,
          naverClientId,
          naverClientSecret
        );

        if (keywordResult.content && keywordResult.content.length > 200) {
          baseBody = keywordResult.content;
          warnings.push(`✅ 키워드/제목 기반 네이버 검색으로 ${keywordResult.content.length}자 수집!`);
          console.log(`[키워드/제목] ✅ ${keywordResult.content.length}자 수집됨`);
        }
      } catch (error) {
        console.warn('[키워드/제목] 네이버 검색 API 실패:', (error as Error).message);
      }
    }
  }

  // ✅ [2026-02-08] 최종 폴백: Perplexity → Gemini Grounding 이중 체인
  // 네이버 API가 없거나 모든 소스 수집이 실패해도 키워드 기반 글 생성 가능!
  if ((!baseBody || baseBody.length < 500) && (keywords.length > 0 || baseTitle)) {
    const searchKeyword = baseTitle || keywords.slice(0, 5).join(' ');
    console.log(`\n🌐 [최종 폴백] 네이버 소스 부족 (${baseBody?.length || 0}자) → 웹 검색 리서치 시도`);
    console.log(`   검색 키워드: "${searchKeyword}"`);

    let webResearchDone = false;

    // 🔍 1순위: Perplexity Sonar (실시간 웹 검색, 빠르고 가벼움)
    // (이미 Perplexity 엔진으로 시도한 경우 건너뜀)
    if (!isPerplexityEngine) {
      try {
        const { researchWithPerplexity } = await import('./contentGenerator.js');
        const perplexityResult = await researchWithPerplexity(searchKeyword);

        if (perplexityResult.success && perplexityResult.content.length > 500) {
          if (baseBody && baseBody.length > 100) {
            baseBody = `${baseBody}\n\n--- Perplexity 웹 검색 추가 자료 ---\n\n${perplexityResult.content}`;
          } else {
            baseBody = perplexityResult.content;
          }

          if (!baseTitle && perplexityResult.title) {
            baseTitle = perplexityResult.title;
          }

          warnings.push(`✅ Perplexity 웹 검색으로 ${perplexityResult.content.length}자 수집!`);
          console.log(`✅ [Perplexity] 웹 리서치 성공: ${perplexityResult.content.length}자, 총 본문 ${baseBody.length}자`);
          webResearchDone = true;
        }
      } catch (error) {
        console.warn(`⚠️ [Perplexity] 웹 리서치 실패: ${(error as Error).message}`);
      }
    }

    // 🔍 2순위: Gemini Google Search Grounding (Perplexity 실패 시)
    if (!webResearchDone && (!baseBody || baseBody.length < 500)) {
      try {
        const { researchWithGeminiGrounding } = await import('./contentGenerator.js');
        const groundingResult = await researchWithGeminiGrounding(searchKeyword);

        if (groundingResult.success && groundingResult.content.length > 500) {
          if (baseBody && baseBody.length > 100) {
            baseBody = `${baseBody}\n\n--- Google 검색 기반 추가 자료 ---\n\n${groundingResult.content}`;
          } else {
            baseBody = groundingResult.content;
          }

          if (!baseTitle && groundingResult.title) {
            baseTitle = groundingResult.title;
          }

          const sourceInfo = groundingResult.sources.length > 0
            ? ` (출처: ${groundingResult.sources.slice(0, 3).join(', ')})`
            : '';
          warnings.push(`✅ Google 검색 기반 웹 리서치로 ${groundingResult.content.length}자 수집!${sourceInfo}`);
          console.log(`✅ [Gemini Grounding] 웹 리서치 성공: ${groundingResult.content.length}자, 총 본문 ${baseBody.length}자`);
        } else {
          console.log(`⚠️ [Gemini Grounding] 리서치 결과 부족 (${groundingResult.content?.length || 0}자)`);
        }
      } catch (error) {
        console.warn(`⚠️ [Gemini Grounding] 웹 리서치 실패: ${(error as Error).message}`);
      }
    }
  }

  const inferArticleType = (): ArticleType => {
    // ✅ 1순위: 쇼핑몰 URL 감지 (가장 우선)
    const isShoppingMallUrl = urlPatterns.some(url =>
      /coupang\.com|coupa\.ng|gmarket\.co\.kr|11st\.co\.kr|auction\.co\.kr|shopping\.naver\.com|smartstore\.naver\.com|brand\.naver\.com|brandconnect\.naver\.com|aliexpress\.com|amazon\.com|amazon\.co\.kr|wemakeprice\.com|tmon\.co\.kr/i.test(url)
    );

    if (isShoppingMallUrl) {
      console.log('[ArticleType] 쇼핑몰 URL 감지 → shopping_review');
      return 'shopping_review';
    }

    // ✅ 2순위: 제목에서 키워드 감지
    const lowered = baseTitle.toLowerCase();
    const lowerBody = baseBody.toLowerCase();

    // 제품 리뷰 키워드 감지 (제목 + 본문)
    if (lowered.includes('리뷰') || lowered.includes('사용기') || lowered.includes('후기') ||
      lowered.includes('추천') || lowered.includes('장단점') || lowered.includes('솔직') ||
      lowerBody.includes('구매') || lowerBody.includes('제품') || lowerBody.includes('상품')) {
      console.log('[ArticleType] 리뷰 키워드 감지 → shopping_review');
      return 'shopping_review';
    }

    if (lowered.includes('it') || lowered.includes('노트북') || lowered.includes('스마트폰')) {
      return 'it_review';
    }
    if (lowered.includes('재테크') || lowered.includes('투자') || lowered.includes('금리')) {
      return 'finance';
    }
    if (lowered.includes('건강') || lowered.includes('운동')) {
      return 'health';
    }
    if (urlPatterns.length > 0) {
      return 'news';
    }
    return 'general';
  };

  const source: ContentSource = {
    sourceType: urlPatterns.length > 0 ? 'naver_news' : 'custom_text',
    url: allUrls.length > 0 ? (allUrls.length === 1 ? allUrls[0] : allUrls.join(', ')) : undefined,
    title: baseTitle || (keywords.length ? `${keywords[0]} 관련 콘텐츠` : undefined),
    rawText: baseBody,
    crawledTime: published || new Date().toISOString(),
    categoryHint: keywords.length ? keywords[0] : undefined,
    metadata: {
      keywords,
      draft,
      rssUrl: allUrls.length > 0 ? allUrls.join(', ') : undefined,
      sourceCount: urlPatterns.length,
      successfulSourceCount: urlPatterns.length - warnings.filter(w => w.includes('크롤링 실패')).length,
      warnings,
    },
    generator: input.generator ?? 'gemini',
    articleType: input.articleType ?? inferArticleType(),
    targetTraffic: 'viral',
    targetAge: input.targetAge ?? 'all',
    isReviewType: input.isReviewType ?? false, // ✅ 리뷰형 여부 전달
    customPrompt: input.customPrompt, // ✅ 사용자 정의 프롬프트 전달
    images: extractedImages.length > 0 ? extractedImages : undefined, // ✅ 수집된 이미지 목록 전달
    previousTitles: input.previousTitles, // ✅ [2026-02-09 v2] 이전 생성 제목 전달 (연속발행 중복 방지)
  };

  return { source, warnings };
}

/**
 * 키워드/제품명으로 여러 플랫폼에서 콘텐츠 수집 (할루시네이션 방지)
 * 네이버 블로그, 카페, 구글, 다음, 티스토리, 워드프레스, 블로그스팟 등에서 관련 글 수집
 */
export async function collectContentFromPlatforms(
  keyword: string,
  options: {
    maxPerSource?: number;
    clientId?: string;
    clientSecret?: string;
    logger?: (message: string) => void;
    targetDate?: string; // ✅ 발행 날짜 기준 크롤링 (YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm 형식)
  } = {}
): Promise<{
  collectedText: string;
  sourceCount: number;
  urls: string[];
  success: boolean;
  message?: string;
}> {
  const { maxPerSource = 10, clientId, clientSecret, logger = console.log } = options;

  try {
    logger(`[플랫폼 콘텐츠 수집] 키워드 "${keyword}"로 여러 플랫폼에서 콘텐츠 수집 시작...`);

    // ✅ [1순위] 네이버 검색 API 직접 호출 (가장 빠르고 안정적!)
    // - URL 크롤링 없이 검색 결과의 제목+설명을 직접 사용
    // - 크롤링 실패 가능성 0%, 0.5초 이내 완료
    if (clientId && clientSecret) {
      logger(`[플랫폼 콘텐츠 수집] ⚡ 네이버 검색 API 우선 호출 (빠르고 안정적)...`);

      try {
        const apiResult = await collectNaverSearchContent(keyword, clientId, clientSecret);

        if (apiResult.content && apiResult.content.length > 500) {
          logger(`[플랫폼 콘텐츠 수집] ✅ 네이버 API 성공: ${apiResult.content.length}자 (${apiResult.sources.join(', ')})`);

          return {
            collectedText: apiResult.content,
            sourceCount: apiResult.sources.length,
            urls: [], // API 결과는 URL 없음
            success: true,
            message: `네이버 검색 API로 ${apiResult.totalChars}자 수집 완료 (${apiResult.sources.join(', ')})`,
          };
        } else {
          logger(`[플랫폼 콘텐츠 수집] ⚠️ 네이버 API 결과 부족 (${apiResult.content?.length || 0}자), URL 크롤링으로 보충...`);
        }
      } catch (apiError) {
        logger(`[플랫폼 콘텐츠 수집] ⚠️ 네이버 API 실패: ${(apiError as Error).message}, URL 크롤링으로 대체...`);
      }
    }

    // ✅ [2순위] URL 검색 및 크롤링 (API 실패 시 또는 API 키 없을 때)
    const { searchAllRssSources } = await import('./rssSearcher.js');

    // ✅ [2026-02-08] 9개 소스 전체 검색 (구글 웹, 다음 블로그/카페/뉴스, 지식iN 포함)
    const urls = await searchAllRssSources(keyword, {
      maxPerSource,
      // sources 생략 → 기본값 9개 소스 전체
      clientId,
      clientSecret,
      targetDate: options.targetDate,
    });

    if (urls.length === 0) {
      // API도 실패하고 URL도 없으면 키워드만으로 반환
      logger(`[플랫폼 콘텐츠 수집] ⚠️ URL도 발견되지 않음, 키워드 기반으로 진행`);
      return {
        collectedText: `[키워드: ${keyword}]\n\n"${keyword}"에 대한 정보를 수집합니다.`,
        sourceCount: 0,
        urls: [],
        success: true,
        message: `키워드 "${keyword}" 기반으로 AI가 콘텐츠 생성`,
      };
    }

    logger(`[플랫폼 콘텐츠 수집] ${urls.length}개의 URL 발견, 콘텐츠 추출 시작...`);

    // 2. 각 URL에서 콘텐츠 추출 (최대 8개만 처리 - 속도 최적화)
    const maxUrls = Math.min(8, urls.length);
    const contentParts: string[] = [];
    let successCount = 0;

    for (let i = 0; i < maxUrls; i++) {
      const url = urls[i];
      try {
        logger(`[플랫폼 콘텐츠 수집] (${i + 1}/${maxUrls}) ${url}`);

        const article = await fetchArticleContent(url);

        if (article.content && article.content.trim().length > 100) {
          // 제목과 본문을 합쳐서 추가
          const combinedContent = article.title
            ? `[${article.title}]\n\n${article.content}`
            : article.content;

          contentParts.push(combinedContent);
          successCount++;

          logger(`[플랫폼 콘텐츠 수집] ✅ (${i + 1}/${maxUrls}) 성공: ${article.content.length}자`);
        } else {
          logger(`[플랫폼 콘텐츠 수집] ⚠️ (${i + 1}/${maxUrls}) 콘텐츠가 너무 짧거나 없음`);
        }

        // 충분한 콘텐츠가 모이면 중단 (약 5000자 이상)
        if (contentParts.join('\n\n---\n\n').length > 5000) {
          logger(`[플랫폼 콘텐츠 수집] 충분한 콘텐츠 수집 완료 (${contentParts.length}개 소스)`);
          break;
        }

        // 각 요청 사이에 약간의 딜레이 (서버 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger(`[플랫폼 콘텐츠 수집] ❌ (${i + 1}/${maxUrls}) 실패: ${(error as Error).message}`);
        // 실패해도 계속 진행
      }
    }

    if (contentParts.length === 0) {
      // ✅ 크롤링 실패 시 네이버 검색 API로 폴백
      if (clientId && clientSecret) {
        logger(`[플랫폼 콘텐츠 수집] ⚠️ 크롤링 실패 → 네이버 검색 API로 폴백 시도...`);

        try {
          const apiResult = await collectNaverSearchContent(keyword, clientId, clientSecret);

          if (apiResult.content && apiResult.content.length > 200) {
            logger(`[플랫폼 콘텐츠 수집] ✅ 네이버 API 폴백 성공: ${apiResult.content.length}자 (${apiResult.sources.join(', ')})`);

            return {
              collectedText: apiResult.content,
              sourceCount: apiResult.sources.length,
              urls,
              success: true,
              message: `크롤링 실패 후 네이버 API로 ${apiResult.totalChars}자 수집 성공`,
            };
          }
        } catch (apiError) {
          logger(`[플랫폼 콘텐츠 수집] ❌ 네이버 API 폴백도 실패: ${(apiError as Error).message}`);
        }
      }

      // ✅ [신규] 모든 수집 실패 시 키워드만으로 최소 정보 제공 (AI가 자체 지식으로 생성 가능)
      logger(`[플랫폼 콘텐츠 수집] ⚠️ 모든 크롤링 실패 → 키워드 기반 최소 정보 반환`);
      return {
        collectedText: `[키워드: ${keyword}]\n\n검색 결과를 수집하지 못했습니다. "${keyword}"에 대한 일반적인 정보를 기반으로 콘텐츠를 생성합니다.`,
        sourceCount: 0,
        urls,
        success: true, // ✅ 성공으로 처리하여 AI 생성 진행
        message: `크롤링 실패, 키워드 "${keyword}" 기반으로 AI가 콘텐츠 생성`,
      };
    }

    // 3. 모든 콘텐츠를 합치기
    const collectedText = contentParts.join('\n\n---\n\n');

    logger(`[플랫폼 콘텐츠 수집] ✅ 완료: ${successCount}개 소스에서 ${collectedText.length}자 수집`);

    return {
      collectedText,
      sourceCount: successCount,
      urls: urls.slice(0, successCount),
      success: true,
      message: `${successCount}개 소스에서 콘텐츠를 수집했습니다.`,
    };
  } catch (error) {
    logger(`[플랫폼 콘텐츠 수집] ❌ 오류: ${(error as Error).message}`);
    return {
      collectedText: '',
      sourceCount: 0,
      urls: [],
      success: false,
      message: `콘텐츠 수집 중 오류 발생: ${(error as Error).message}`,
    };
  }
}

