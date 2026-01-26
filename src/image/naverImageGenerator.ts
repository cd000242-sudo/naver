/**
 * 네이버 이미지 생성기 (Refactored)
 * - 설정 및 상수 분리
 * - KeywordAnalyzer 클래스로 로직 분리
 * - NaverImageScraper 클래스로 스크래핑 분리
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import path from 'path';

// ==========================================
// 1. 설정 및 상수 분리 (Maintainability)
// ==========================================

const CONFIG = {
  TIMEOUT: 30000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  VIEWPORT: { width: 1280, height: 720 },
};

// 정규식 및 금칙어 상수화 (메모리 절약)
const PATTERNS = {
  PERSON_NAME: /^[가-힣]{2,4}$/,
  EXCLUDED_WORDS: new Set([
    '은', '는', '이', '가', '을', '를', '의', '에', '에서', '로', '으로', '와', '과', '도', '만', '까지', '부터',
    '그', '이', '저', '그것', '이것', '저것', '매우', '너무', '정말', '진짜', '완전', '엄청', '아주',
    '가을맞이', '초특가', '대방출', '꿀팁', '방출', '찬스', '팁', '자동', '마무리', '결론', '정리', '요약',
    '소개', '알아보기', '제품', '상품', '구매', '리뷰', '후기', '사용기', '비교', '추천', '장단점', '솔직'
  ]),
};

// 중복 방지 저장소 (URL 기준)
const globalUsedUrls = new Set<string>();

// ==========================================
// 2. 도우미 클래스: 키워드 분석기 (Logic)
// ==========================================

class KeywordAnalyzer {
  static extractSearchQuery(heading: string, titlePerson?: string | null, titleProduct?: string | null): string {
    const cleanHeading = heading.replace(/[^\w\s가-힣0-9]/g, ' ').trim();

    // 1순위: 제목에서 추출된 제품명 활용 (제품 리뷰 글)
    if (titleProduct) {
      // 소제목에서 유의미한 명사 추출하여 조합
      const nouns = this.extractNouns(cleanHeading);
      if (nouns.length > 0) return `${titleProduct} ${nouns[0]}`;
      return titleProduct;
    }

    // 2순위: 인물 이름 (제목 or 소제목)
    if (titlePerson) {
      // 소제목에 다른 인물이 있는지 확인
      const headingPerson = this.findPersonName(cleanHeading);
      if (headingPerson && headingPerson !== titlePerson.split(' ')[0]) {
        return headingPerson; // 소제목 인물 우선
      }
      return titlePerson; // 제목 인물 낙수
    }

    // 3순위: 소제목의 핵심 키워드
    const nouns = this.extractNouns(cleanHeading);
    if (nouns.length > 0) {
      return nouns.slice(0, 2).join(' ');
    }

    return heading; // 최후의 수단
  }

  private static extractNouns(text: string): string[] {
    return text.split(/\s+/)
      .filter(w => w.length >= 2)
      .filter(w => !PATTERNS.EXCLUDED_WORDS.has(w))
      .filter(w => !/^[가-힣]+(한|한가|하다|적|적인|스러운)$/.test(w)); // 형용사 제외
  }

  private static findPersonName(text: string): string | null {
    const words = text.split(/\s+/);
    for (const word of words) {
      if (PATTERNS.PERSON_NAME.test(word) && !PATTERNS.EXCLUDED_WORDS.has(word)) {
        return word;
      }
    }
    return null;
  }
}

// ==========================================
// 3. 핵심 클래스: 네이버 이미지 수집기 (Core)
// ==========================================

export class NaverImageScraper {
  private browser: any = null;
  private puppeteer: any = null;

  constructor() { }

  async init() {
    if (!this.puppeteer) {
      this.puppeteer = await import('puppeteer');
    }
    if (!this.browser) {
      this.browser = await this.puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-gpu', '--disable-extensions', '--mute-audio'
        ]
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 이미지 검색 및 최적의 이미지 선택
   */
  async searchImage(query: string, attempt: number = 1): Promise<string | null> {
    if (!this.browser) await this.init();
    const page = await this.browser.newPage();

    try {
      await page.setViewport(CONFIG.VIEWPORT);
      await page.setUserAgent(CONFIG.USER_AGENT);

      // 검색어 보정 (인물이면 '사진' 추가)
      const finalQuery = PATTERNS.PERSON_NAME.test(query) ? `${query} 사진` : query;
      // 페이지네이션 활용 (중복 방지)
      const startParam = (attempt - 1) * 20 + 1;
      const searchUrl = `https://search.naver.com/search.naver?where=image&sm=tab_jum&query=${encodeURIComponent(finalQuery)}&start=${startParam}`;

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 스마트 스크롤
      await this.smartScroll(page);

      // 이미지 추출 (브라우저 내에서 실행)
      const images = await page.evaluate(() => {
        const results: any[] = [];
        // ✅ 안전한 선택자 사용 (구조 변경 대비)
        const elements = document.querySelectorAll('img._image, img._listImage, img.thumb');

        elements.forEach((el: any) => {
          const src = el.src || el.dataset.src;
          if (!src || src.includes('data:image') || src.includes('icon') || src.includes('logo')) return;

          // 품질 점수 계산
          let score = 50;
          const width = el.naturalWidth || 0;
          const height = el.naturalHeight || 0;

          if (width > 500 && height > 400) score += 30; // 고해상도
          if (src.includes('post') || src.includes('blog')) score += 10; // 블로그 이미지 선호

          results.push({ url: src, score });
        });
        return results;
      });

      // 필터링 및 선택
      const validImages = images
        .filter((img: any) => !globalUsedUrls.has(img.url))
        .sort((a: any, b: any) => b.score - a.score);

      if (validImages.length > 0) {
        // 상위 3개 중 랜덤 선택 (자연스러움)
        const selected = validImages[Math.floor(Math.random() * Math.min(3, validImages.length))];
        globalUsedUrls.add(selected.url);
        return selected.url;
      }

      return null;

    } catch (e) {
      console.warn(`[NaverScraper] 검색 실패 (${query}):`, e);
      return null;
    } finally {
      await page.close();
    }
  }

  private async smartScroll(page: any) {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 1000;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight || totalHeight > 5000) { // 최대 스크롤 제한
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });
  }

  // 이미지 다운로드 헬퍼
  async downloadImage(url: string): Promise<{ buffer: Buffer, ext: string }> {
    const https = await import('https');
    const http = await import('http');
    const { URL } = await import('url');

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      client.get(url, { headers: { 'User-Agent': CONFIG.USER_AGENT } }, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`Status ${res.statusCode}`));
        const data: any[] = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(data);
          let ext = path.extname(parsedUrl.pathname) || '.jpg';
          if (!['.jpg', '.png', '.webp', '.gif'].includes(ext)) ext = '.jpg';
          resolve({ buffer, ext: ext.replace('.', '') });
        });
      }).on('error', reject);
    });
  }
}

