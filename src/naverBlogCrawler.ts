import puppeteer, { Browser, Page } from 'puppeteer';

/**
 * Puppeteer를 사용한 네이버 블로그 크롤링
 * iframe 구조를 포함한 전체 본문 추출 가능
 */
export async function crawlNaverBlogWithPuppeteer(
  url: string,
  logger?: (message: string) => void,
): Promise<{ title?: string; content?: string; images?: string[] }> {
  const log = logger || console.log;
  let browser: Browser | null = null;

  try {
    log(`[Puppeteer 크롤링 시작] ${url}`);

    // ✅ 저사양 최적화 Puppeteer 브라우저 실행
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720', // ✅ 해상도 낮춰서 메모리 절약
        // ✅ 추가 저사양 최적화
        '--disable-software-rasterizer',
        '--disable-accelerated-jpeg-decoding',
        '--disable-accelerated-video-decode',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--mute-audio',
        '--disable-logging',
        '--metrics-recording-only',
        '--js-flags=--max-old-space-size=256',
      ],
    });

    const page = await browser.newPage();
    
    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // 네이버 블로그 URL로 이동
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
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

    // ✅ 페이지 로딩 대기 (iframe 및 이미지 완전 로드 대기 - 시간 증가)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // iframe이 있는지 확인하고 로드 대기
    try {
      const hasIframe = await page.evaluate(() => {
        const iframe = document.querySelector('iframe#mainFrame, iframe.se-main-container');
        return !!iframe;
      });
      
      if (hasIframe) {
        log('[iframe 감지] iframe 콘텐츠 로드 대기 중...');
        // ✅ iframe 내부 이미지 완전 로드를 위해 대기 시간 증가
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // ✅ 추가: 스크롤하여 lazy-load 이미지 로드
        try {
          await page.evaluate(async () => {
            const iframe = document.querySelector('iframe#mainFrame') as HTMLIFrameElement;
            if (iframe?.contentDocument) {
              const doc = iframe.contentDocument;
              const scrollHeight = doc.body.scrollHeight || 5000;
              for (let i = 0; i < scrollHeight; i += 500) {
                doc.documentElement.scrollTop = i;
                await new Promise(r => setTimeout(r, 100));
              }
              doc.documentElement.scrollTop = 0;
            }
          });
          log('[iframe 스크롤] lazy-load 이미지 로드 완료');
        } catch (scrollErr) {
          // 스크롤 실패는 무시
        }
      }
    } catch (err) {
      // iframe 확인 실패는 무시하고 계속 진행
    }

    // 오류 페이지 감지 (iframe 내부 콘텐츠 포함)
    const errorCheck = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      const htmlContent = document.documentElement.innerHTML;
      
      // 네이버 블로그 오류 페이지 패턴들
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

      // ✅ 네이버 블로그는 iframe 구조라 초기 페이지가 짧을 수 있으므로
      // 본문 길이 체크를 제거하거나 매우 짧은 경우만 (10자 미만) 체크
      // iframe 또는 이미지가 있으면 정상 페이지로 간주
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

    // 제목 추출 (브랜드 커넥트 지원)
    const title = await page.evaluate(() => {
      // 🛒 네이버 브랜드 커넥트 제목
      if (window.location.href.includes('brandconnect.naver.com')) {
        const productTitle = document.querySelector('.product_title, .product-title, .productTitle, h1, h2')?.textContent?.trim();
        if (productTitle) return productTitle;
      }
      
      // 📝 블로그 제목 (기존 로직)
      // 메타 태그에서 제목 추출
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (ogTitle) return ogTitle.trim();

      // iframe 내부 제목 찾기
      const iframe = document.querySelector('iframe#mainFrame') as HTMLIFrameElement;
      if (iframe?.contentDocument) {
        const iframeTitle = iframe.contentDocument.querySelector('.se-title-text, h1')?.textContent;
        if (iframeTitle) return iframeTitle.trim();
      }

      // 일반 제목 선택자
      const h1Title = document.querySelector('h1')?.textContent;
      if (h1Title) return h1Title.trim();

      return document.title.split('|')[0].trim() || document.title.split('-')[0].trim();
    });

    log(`[제목 추출] ${title || '없음'}`);

    // 본문 추출 (iframe 포함 + 브랜드 커넥트 지원)
    const contentData = await page.evaluate(() => {
      // 🛒 네이버 브랜드 커넥트 (쇼핑몰 제품 페이지) 크롤링
      const isBrandConnect = window.location.href.includes('brandconnect.naver.com');
      
      if (isBrandConnect) {
        // 브랜드 커넥트 제품 정보 추출
        const productInfo: string[] = [];
        
        // 제품명
        const productName = document.querySelector('.product_title, .product-title, h1, h2')?.textContent?.trim();
        if (productName) productInfo.push(`제품명: ${productName}`);
        
        // 제품 설명
        const productDesc = document.querySelector('.product_description, .product-description, .description, .detail-description')?.textContent?.trim();
        if (productDesc) productInfo.push(`제품 설명: ${productDesc}`);
        
        // 제품 상세 정보
        const productDetails = document.querySelector('.product_detail, .product-detail, .detail-info, .product-info')?.textContent?.trim();
        if (productDetails) productInfo.push(`상세 정보: ${productDetails}`);
        
        // 제품 특징
        const features = Array.from(document.querySelectorAll('.feature, .benefit, .point, li'))
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 10 && text.length < 300)
          .slice(0, 10); // 최대 10개
        if (features.length > 0) productInfo.push(`주요 특징:\n${features.join('\n')}`);
        
        // 전체 텍스트 추출 (fallback)
        if (productInfo.length === 0) {
          const bodyText = document.body.textContent || '';
          const cleaned = bodyText
            .replace(/\s+/g, ' ')
            .replace(/로그인|회원가입|장바구니|주문하기|구매하기|찜하기|공유하기|더보기/g, '')
            .trim();
          
          if (cleaned.length > 200) {
            return cleaned;
          }
        }
        
        const result = productInfo.join('\n\n');
        if (result.length > 100) {
          return result;
        }
      }
      
      // 📝 네이버 블로그 크롤링 (기존 로직)
      // iframe 내부 본문 찾기 (우선)
      const iframe = document.querySelector('iframe#mainFrame') as HTMLIFrameElement;
      
      if (iframe?.contentDocument) {
        const iframeDoc = iframe.contentDocument;
        
        // 네이버 블로그 Smart Editor 본문 선택자
        const contentSelectors = [
          '#postViewArea',
          '.se-main-container',
          '.se-component-content',
          '.se-section-text',
          '#postView',
          '.post-view',
        ];

        for (const selector of contentSelectors) {
          const element = iframeDoc.querySelector(selector);
          if (element) {
            // 불필요한 요소 제거
            const clone = element.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, .ad, .advertisement').forEach(el => el.remove());
            
            let text = clone.textContent || '';
            text = text.trim().replace(/\s+/g, ' ');

            if (text.length > 200) {
              return text;
            }
          }
        }

        // iframe body 전체에서 찾기
        let bodyText = iframeDoc.body.textContent || '';
        bodyText = bodyText.trim().replace(/\s+/g, ' ');
        if (bodyText.length > 200) {
          return bodyText;
        }
      }

      // iframe이 없거나 실패한 경우 메인 페이지에서 찾기
      const mainSelectors = [
        '#postViewArea',
        '.se-main-container',
        '.se-component-content',
        'article',
        '.post-content',
      ];

      for (const selector of mainSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style, noscript, iframe, nav, header, footer, .ad, .advertisement').forEach(el => el.remove());
          
          let text = clone.textContent || '';
          text = text.trim().replace(/\s+/g, ' ');

          if (text.length > 200) {
            return text;
          }
        }
      }

      return null;
    });

    // 브랜드 커넥트는 최소 길이 요구사항 완화 (100자), 블로그는 200자
    const isBrandConnect = url.includes('brandconnect.naver.com');
    const minContentLength = isBrandConnect ? 100 : 200;
    
    if (!contentData || contentData.length < minContentLength) {
      log(`⚠️ 본문 추출 실패 또는 내용이 너무 짧습니다 (${contentData?.length || 0}자, 최소 ${minContentLength}자 필요)`);
      throw new Error('❌ 본문 내용이 부족합니다. 이 페이지는 정상적인 블로그 글이 아닌 것으로 보입니다.\n가능한 원인:\n- 삭제된 글\n- 비공개 글\n- 오류 페이지\n- 본문이 매우 짧은 글');
    } else {
      log(`✅ 본문 추출 성공 (${contentData.length}자)${isBrandConnect ? ' [브랜드 커넥트]' : ''}`);
    }

    // 추출된 본문에서 오류 메시지 재확인
    const contentErrorCheck = [
      '삭제되었거나 없는 게시글',
      '존재하지 않는 게시글',
      '비공개 게시글',
      '접근 권한이 없습니다',
    ];

    for (const errorMsg of contentErrorCheck) {
      if (contentData.includes(errorMsg)) {
        throw new Error(`❌ 본문에서 오류 메시지 발견: "${errorMsg}"\n이 글은 크롤링할 수 없습니다.`);
      }
    }

    // 이미지 URL 추출 (콘텐츠 이미지만 + 브랜드 커넥트 지원)
    const images = await page.evaluate(() => {
      const imageUrls: string[] = [];
      
      // 🛒 네이버 브랜드 커넥트 이미지 추출
      if (window.location.href.includes('brandconnect.naver.com')) {
        // 제품 이미지 선택자
        const productImageSelectors = [
          '.product_image img',
          '.product-image img',
          '.productImage img',
          '.detail_image img',
          '.detail-image img',
          '.productDetail img',
          'img[src*="shop-phinf.pstatic.net"]',
          'img[src*="shopping-phinf.pstatic.net"]',
        ];
        
        for (const selector of productImageSelectors) {
          const imgs = document.querySelectorAll(selector);
          imgs.forEach((img: Element) => {
            const src = (img as HTMLImageElement).src || (img as HTMLImageElement).getAttribute('data-src');
            if (src && src.startsWith('http') && !imageUrls.includes(src)) {
              imageUrls.push(src);
            }
          });
        }
        
        // fallback: 모든 큰 이미지 추출
        if (imageUrls.length === 0) {
          const allImages = document.querySelectorAll('img');
          allImages.forEach((img: Element) => {
            const htmlImg = img as HTMLImageElement;
            const src = htmlImg.src || htmlImg.getAttribute('data-src');
            if (src && 
                src.startsWith('http') && 
                (src.includes('phinf.pstatic.net') || src.includes('shopping')) &&
                !src.includes('logo') &&
                !src.includes('icon') &&
                !imageUrls.includes(src)) {
              imageUrls.push(src);
            }
          });
        }
        
        return imageUrls;
      }
      
      // 📝 블로그 이미지 추출 (강화된 로직)
      const iframe = document.querySelector('iframe#mainFrame') as HTMLIFrameElement;
      
      // UI 요소 제외 패턴
      const isUIElement = (url: string): boolean => {
        return url.includes('/nblog/') || // 네이버 블로그 UI
               url.includes('/static/') || // 정적 UI
               url.includes('/imgs/') || // 아이콘
               url.includes('btn_') || // 버튼
               url.includes('ico_') || // 아이콘
               url.includes('spc.gif') || // 공백
               url.includes('banner') || // 배너
               url.includes('widget') || // 위젯
               url.includes('personacon') || // 페르소나
               url.includes('blogpfthumb') || // 프로필 썸네일
               url.includes('_icon') || // 아이콘
               url.includes('profile') || // 프로필
               (url.endsWith('.gif') && !url.includes('postfiles')); // GIF는 postfiles만
      };
      
      // ✅ 이미지 URL 추출 헬퍼 함수
      const extractImageUrl = (img: Element): string | null => {
        const attrs = ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-image-src', 'data-url'];
        for (const attr of attrs) {
          const value = img.getAttribute(attr);
          if (value && value.startsWith('http')) {
            return value;
          }
        }
        // ✅ 스마트에디터 ONE 이미지 (배경 스타일에서 추출)
        const style = img.getAttribute('style') || '';
        const bgMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
        if (bgMatch) return bgMatch[1];
        return null;
      };
      
      if (iframe?.contentDocument) {
        const iframeDoc = iframe.contentDocument;
        
        // ✅ 본문 영역에서만 이미지 추출 (셀렉터 확장)
        const contentSelectors = [
          '#postViewArea',
          '.se-main-container',
          '.se-component-content',
          '.se-section-text',
          '.se-image-resource', // ✅ 스마트에디터 이미지
          '.se-module-image', // ✅ 스마트에디터 이미지 모듈
          '#postView',
          '.post-view',
          'article',
          '.post-content',
          '.blog-post', // ✅ 추가
        ];
        
        let contentContainer: Element | null = null;
        for (const selector of contentSelectors) {
          const element = iframeDoc.querySelector(selector);
          if (element) {
            contentContainer = element;
            break;
          }
        }
        
        // 본문 영역이 있으면 그 안에서만 이미지 추출
        const searchContainer = contentContainer || iframeDoc.body;
        
        // ✅ img 태그 뿐만 아니라 se-image-resource, a[data-linktype="img"] 등도 검색
        const imgElements = searchContainer.querySelectorAll('img, .se-image-resource, [data-linktype="img"]');
        
        imgElements.forEach(img => {
          const src = extractImageUrl(img);
          if (src) {
            // 네이버 이미지 서버의 실제 콘텐츠 이미지만
            if (src.includes('postfiles.pstatic.net') || 
                src.includes('blogfiles.pstatic.net') || // ✅ 추가
                src.includes('phinf.pstatic.net') || // ✅ 추가
                (src.includes('naver.net') && !isUIElement(src))) {
              if (!imageUrls.includes(src)) {
                imageUrls.push(src);
              }
            }
          }
        });
      }

      // 메인 페이지에서도 콘텐츠 이미지 수집
      const mainContentSelectors = ['#postViewArea', '.se-main-container', '.se-image-resource', 'article', '.post-content'];
      let mainContentContainer: Element | null = null;
      for (const selector of mainContentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          mainContentContainer = element;
          break;
        }
      }
      
      const searchContainer = mainContentContainer || document.body;
      const mainImgs = searchContainer.querySelectorAll('img, .se-image-resource, [data-linktype="img"]');
      mainImgs.forEach(img => {
        const src = extractImageUrl(img);
        if (src) {
          if (src.includes('postfiles.pstatic.net') || 
              src.includes('blogfiles.pstatic.net') ||
              src.includes('phinf.pstatic.net') ||
              (src.includes('naver.net') && !isUIElement(src))) {
            if (!imageUrls.includes(src)) {
              imageUrls.push(src);
            }
          }
        }
      });

      return Array.from(new Set(imageUrls));
    });

    if (images.length > 0) {
      log(`✅ 이미지 ${images.length}개 추출 성공`);
    }

    return {
      title: title || undefined,
      content: contentData || undefined,
      images: images.length > 0 ? images : undefined,
    };
  } catch (error) {
    log(`❌ Puppeteer 크롤링 실패: ${(error as Error).message}`);
    throw new Error(`네이버 블로그 크롤링 실패: ${(error as Error).message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
      log(`[Puppeteer 브라우저 종료]`);
    }
  }
}

