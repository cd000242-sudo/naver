import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';

// ========================================
// 타입 정의
// ========================================

export interface LibraryImage {
  id: string;
  url: string;
  localPath?: string;
  source: ImageSource;
  query: string;
  tags: string[];
  width: number;
  height: number;
  photographer?: string;
  photographerUrl?: string;
  license: string;
  downloadedAt?: Date;
}

export type ImageSource =
  | 'news-crawl'     // 뉴스 크롤링 (실제 이미지)
  | 'blog-crawl';    // 블로그 크롤링 (실제 이미지)

export interface ImageLibraryConfig {
  storageDir: string;
  maxImagesPerQuery?: number;
  autoDownload?: boolean;
}

export interface SearchOptions {
  sources?: ImageSource[];
  count?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  minWidth?: number;
  minHeight?: number;
}

// ========================================
// 이미지 라이브러리 클래스
// ========================================

export class ImageLibrary {
  private config: ImageLibraryConfig;
  private libraryPath: string;
  private indexPath: string;
  private index: Map<string, LibraryImage[]> = new Map();
  private logger: (message: string) => void;

  constructor(config: ImageLibraryConfig, logger: (message: string) => void = console.log) {
    this.config = config;
    this.libraryPath = path.join(config.storageDir, 'images');
    this.indexPath = path.join(config.storageDir, 'index.json');
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.libraryPath, { recursive: true });
    await this.loadIndex();
    this.logger('📚 이미지 라이브러리 초기화 완료');
  }

  /**
   * 키워드로 이미지 검색 및 수집 (크롤링 기능만)
   */
  async collectImages(
    query: string,
    options: SearchOptions = {}
  ): Promise<LibraryImage[]> {
    // 빈 검색어 체크
    if (!query || query.trim().length === 0) {
      this.logger(`⚠️ 빈 검색어로 이미지 수집을 건너뜁니다.`);
      return [];
    }

    const {
      sources = ['news-crawl', 'blog-crawl'], // 기본적으로 크롤링 기능 사용
      count = this.config.maxImagesPerQuery || 10,
      orientation,
      minWidth = 300,
      minHeight = 200,
    } = options;

    this.logger(`🔍 "${query}" 이미지 수집 중...`);
    const allImages: LibraryImage[] = [];
    const perSource = Math.ceil(count / sources.length);

    // 각 소스에서 병렬로 검색
    const searchPromises = sources.map(async (source) => {
      try {
        let images: LibraryImage[] = [];

        switch (source) {
          case 'news-crawl':
            // 뉴스 크롤링 (저작권 경고 - 실제 이미지)
            this.logger(`⚠️ 뉴스 크롤링 시작: 저작권 침해 위험이 있습니다.`);
            images = await this.crawlNewsImages(query, perSource);
            break;
          case 'blog-crawl':
            // 블로그 크롤링 (저작권 경고 - 실제 이미지)
            this.logger(`⚠️ 블로그 크롤링 시작: 저작권 침해 위험이 있습니다.`);
            images = await this.crawlBlogImages(query, perSource);
            break;
          default:
            this.logger(`⚠️ 지원하지 않는 이미지 소스: ${source}`);
            break;
        }

        // 최소 크기 필터링
        return images.filter(img =>
          img.width >= minWidth && img.height >= minHeight
        );
      } catch (error) {
        this.logger(`⚠️ ${source} 검색 실패: ${(error as Error).message}`);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    results.forEach(images => allImages.push(...images));

    // 인덱스에 저장
    const existing = this.index.get(query) || [];
    const merged = this.mergeImages(existing, allImages);
    this.index.set(query, merged);
    await this.saveIndex();

    this.logger(`✅ "${query}" 이미지 ${allImages.length}개 수집 완료`);
    return allImages.slice(0, count);
  }

  /**
   * 라이브러리에서 이미지 조회 (호환성을 위해 오버로드)
   */
  async getImages(categoryOrKeywords?: string | string[], countOrKeywords?: number | string[]): Promise<LibraryImage[]> {
    // 첫 번째 파라미터가 string이고 두 번째가 number인 경우 (기존 방식)
    if (typeof categoryOrKeywords === 'string' && typeof countOrKeywords === 'number') {
      const keyword = categoryOrKeywords;
      const count = countOrKeywords;

      // 키워드 기반 필터링
      const allImages = Array.from(this.index.values()).flat();
      const filtered = allImages.filter(img =>
        img.query.toLowerCase().includes(keyword.toLowerCase()) ||
        img.tags.some(tag => tag.toLowerCase().includes(keyword.toLowerCase()))
      );

      return filtered.slice(0, count);
    }

    // 새로운 방식: 카테고리와 키워드 배열
    const category = typeof categoryOrKeywords === 'string' ? categoryOrKeywords : undefined;
    const keywords = Array.isArray(countOrKeywords) ? countOrKeywords :
                    (Array.isArray(categoryOrKeywords) ? categoryOrKeywords : undefined);

    if (category) {
      // 카테고리별 필터링 (현재는 전체 반환)
      return Array.from(this.index.values()).flat();
    }

    if (keywords && keywords.length > 0) {
      // 키워드 기반 필터링
      const allImages = Array.from(this.index.values()).flat();
      return allImages.filter(img =>
        keywords.some(kw =>
          img.query.toLowerCase().includes(kw.toLowerCase()) ||
          img.tags.some(tag => tag.toLowerCase().includes(kw.toLowerCase()))
        )
      );
    }

    // 전체 이미지 반환
    return Array.from(this.index.values()).flat();
  }

  /**
   * 이미지 추가
   */
  async addImage(image: LibraryImage): Promise<void> {
    const existing = this.index.get(image.query) || [];
    existing.push(image);
    this.index.set(image.query, existing);
    await this.saveIndex();
  }

  /**
   * 이미지 저장
   */
  async saveImage(image: LibraryImage): Promise<void> {
    await this.addImage(image);
  }

  /**
   * 카테고리 목록 가져오기
   */
  async getCategories(): Promise<string[]> {
    return Array.from(this.index.keys());
  }

  /**
   * 라이브러리 통계
   */
  async getStats() {
    const allImages = Array.from(this.index.values()).flat();
    const totalBytes = await this.getTotalSize();

    // sources를 Record<string, number> 형식으로 변경
    const sourceCount: Record<string, number> = {};
    allImages.forEach(img => {
      sourceCount[img.source] = (sourceCount[img.source] || 0) + 1;
    });

    return {
      totalImages: allImages.length,
      categories: this.index.size,
      totalSize: totalBytes > 1024 * 1024
        ? `${(totalBytes / 1024 / 1024).toFixed(1)} MB`
        : `${(totalBytes / 1024).toFixed(1)} KB`,
      sources: sourceCount,
    };
  }

  /**
   * 출처 표기 텍스트 생성
   */
  getAttribution(image: LibraryImage): string {
    switch (image.source) {
      case 'news-crawl':
        return `출처: 뉴스 크롤링 (저작권 주의)`;
      case 'blog-crawl':
        return `출처: 블로그 크롤링 (저작권 주의)`;
      default:
        return `출처: ${image.source}`;
    }
  }

  /**
   * 일괄 수집 (호환성을 위해 추가)
   */
  async batchCollect(categories: string[]): Promise<void> {
    for (const category of categories) {
      await this.collectImages(category, { count: 20 });
      // API 속도 제한 방지
      await new Promise(r => setTimeout(r, 1000));
    }

    this.logger('✅ 일괄 수집 완료');
  }

  /**
   * Fetch 함수 가져오기 (호환성을 위해 추가)
   */
  private async getFetch(): Promise<typeof fetch> {
    return fetch;
  }

  // ========================================
  // 웹 크롤링 기능 (저작권 경고: 이 기능은 저작권 침해의 위험이 있습니다)
  // ========================================

  /**
   * 뉴스 사이트에서 이미지 크롤링
   * ⚠️ 저작권 경고: 뉴스 이미지 사용 시 저작권 침해의 위험이 있습니다.
   */
  private async crawlNewsImages(query: string, maxImages: number = 20): Promise<LibraryImage[]> {
    const images: LibraryImage[] = [];
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          // ✅ 저사양 컴퓨터 최적화
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--no-first-run',
          '--mute-audio',
          '--js-flags=--max-old-space-size=256',
        ]
      });

      const page = await browser.newPage();

      // User-Agent 설정
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 네이버 뉴스 검색
      const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(query)}&sm=tab_pge&sort=0`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });

      // 뉴스 기사 링크들 추출
      const newsLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="news.naver.com"], a[href*="sports.news.naver.com"], a[href*="entertain.naver.com"]')) as HTMLAnchorElement[];
        return links.slice(0, 5).map(link => link.href);
      });

      // 각 뉴스 기사에서 이미지 추출
      for (const newsUrl of newsLinks) {
        if (images.length >= maxImages) break;

        try {
          const newsPage = await browser.newPage();
          await newsPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
          await newsPage.goto(newsUrl, { waitUntil: 'networkidle2' });

          const articleImages = await newsPage.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img[src*="imgnews.pstatic.net"], img[src*="photo.newsen.com"], img[src*="image.news1.kr"], img[src*="img.hankyung.com"], img[src*="img.mk.co.kr"]')) as HTMLImageElement[];

            return imgs
              .filter(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                const rect = img.getBoundingClientRect();
                // 너무 작은 이미지나 아이콘 제외
                return src && rect.width > 200 && rect.height > 150;
              })
              .map(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                const alt = img.alt || 'News Image';
                return { src, alt };
              })
              .filter(img => img.src && img.src.startsWith('http'));
          });

          // 이미지들을 라이브러리 형식으로 변환
          for (const img of articleImages) {
            if (images.length >= maxImages) break;

            const imageId = `news-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const image: LibraryImage = {
              id: imageId,
              url: img.src,
              source: 'news-crawl',
              query: query,
              tags: ['news', 'crawled'],
              width: 0, // 크롤링 시점에서는 알 수 없음
              height: 0,
              license: 'Copyright Warning: 뉴스 이미지 사용은 저작권 침해의 위험이 있습니다.',
              downloadedAt: new Date(),
            };

            images.push(image);
          }

          await newsPage.close();
        } catch (error) {
          console.warn(`뉴스크롤링 실패 ${newsUrl}:`, error);
        }
      }

    } catch (error) {
      console.error('뉴스 크롤링 오류:', error);
    } finally {
      if (browser) {
        await browser.close();
      }
      // ✅ 메모리 최적화: 가비지 컬렉션 힌트
      if (typeof global !== 'undefined' && (global as any).gc) {
        (global as any).gc();
      }
    }

    return images;
  }

  /**
   * 블로그에서 이미지 크롤링
   * ⚠️ 저작권 경고: 블로그 이미지 사용 시 저작권 침해의 위험이 있습니다.
   */
  private async crawlBlogImages(query: string, maxImages: number = 20): Promise<LibraryImage[]> {
    const images: LibraryImage[] = [];
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          // ✅ 저사양 컴퓨터 최적화
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-networking',
          '--no-first-run',
          '--mute-audio',
          '--js-flags=--max-old-space-size=256',
        ]
      });

      const page = await browser.newPage();

      // User-Agent 설정
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 네이버 블로그 검색
      const searchUrl = `https://search.naver.com/search.naver?where=post&query=${encodeURIComponent(query)}&sm=tab_pge`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2' });

      // 블로그 포스트 링크들 추출
      const blogLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]')) as HTMLAnchorElement[];
        return links.slice(0, 8).map(link => link.href).filter(href => href.includes('/PostView.nhn'));
      });

      // 각 블로그 포스트에서 이미지 추출
      for (const blogUrl of blogLinks) {
        if (images.length >= maxImages) break;

        try {
          const blogPage = await browser.newPage();
          await blogPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
          await blogPage.goto(blogUrl, { waitUntil: 'networkidle2' });

          // 블로그 컨텐츠 로딩 대기
          await new Promise(resolve => setTimeout(resolve, 2000));

          const postImages = await blogPage.evaluate(() => {
            // 블로그 본문 이미지들 찾기
            const imgs = Array.from(document.querySelectorAll('img[src*="blogfiles.naver.net"], img[src*="postfiles.pstatic.net"], img[src*="blogimgs.pstatic.net"]')) as HTMLImageElement[];

            return imgs
              .filter(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                const rect = img.getBoundingClientRect();
                // 너무 작은 이미지나 아이콘 제외
                return src && rect.width > 150 && rect.height > 100;
              })
              .map(img => {
                const src = img.src || img.getAttribute('data-src') || '';
                const alt = img.alt || img.title || 'Blog Image';
                return { src, alt };
              })
              .filter(img => img.src && img.src.startsWith('http'));
          });

          // 이미지들을 라이브러리 형식으로 변환
          for (const img of postImages) {
            if (images.length >= maxImages) break;

            const imageId = `blog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const image: LibraryImage = {
              id: imageId,
              url: img.src,
              source: 'blog-crawl',
              query: query,
              tags: ['blog', 'crawled'],
              width: 0, // 크롤링 시점에서는 알 수 없음
              height: 0,
              license: 'Copyright Warning: 블로그 이미지 사용은 저작권 침해의 위험이 있습니다.',
              downloadedAt: new Date(),
            };

            images.push(image);
          }

          await blogPage.close();
        } catch (error) {
          console.warn(`블로그크롤링 실패 ${blogUrl}:`, error);
        }
      }

    } catch (error) {
      console.error('블로그 크롤링 오류:', error);
    } finally {
      if (browser) {
        await browser.close();
      }
      // ✅ 메모리 최적화: 가비지 컬렉션 힌트
      if (typeof global !== 'undefined' && (global as any).gc) {
        (global as any).gc();
      }
    }

    return images;
  }

  // ========================================
  // 유틸리티 메서드
  // ========================================

  private mergeImages(existing: LibraryImage[], newImages: LibraryImage[]): LibraryImage[] {
    const merged = [...existing];
    for (const newImg of newImages) {
      const exists = merged.some(img => img.url === newImg.url);
      if (!exists) {
        merged.push(newImg);
      }
    }
    return merged;
  }

  private async getTotalSize(): Promise<number> {
    let totalBytes = 0;
    try {
      const files = await fs.readdir(this.libraryPath);
      for (const file of files) {
        const filePath = path.join(this.libraryPath, file);
        const stat = await fs.stat(filePath);
        totalBytes += stat.size;
      }
    } catch {}
    return totalBytes;
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.index = new Map(Object.entries(parsed));
    } catch {
      this.index = new Map();
    }
  }

  private async saveIndex(): Promise<void> {
    const obj = Object.fromEntries(this.index);
    await fs.writeFile(this.indexPath, JSON.stringify(obj, null, 2));
  }
}