// ==========================================
// 4. 메인 함수 (Clean Interface)
// ==========================================

export async function generateWithNaver(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isRegenerate?: boolean,
  sourceUrl?: string,
  articleUrl?: string,
  options?: any
): Promise<GeneratedImage[]> {
  const scraper = new NaverImageScraper();
  const results: GeneratedImage[] = [];

  try {
    await scraper.init();

    // 제목에서 인물/제품 정보 추출 (전역 컨텍스트)
    const titlePerson = KeywordAnalyzer.extractSearchQuery(postTitle || '', null, null).match(PATTERNS.PERSON_NAME)?.[0] || null;
    const titleProduct = postTitle && /리뷰|후기|사용기/.test(postTitle) ? postTitle.split(' ')[0] : null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let searchQuery = KeywordAnalyzer.extractSearchQuery(item.heading, titlePerson, titleProduct);

      console.log(`[Naver] [${i + 1}/${items.length}] 검색어: "${searchQuery}"`);

      let imageUrl = await scraper.searchImage(searchQuery, 1);

      // 실패 시 폴백 (Fallback): 일반 키워드로 재검색
      if (!imageUrl) {
        console.log(`[Naver] 1차 검색 실패, 일반 키워드로 재시도...`);
        const fallbackQuery = item.heading.split(' ')[0] || '배경화면';
        imageUrl = await scraper.searchImage(fallbackQuery, 2);
      }

      if (imageUrl) {
        try {
          const { buffer, ext } = await scraper.downloadImage(imageUrl);
          const { filePath, previewDataUrl, savedToLocal } = await writeImageFile(
            buffer, ext, item.heading, postTitle, postId
          );

          results.push({
            heading: item.heading,
            filePath,
            previewDataUrl,
            provider: 'naver',
            savedToLocal,
            sourceUrl: imageUrl
          });
          console.log(`[Naver] ✅ 저장 완료: ${item.heading}`);
        } catch (err) {
          console.error(`[Naver] ❌ 다운로드/저장 실패: ${(err as Error).message}`);
        }
      } else {
        console.warn(`[Naver] ⚠️ 이미지를 찾을 수 없음: ${item.heading}`);
      }
    }

  } catch (error) {
    console.error('[Naver] 치명적 오류:', error);
    throw error;
  } finally {
    await scraper.close(); // 브라우저 종료 보장
  }

  return results;
}

// Improved 버전은 같은 로직 사용 (코드 중복 제거)
export const generateWithNaverImproved = generateWithNaver;

/**
 * 전역 URL 캐시 초기화
 */
export function clearGlobalUsedUrls(): void {
  globalUsedUrls.clear();
  console.log('[NaverImageGenerator] 🔄 전역 URL 캐시 초기화됨');
}
