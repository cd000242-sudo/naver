import { getChromiumExecutablePath } from './browserUtils.js';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const NAVER_BLOG_MOBILE_FIRST_TIMEOUT_MS = 12000;
const NAVER_BLOG_MOBILE_FALLBACK_TIMEOUT_MS = 8000;
const NAVER_BLOG_PLAYWRIGHT_GOTO_TIMEOUT_MS = 18000;
const NAVER_BLOG_FAST_PATH_MIN_CHARS = 500;
const NAVER_BLOG_FAST_PATH_MIN_PARAGRAPHS = 3;

function cleanNaverBlogText(text: string): string {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldSkipNaverBlogSnippet(text: string): boolean {
  if (!text || text.length < 2) return true;
  if (/^(공감|댓글|공유|이웃추가|본문 기타 기능|블로그 검색|카테고리|태그|URL 복사)$/i.test(text)) return true;
  if (/^(좋아요|구독|팔로우|전체보기|목록열기|닫기|신고하기)$/i.test(text)) return true;
  return false;
}

function isNaverBlogShellContent(content: string): boolean {
  const normalized = cleanNaverBlogText(content);
  if (!normalized || normalized.length >= 900) return false;

  const compact = normalized.replace(/\s+/g, '');
  const shellPatterns = [
    /블로그소개/,
    /이웃추가/,
    /전체글보기/,
    /카테고리/,
    /프로필/,
    /구독/,
    /방문자/,
    /팔로워/,
  ];
  const matchCount = shellPatterns.filter(pattern => pattern.test(compact)).length;
  return matchCount >= 2;
}

function normalizeNaverImageUrl(url: string): string {
  return String(url || '')
    .replace(/&amp;/g, '&')
    .replace(/^\/\//, 'https://')
    .trim();
}

function isUsefulNaverBlogImage(url: string): boolean {
  const normalized = normalizeNaverImageUrl(url);
  if (!/^https?:\/\//i.test(normalized)) return false;
  if (/\/(?:nblog|static|imgs)\//i.test(normalized)) return false;
  if (/(?:btn_|ico_|spc\.gif|banner|widget|personacon|blogpfthumb|profile|favicon)/i.test(normalized)) return false;
  return /(?:postfiles|blogfiles|phinf|pstatic|naver\.net)/i.test(normalized)
    || /\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(normalized);
}

function assessNaverBlogCrawlQuality(content: string): { passed: boolean; reason: string; paragraphCount: number; charCount: number } {
  const paragraphs = String(content || '')
    .split(/\n{2,}/)
    .map(cleanNaverBlogText)
    .filter(text => text.length >= 20);
  const charCount = cleanNaverBlogText(content).length;

  if (isNaverBlogShellContent(content)) {
    return { passed: false, reason: 'profile-like blog shell content', paragraphCount: paragraphs.length, charCount };
  }
  if (charCount >= NAVER_BLOG_FAST_PATH_MIN_CHARS && paragraphs.length >= NAVER_BLOG_FAST_PATH_MIN_PARAGRAPHS) {
    return { passed: true, reason: 'rich mobile PostView content', paragraphCount: paragraphs.length, charCount };
  }
  if (charCount >= 800 && paragraphs.length >= 2) {
    return { passed: true, reason: 'long mobile PostView content', paragraphCount: paragraphs.length, charCount };
  }
  return {
    passed: false,
    reason: `too shallow (${charCount} chars, ${paragraphs.length} paragraphs)`,
    paragraphCount: paragraphs.length,
    charCount,
  };
}

async function parseNaverBlogMobileHtml(html: string): Promise<{ title?: string; content: string; images: string[] }> {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  $('script, style, noscript, iframe, nav, header, footer, .ad, .advertisement, .u_likeit, .post_btns, .comment_area').remove();

  const title = cleanNaverBlogText(
    $('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || $('.se-title-text').first().text()
    || $('.pcol1, .htitle, ._title').first().text()
    || $('title').first().text()
    || ''
  ).replace(/\s*:\s*네이버\s*블로그\s*$/i, '') || undefined;

  const seen = new Set<string>();
  const paragraphs: string[] = [];
  const addParagraph = (value: string) => {
    const text = cleanNaverBlogText(value);
    if (shouldSkipNaverBlogSnippet(text)) return;
    const key = text.replace(/\s+/g, '').slice(0, 120);
    if (!key || seen.has(key)) return;
    seen.add(key);
    paragraphs.push(text);
  };

  const atomicSelectors = [
    '.se-main-container .se-text-paragraph',
    '.se-main-container .se-module-text',
    '.se-main-container .se-component-content',
    '.se-main-container .se-section-text',
    '#postViewArea .se-text-paragraph',
    '#postViewArea .se-module-text',
    '#postViewArea p',
    '#postViewArea li',
    '#postViewArea blockquote',
    '.post-view p',
    '.post-view li',
  ];

  for (const selector of atomicSelectors) {
    $(selector).each((_, element) => addParagraph($(element).text()));
  }

  if (paragraphs.join('').length < 300) {
    const containerSelectors = ['.se-main-container', '#postViewArea', '#post-view', '.post-view', 'article'];
    for (const selector of containerSelectors) {
      const text = cleanNaverBlogText($(selector).first().text());
      if (text.length <= paragraphs.join('').length) continue;

      paragraphs.length = 0;
      seen.clear();
      text
        .split(/(?<=[.!?。！？]|다\.|요\.|니다\.)\s+/)
        .map(cleanNaverBlogText)
        .forEach(addParagraph);

      if (paragraphs.join('').length >= 300) break;
    }
  }

  const images: string[] = [];
  const addImage = (value?: string | null) => {
    const src = normalizeNaverImageUrl(value || '');
    if (src && isUsefulNaverBlogImage(src) && !images.includes(src)) {
      images.push(src);
    }
  };

  addImage($('meta[property="og:image"]').attr('content'));
  $('img, .se-image-resource, [data-linktype="img"], [style*="background-image"]').each((_, element) => {
    const el = $(element);
    addImage(
      el.attr('src')
      || el.attr('data-src')
      || el.attr('data-lazy-src')
      || el.attr('data-original')
      || el.attr('data-image-src')
      || el.attr('data-url')
    );
    const styleUrl = (el.attr('style') || '').match(/url\(['"]?([^'")\s]+)['"]?\)/i)?.[1];
    addImage(styleUrl);
  });

  return {
    title,
    content: paragraphs.join('\n\n'),
    images,
  };
}

/**
 * ✅ [2026-01-30] 네이버 블로그 모바일 API 폴백
 * PostView.naver API는 iframe 없이 직접 본문을 반환
 */
export async function fetchNaverBlogMobileApi(
  blogId: string,
  logNo: string,
  logger?: (message: string) => void,
  timeoutMs: number = NAVER_BLOG_MOBILE_FIRST_TIMEOUT_MS
): Promise<{ title?: string; content?: string; images?: string[] }> {
  const log = logger || console.log;

  try {
    const mobileUrl = `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&proxyReferer=`;
    log(`[모바일 API] 시도: ${mobileUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(mobileUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://m.blog.naver.com/',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    const parsed = await parseNaverBlogMobileHtml(html);
    const quality = assessNaverBlogCrawlQuality(parsed.content);
    if (quality.passed) {
      log(`[NaverBlog] mobile PostView rich crawl success: ${quality.charCount} chars, ${quality.paragraphCount} paragraphs, images=${parsed.images.length}`);
      return parsed;
    }
    throw new Error(`모바일 PostView 본문 품질 부족: ${quality.reason}`);
  } catch (error) {
    log(`[모바일 API] ❌ 실패: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * ✅ [2026-01-30] URL에서 blogId와 logNo 추출
 */
export function extractBlogParams(url: string): { blogId?: string; logNo?: string } {
  // 패턴 1: blog.naver.com/blogId/logNo
  const pattern1 = url.match(/blog\.naver\.com\/([^\/\?]+)\/(\d+)/);
  if (pattern1) {
    return { blogId: pattern1[1], logNo: pattern1[2] };
  }

  // 패턴 2: blog.naver.com/PostView.naver?blogId=xxx&logNo=yyy
  const blogIdMatch = url.match(/blogId=([^&]+)/);
  const logNoMatch = url.match(/logNo=(\d+)/);
  if (blogIdMatch && logNoMatch) {
    return { blogId: blogIdMatch[1], logNo: logNoMatch[1] };
  }

  return {};
}

/**
 * Playwright를 사용한 네이버 블로그 크롤링
 * iframe 구조를 포함한 전체 본문 추출 가능
 * ✅ [2026-03-09 v2] Playwright 1순위 → 모바일 API 폴백
 *   1순위: Playwright + Stealth (크롬 띄워서 JS 렌더링, 가장 확실!)
 *   2순위: 모바일 API (Playwright 실패 시 폴백)
 */
export async function crawlNaverBlogWithPuppeteer(
  url: string,
  logger?: (message: string) => void,
): Promise<{ title?: string; content?: string; images?: string[] }> {

  const log = logger || console.log;
  const { blogId, logNo } = extractBlogParams(url);

  // ✅ 1순위: Playwright + Stealth (크롬 띄워서 크롤링 - 가장 확실한 방법!)
  if (blogId && logNo) {
    log(`[NaverBlog] mobile PostView fast path start: blogId=${blogId}, logNo=${logNo}`);
    try {
      const mobileResult = await fetchNaverBlogMobileApi(blogId, logNo, log, NAVER_BLOG_MOBILE_FIRST_TIMEOUT_MS);
      if (mobileResult.content && mobileResult.content.trim().length >= 200) {
        log(`[NaverBlog] mobile PostView fast path success (${mobileResult.content.length} chars)`);
        return mobileResult;
      }
      log(`[NaverBlog] mobile PostView content too short (${mobileResult.content?.length || 0} chars); falling back to Playwright`);
    } catch (mobileError) {
      log(`[NaverBlog] mobile PostView fast path failed: ${(mobileError as Error).message}; falling back to Playwright`);
    }
  }

  let browser: any = null;


  try {
    const { chromium } = await import('playwright-extra');
    chromium.use(StealthPlugin());

    const execPath = await getChromiumExecutablePath();
    log(`[Playwright 크롤링 시작] ${url} (execPath: ${execPath || 'default'})`);

    browser = await chromium.launch({
      headless: true,
      ...(execPath ? { executablePath: execPath } : {}),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,720',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      extraHTTPHeaders: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const page = await context.newPage();

    // ⭐ 자동화 감지 방지
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // 네이버 블로그 URL로 이동
    log(`[Playwright] 페이지 로드 중...`);
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVER_BLOG_PLAYWRIGHT_GOTO_TIMEOUT_MS,
    });

    // HTTP 상태 코드 확인
    if (response) {
      const status = response.status();
      if (status === 404) {
        throw new Error('❌ 존재하지 않는 페이지입니다. (404 Not Found)');
      }
      if (status >= 400) {
        throw new Error(`❌ 페이지 접근 오류 (HTTP ${status})`);
      }
      log(`[HTTP 상태] ${status} OK`);
    }

    // ✅ 페이지 로딩 대기 (iframe 렌더링 대기)
    await page.waitForTimeout(1200);

    // iframe이 있는지 확인하고 로드 대기
    const hasIframe = await page.evaluate(() => {
      const iframe = document.querySelector('iframe#mainFrame, iframe.se-main-container');
      return !!iframe;
    });

    if (hasIframe) {
      log('[iframe 감지] iframe 콘텐츠 로드 대기 중...');
      await page.waitForTimeout(1800);

      // ✅ 스크롤하여 lazy-load 이미지 로드
      try {
        const scrollFrame = page.frame({ name: 'mainFrame' });
        if (scrollFrame) {
          await scrollFrame.evaluate(async () => {
            const scrollHeight = document.body.scrollHeight || 5000;
            const maxScroll = Math.min(scrollHeight, 6000);
            for (let i = 0; i < maxScroll; i += 700) {
              window.scrollTo(0, i);
              await new Promise(r => setTimeout(r, 60));
            }
            window.scrollTo(0, 0);
          });
          log('[iframe 스크롤] lazy-load 이미지 로드 완료');
        }
      } catch (scrollErr) {
        // 스크롤 실패는 무시
      }
    }

    // 오류 페이지 감지
    const errorCheck = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      const htmlContent = document.documentElement.innerHTML;

      const errorPatterns = [
        '삭제되었거나 없는 게시글입니다',
        '존재하지 않는 게시글',
        '일시적인 오류가 발생했습니다',
        '게시글을 찾을 수 없습니다',
        '비공개 게시글입니다',
        '접근 권한이 없습니다',
        '올바르지 않은 접근입니다',
        '404 Not Found',
        'Page Not Found',
        '페이지를 찾을 수 없습니다',
        '잘못된 경로',
        '서비스 점검 중',
        '일시적으로 사용할 수 없는 서비스',
      ];

      for (const pattern of errorPatterns) {
        if (bodyText.includes(pattern) || htmlContent.includes(pattern)) {
          return { isError: true, message: pattern };
        }
      }

      const hasContent = htmlContent.includes('iframe') ||
        htmlContent.includes('img') ||
        bodyText.trim().length >= 10;

      if (!hasContent) {
        return { isError: true, message: '페이지에 콘텐츠가 없습니다' };
      }

      return { isError: false, message: '' };
    });

    if (errorCheck.isError) {
      throw new Error(`❌ 오류 페이지 감지: ${errorCheck.message}\n이 URL은 크롤링할 수 없습니다.`);
    }

    log('[페이지 검증] 정상 페이지 확인됨');

    // ✅ iframe 내부 콘텐츠 추출 (Playwright frame API 사용)
    let title: string | undefined;
    let contentData: string | null = null;
    let images: string[] = [];

    // 1차: iframe 내부에서 추출 시도 (Playwright의 frame() API)
    const mainFrame = page.frame({ name: 'mainFrame' });

    if (mainFrame) {
      log('[Playwright] mainFrame iframe 접근 성공');

      // 제목 추출 (iframe 내부)
      title = await mainFrame.evaluate(() => {
        const seTitle = document.querySelector('.se-title-text')?.textContent?.trim();
        if (seTitle && seTitle.length > 5) return seTitle;

        const pcolTitle = document.querySelector('.pcol1, .htitle, ._title')?.textContent?.trim();
        if (pcolTitle && pcolTitle.length > 5) return pcolTitle;

        const h3Title = document.querySelector('h3.se_textarea, h3')?.textContent?.trim();
        if (h3Title && h3Title.length > 5) return h3Title;

        return null;
      }) || undefined;

      // 본문 추출 (iframe 내부)
      contentData = await mainFrame.evaluate(() => {
        const contentSelectors = [
          '#postViewArea',
          '.se-main-container',
          '.se-component-content',
          '.se-section-text',
          '#postView',
          '.post-view',
        ];

        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const clone = element.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, .ad, .advertisement').forEach(el => el.remove());
            let text = clone.textContent || '';
            text = text.trim().replace(/\s+/g, ' ');
            if (text.length > 200) return text;
          }
        }

        // body 전체
        let bodyText = document.body.textContent || '';
        bodyText = bodyText.trim().replace(/\s+/g, ' ');
        if (bodyText.length > 200) return bodyText;

        return null;
      });

      // 이미지 추출 (iframe 내부)
      images = await mainFrame.evaluate(() => {
        const imageUrls: string[] = [];

        const isUIElement = (imgUrl: string): boolean => {
          return imgUrl.includes('/nblog/') ||
            imgUrl.includes('/static/') ||
            imgUrl.includes('/imgs/') ||
            imgUrl.includes('btn_') ||
            imgUrl.includes('ico_') ||
            imgUrl.includes('spc.gif') ||
            imgUrl.includes('banner') ||
            imgUrl.includes('widget') ||
            imgUrl.includes('personacon') ||
            imgUrl.includes('blogpfthumb') ||
            imgUrl.includes('_icon') ||
            imgUrl.includes('profile') ||
            (imgUrl.endsWith('.gif') && !imgUrl.includes('postfiles'));
        };

        const extractImageUrl = (img: Element): string | null => {
          const attrs = ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-image-src', 'data-url'];
          for (const attr of attrs) {
            const value = img.getAttribute(attr);
            if (value && value.startsWith('http')) return value;
          }
          const style = img.getAttribute('style') || '';
          const bgMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
          if (bgMatch) return bgMatch[1];
          return null;
        };

        const contentSelectors = [
          '#postViewArea', '.se-main-container', '.se-component-content',
          '.se-section-text', '.se-image-resource', '.se-module-image',
          '#postView', '.post-view', 'article', '.post-content', '.blog-post',
        ];

        let contentContainer: Element | null = null;
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) { contentContainer = element; break; }
        }

        const searchContainer = contentContainer || document.body;
        const imgElements = searchContainer.querySelectorAll('img, .se-image-resource, [data-linktype="img"]');

        imgElements.forEach(img => {
          const src = extractImageUrl(img);
          if (src) {
            if (src.includes('postfiles.pstatic.net') ||
              src.includes('blogfiles.pstatic.net') ||
              src.includes('phinf.pstatic.net') ||
              (src.includes('naver.net') && !isUIElement(src))) {
              if (!imageUrls.includes(src)) imageUrls.push(src);
            }
          }
        });

        return Array.from(new Set(imageUrls));
      });
    }

    // 2차: iframe 없거나 실패한 경우 메인 페이지에서 추출
    if (!title) {
      title = await page.evaluate(() => {
        // 브랜드 커넥트 제목
        if (window.location.href.includes('brandconnect.naver.com')) {
          const productTitle = document.querySelector('.product_title, .product-title, .productTitle, h1, h2')?.textContent?.trim();
          if (productTitle) return productTitle;
        }

        // og:title
        const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
        if (ogTitle) return ogTitle.replace(/ : 네이버 블로그$/, '').trim();

        return document.title.split('|')[0].trim() || document.title.split('-')[0].trim();
      }) || undefined;
    }

    if (!contentData) {
      contentData = await page.evaluate(() => {
        // 브랜드 커넥트
        if (window.location.href.includes('brandconnect.naver.com')) {
          const productInfo: string[] = [];
          const productName = document.querySelector('.product_title, .product-title, h1, h2')?.textContent?.trim();
          if (productName) productInfo.push(`제품명: ${productName}`);
          const productDesc = document.querySelector('.product_description, .product-description, .description')?.textContent?.trim();
          if (productDesc) productInfo.push(`제품 설명: ${productDesc}`);
          const result = productInfo.join('\n\n');
          if (result.length > 100) return result;
        }

        const mainSelectors = [
          '#postViewArea', '.se-main-container', '.se-component-content',
          'article', '.post-content',
        ];
        for (const selector of mainSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const clone = element.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, .ad, .advertisement').forEach(el => el.remove());
            let text = clone.textContent || '';
            text = text.trim().replace(/\s+/g, ' ');
            if (text.length > 200) return text;
          }
        }
        return null;
      });
    }

    if (images.length === 0) {
      const mainImages = await page.evaluate(() => {
        const imageUrls: string[] = [];

        const isUIElement = (imgUrl: string): boolean => {
          return imgUrl.includes('/nblog/') || imgUrl.includes('/static/') || imgUrl.includes('/imgs/') ||
            imgUrl.includes('btn_') || imgUrl.includes('ico_') || imgUrl.includes('spc.gif') ||
            imgUrl.includes('banner') || imgUrl.includes('widget') || imgUrl.includes('personacon') ||
            imgUrl.includes('blogpfthumb') || imgUrl.includes('_icon') || imgUrl.includes('profile') ||
            (imgUrl.endsWith('.gif') && !imgUrl.includes('postfiles'));
        };

        const extractImageUrl = (img: Element): string | null => {
          const attrs = ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-image-src', 'data-url'];
          for (const attr of attrs) {
            const value = img.getAttribute(attr);
            if (value && value.startsWith('http')) return value;
          }
          return null;
        };

        const mainSelectors = ['#postViewArea', '.se-main-container', '.se-image-resource', 'article', '.post-content'];
        let container: Element | null = null;
        for (const selector of mainSelectors) {
          const element = document.querySelector(selector);
          if (element) { container = element; break; }
        }

        const searchContainer = container || document.body;
        searchContainer.querySelectorAll('img, .se-image-resource, [data-linktype="img"]').forEach(img => {
          const src = extractImageUrl(img);
          if (src) {
            if (src.includes('postfiles.pstatic.net') || src.includes('blogfiles.pstatic.net') ||
              src.includes('phinf.pstatic.net') || (src.includes('naver.net') && !isUIElement(src))) {
              if (!imageUrls.includes(src)) imageUrls.push(src);
            }
          }
        });

        return Array.from(new Set(imageUrls));
      });
      images = mainImages;
    }

    // 본문 검증
    const isBrandConnect = url.includes('brandconnect.naver.com');
    const minContentLength = isBrandConnect ? 100 : 200;

    if (!contentData || contentData.length < minContentLength) {
      log(`⚠️ 본문 추출 실패 또는 내용이 너무 짧습니다 (${contentData?.length || 0}자, 최소 ${minContentLength}자 필요)`);
      throw new Error('❌ 본문 내용이 부족합니다. 이 페이지는 정상적인 블로그 글이 아닌 것으로 보입니다.');
    }

    log(`[제목 추출] ${title || '없음'}`);
    log(`✅ 본문 추출 성공 (${contentData.length}자)${isBrandConnect ? ' [브랜드 커넥트]' : ''}`);

    if (images.length > 0) {
      log(`✅ 이미지 ${images.length}개 추출 성공`);
    }

    return {
      title: title || undefined,
      content: contentData || undefined,
      images: images.length > 0 ? images : undefined,
    };

  } catch (error) {
    log(`❌ Playwright 크롤링 실패: ${(error as Error).message}`);

    // ✅ 2순위: 모바일 API 폴백 (Playwright 실패 시)
    if (blogId && logNo) {
      log(`[폴백] 모바일 API로 최종 재시도...`);
      try {
        const mobileResult = await fetchNaverBlogMobileApi(blogId, logNo, log, NAVER_BLOG_MOBILE_FALLBACK_TIMEOUT_MS);
        if (mobileResult.content && mobileResult.content.length >= 100) {
          log(`[폴백] ✅ 모바일 API 성공!`);
          return mobileResult;
        }
      } catch (mobileError) {
        log(`[폴백] ❌ 모바일 API도 실패: ${(mobileError as Error).message}`);
      }
    }

    throw new Error(`네이버 블로그 크롤링 실패: ${(error as Error).message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
      log(`[Playwright 브라우저 종료]`);
    }
  }
}
