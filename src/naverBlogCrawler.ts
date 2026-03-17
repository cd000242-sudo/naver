import { getChromiumExecutablePath } from './browserUtils.js';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * ✅ [2026-01-30] 네이버 블로그 모바일 API 폴백
 * PostView.naver API는 iframe 없이 직접 본문을 반환
 */
export async function fetchNaverBlogMobileApi(
  blogId: string,
  logNo: string,
  logger?: (message: string) => void
): Promise<{ title?: string; content?: string; images?: string[] }> {
  const log = logger || console.log;

  try {
    const mobileUrl = `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&proxyReferer=`;
    log(`[모바일 API] 시도: ${mobileUrl}`);

    const response = await fetch(mobileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://m.blog.naver.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // 제목 추출
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1].replace(/ : 네이버 블로그$/, '').trim() : undefined;

    // 본문 추출 (se-main-container, postViewArea 등)
    let content = '';

    // 방법 1: se-main-container 찾기
    const seMainMatch = html.match(/<div class="se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="se-(?:viewer|footer)/);
    if (seMainMatch) {
      content = seMainMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // 방법 2: postViewArea 찾기
    if (!content || content.length < 100) {
      const postViewMatch = html.match(/id="postViewArea"[^>]*>([\s\S]*?)<\/div>/);
      if (postViewMatch) {
        content = postViewMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    // 방법 3: se-component-text 클래스들 찾기
    if (!content || content.length < 100) {
      const textMatches = html.matchAll(/<span class="se-fs-[^"]*"[^>]*>([^<]+)<\/span>/g);
      const texts: string[] = [];
      for (const match of textMatches) {
        texts.push(match[1]);
      }
      content = texts.join(' ').replace(/\s+/g, ' ').trim();
    }

    // 이미지 추출
    const images: string[] = [];
    const imgMatches = html.matchAll(/src="(https?:\/\/[^"]*(?:postfiles|blogfiles|phinf)[^"]*\.(?:jpg|jpeg|png|gif|webp)[^"]*)"/gi);
    for (const match of imgMatches) {
      if (!images.includes(match[1])) {
        images.push(match[1]);
      }
    }

    if (content && content.length >= 100) {
      log(`[모바일 API] ✅ 성공: ${content.length}자, 이미지 ${images.length}개`);
      return { title, content, images };
    }

    throw new Error(`본문 부족 (${content?.length || 0}자)`);
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
  let browser: any = null;


  try {
    const { chromium } = await import('playwright-extra');
    chromium.use(StealthPlugin());

    const execPath = await getChromiumExecutablePath();
    log(`[Playwright 크롤링 시작] ${url} (execPath: ${execPath || 'default'})`);

    browser = await chromium.launch({
      headless: false,  // ⭐ 쇼핑커넥트와 동일: 실제 브라우저 사용
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
      timeout: 30000,
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
    await page.waitForTimeout(3000);

    // iframe이 있는지 확인하고 로드 대기
    const hasIframe = await page.evaluate(() => {
      const iframe = document.querySelector('iframe#mainFrame, iframe.se-main-container');
      return !!iframe;
    });

    if (hasIframe) {
      log('[iframe 감지] iframe 콘텐츠 로드 대기 중...');
      await page.waitForTimeout(4000);

      // ✅ 스크롤하여 lazy-load 이미지 로드
      try {
        const scrollFrame = page.frame({ name: 'mainFrame' });
        if (scrollFrame) {
          await scrollFrame.evaluate(async () => {
            const scrollHeight = document.body.scrollHeight || 5000;
            for (let i = 0; i < scrollHeight; i += 500) {
              window.scrollTo(0, i);
              await new Promise(r => setTimeout(r, 100));
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
        const mobileResult = await fetchNaverBlogMobileApi(blogId, logNo, log);
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
