import { ImageLibrary, LibraryImage, ImageSource } from './imageLibrary.js';
import * as path from 'path';

// ========================================
// 확장 이미지 소스 타입
// ========================================

export type ExtendedImageSource = 
  | 'korea_gov'
  | 'news_agency';

export interface ExtendedImage {
  id: string;
  url: string;
  localPath?: string;
  source: ExtendedImageSource;
  query: string;
  tags: string[];
  width: number;
  height: number;
  photographer?: string;
  photographerUrl?: string;
  license: string;
  downloadedAt?: Date;
  title: string;
  attribution: string;
  heading?: string;
  filePath?: string;
}

export interface ExtendedImageLibraryConfig {
  storageDir: string;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
  autoDownload?: boolean;
  enabledSources?: ExtendedImageSource[];
}

// ========================================
// 확장 이미지 라이브러리 클래스
// ========================================

export class ExtendedImageLibrary {
  private baseLibrary: ImageLibrary;
  private config: ExtendedImageLibraryConfig;
  // ⚠️ 이미지 라이브러리 기능 비활성화 (나중에 수정 예정)
  private enabledSources: Set<ExtendedImageSource> = new Set([
    // 'korea_gov', 'news_agency'  // 🔒 잠금: 같은 이미지 반복 문제로 비활성화
  ]);

  constructor(config: ExtendedImageLibraryConfig) {
    this.config = {
      autoDownload: true,
      // ⚠️ 이미지 라이브러리 기능 비활성화 (나중에 수정 예정)
      enabledSources: [], // 🔒 잠금: korea_gov, news_agency 비활성화
      ...config,
    };

    this.baseLibrary = new ImageLibrary({
      storageDir: config.storageDir,
      autoDownload: config.autoDownload,
    });

    if (this.config.enabledSources) {
      this.enabledSources = new Set(this.config.enabledSources);
    }
  }

  async initialize(): Promise<void> {
    await this.baseLibrary.initialize();
  }


  setSourceEnabled(source: ExtendedImageSource, enabled: boolean): void {
    if (enabled) {
      this.enabledSources.add(source);
    } else {
      this.enabledSources.delete(source);
    }
  }


  /**
   * 한국 공공누리 검색 (크롤링 기반)
   * API 키 불필요 - 공개 데이터 크롤링
   */
  private async searchKoreaGov(
    query: string,
    count: number
  ): Promise<ExtendedImage[]> {
    const fetch = await this.baseLibrary['getFetch']();
    const images: ExtendedImage[] = [];
    
    try {
      console.log(`[KoreaGov] 공공누리 검색 중: ${query}`);
      
      // 1. 정책브리핑 보도자료 크롤링
      try {
        const briefingUrl = `https://www.korea.kr/news/policyNewsView.do?newsId=148&srchTxt=${encodeURIComponent(query)}`;
        const response = await fetch(briefingUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // 이미지 URL 추출 (정책브리핑 구조에 맞춤)
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let match;
          let imgCount = 0;
          
          while ((match = imgRegex.exec(html)) !== null && imgCount < count) {
            const imgUrl = match[1];
            
            // 절대 URL로 변환
            let fullUrl = imgUrl;
            if (imgUrl.startsWith('//')) {
              fullUrl = 'https:' + imgUrl;
            } else if (imgUrl.startsWith('/')) {
              fullUrl = 'https://www.korea.kr' + imgUrl;
            } else if (!imgUrl.startsWith('http')) {
              continue;
            }
            
            // ✅ 유효한 이미지 URL만 추가 (더 엄격한 필터링)
            const isValidImageType = fullUrl.includes('.jpg') || fullUrl.includes('.jpeg') || 
                                     fullUrl.includes('.png') || fullUrl.includes('.webp');
            const hasExcludedKeywords = fullUrl.includes('logo') || fullUrl.includes('icon') ||
                                        fullUrl.includes('banner') || fullUrl.includes('btn_') ||
                                        fullUrl.includes('bnr_') || fullUrl.includes('button') ||
                                        fullUrl.includes('thumb_') || fullUrl.includes('profile') ||
                                        fullUrl.toLowerCase().includes('150x') || // 작은 배너 크기
                                        fullUrl.toLowerCase().includes('120x') ||
                                        fullUrl.toLowerCase().includes('100x');
            
            if (isValidImageType && !hasExcludedKeywords && fullUrl.length > 80) {
              images.push({
                id: `korea_gov-${Date.now()}-${imgCount}`,
                url: fullUrl,
                source: 'korea_gov' as ExtendedImageSource,
                query,
                tags: [query, '공공누리', '정책브리핑'],
                width: 0,
                height: 0,
                photographer: '정책브리핑',
                photographerUrl: 'https://www.korea.kr',
                license: '공공누리 (출처표시)',
                title: `${query} - 정책브리핑`,
                attribution: `이미지 출처: 정책브리핑 (공공누리)`,
                filePath: undefined,
              });
              imgCount++;
            }
          }
          
          console.log(`[KoreaGov] 정책브리핑에서 ${imgCount}개 이미지 발견`);
        }
      } catch (error) {
        console.error(`[KoreaGov] 정책브리핑 크롤링 실패:`, error);
      }
      
      // 2. 문화체육관광부 보도자료 크롤링
      if (images.length < count) {
        try {
          const mcstUrl = `https://www.mcst.go.kr/kor/s_notice/press/pressView.jsp`;
          // 실제 구현 시 검색 API 또는 크롤링 로직 추가
          console.log(`[KoreaGov] 문체부 검색 시도...`);
        } catch (error) {
          console.error(`[KoreaGov] 문체부 크롤링 실패:`, error);
        }
      }
      
      console.log(`[KoreaGov] 총 ${images.length}개 이미지 수집 완료`);
      return images.slice(0, count);
    } catch (error) {
      console.error(`[KoreaGov] 검색 실패:`, error);
      return images;
    }
  }

  /**
   * 뉴스 에이전시 이미지 검색 (크롤링 기반)
   * API 키 불필요 - 공개 보도자료 크롤링
   */
  private async searchNewsAgency(
    query: string,
    count: number
  ): Promise<ExtendedImage[]> {
    const fetch = await this.baseLibrary['getFetch']();
    const images: ExtendedImage[] = [];
    
    try {
      console.log(`[NewsAgency] 뉴스 에이전시 검색 중: ${query}`);
      
      // 1. 연합뉴스 이미지 검색
      try {
        const yonhapUrl = `https://www.yna.co.kr/search/index?query=${encodeURIComponent(query)}`;
        const response = await fetch(yonhapUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (response.ok) {
          const html = await response.text();
          
          // 연합뉴스 이미지 추출
          const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
          let match;
          let imgCount = 0;
          
          while ((match = imgRegex.exec(html)) !== null && imgCount < Math.ceil(count / 2)) {
            const imgUrl = match[1];
            
            // 절대 URL로 변환
            let fullUrl = imgUrl;
            if (imgUrl.startsWith('//')) {
              fullUrl = 'https:' + imgUrl;
            } else if (imgUrl.startsWith('/')) {
              fullUrl = 'https://www.yna.co.kr' + imgUrl;
            } else if (!imgUrl.startsWith('http')) {
              continue;
            }
            
            // ✅ 유효한 이미지만 추가 (썸네일, 로고, 배너 제외)
            const isValidImageType = fullUrl.includes('.jpg') || fullUrl.includes('.jpeg') || 
                                     fullUrl.includes('.png') || fullUrl.includes('.webp');
            const hasExcludedKeywords = fullUrl.includes('logo') || fullUrl.includes('icon') ||
                                        fullUrl.includes('thumb') || fullUrl.includes('banner') ||
                                        fullUrl.includes('btn_') || fullUrl.includes('bnr_') ||
                                        fullUrl.includes('button') || fullUrl.includes('profile') ||
                                        fullUrl.toLowerCase().includes('150x') ||
                                        fullUrl.toLowerCase().includes('120x') ||
                                        fullUrl.toLowerCase().includes('100x');
            
            // 디버그 로깅
            if (fullUrl.includes('bnr_') || fullUrl.includes('150x')) {
              console.log(`[NewsAgency-DEBUG] 배너 감지! URL: ${fullUrl.substring(0, 80)}`);
              console.log(`[NewsAgency-DEBUG]   - hasExcludedKeywords: ${hasExcludedKeywords}`);
              console.log(`[NewsAgency-DEBUG]   - fullUrl.length: ${fullUrl.length}`);
              console.log(`[NewsAgency-DEBUG]   - 필터링됨: ${hasExcludedKeywords || fullUrl.length <= 80 ? 'YES' : 'NO'}`);
            }
            
            if (isValidImageType && !hasExcludedKeywords && fullUrl.length > 80) {
              images.push({
                id: `yonhap-${Date.now()}-${imgCount}`,
                url: fullUrl,
                source: 'news_agency' as ExtendedImageSource,
                query,
                tags: [query, '연합뉴스', '보도자료'],
                width: 0,
                height: 0,
                photographer: '연합뉴스',
                photographerUrl: 'https://www.yna.co.kr',
                license: '연합뉴스 (출처표시 필수)',
                title: `${query} - 연합뉴스`,
                attribution: `사진 출처: 연합뉴스`,
                filePath: undefined,
              });
              imgCount++;
            }
          }
          
          console.log(`[NewsAgency] 연합뉴스에서 ${imgCount}개 이미지 발견`);
        }
      } catch (error) {
        console.error(`[NewsAgency] 연합뉴스 크롤링 실패:`, error);
      }
      
      // 2. 뉴시스 이미지 검색
      if (images.length < count) {
        try {
          const newsisUrl = `https://newsis.com/search/?query=${encodeURIComponent(query)}`;
          const response = await fetch(newsisUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          
          if (response.ok) {
            const html = await response.text();
            
            // 뉴시스 이미지 추출
            const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
            let match;
            let imgCount = 0;
            
            while ((match = imgRegex.exec(html)) !== null && imgCount < Math.ceil(count / 2)) {
              const imgUrl = match[1];
              
              // 절대 URL로 변환
              let fullUrl = imgUrl;
              if (imgUrl.startsWith('//')) {
                fullUrl = 'https:' + imgUrl;
              } else if (imgUrl.startsWith('/')) {
                fullUrl = 'https://newsis.com' + imgUrl;
              } else if (!imgUrl.startsWith('http')) {
                continue;
              }
              
              // ✅ 유효한 이미지만 추가 (썸네일, 로고, 배너 제외)
              const isValidImageType = fullUrl.includes('.jpg') || fullUrl.includes('.jpeg') || 
                                       fullUrl.includes('.png') || fullUrl.includes('.webp');
              const hasExcludedKeywords = fullUrl.includes('logo') || fullUrl.includes('icon') ||
                                          fullUrl.includes('thumb') || fullUrl.includes('banner') ||
                                          fullUrl.includes('btn_') || fullUrl.includes('bnr_') ||
                                          fullUrl.includes('button') || fullUrl.includes('profile') ||
                                          fullUrl.toLowerCase().includes('150x') ||
                                          fullUrl.toLowerCase().includes('120x') ||
                                          fullUrl.toLowerCase().includes('100x');
              
              // 디버그 로깅
              if (fullUrl.includes('bnr_') || fullUrl.includes('150x')) {
                console.log(`[Newsis-DEBUG] 배너 감지! URL: ${fullUrl.substring(0, 80)}`);
                console.log(`[Newsis-DEBUG]   - hasExcludedKeywords: ${hasExcludedKeywords}`);
                console.log(`[Newsis-DEBUG]   - fullUrl.length: ${fullUrl.length}`);
                console.log(`[Newsis-DEBUG]   - 필터링됨: ${hasExcludedKeywords || fullUrl.length <= 80 ? 'YES' : 'NO'}`);
              }
              
              if (isValidImageType && !hasExcludedKeywords && fullUrl.length > 80) {
                images.push({
                  id: `newsis-${Date.now()}-${imgCount}`,
                  url: fullUrl,
                  source: 'news_agency' as ExtendedImageSource,
                  query,
                  tags: [query, '뉴시스', '보도자료'],
                  width: 0,
                  height: 0,
                  photographer: '뉴시스',
                  photographerUrl: 'https://newsis.com',
                  license: '뉴시스 (출처표시 필수)',
                  title: `${query} - 뉴시스`,
                  attribution: `사진 출처: 뉴시스`,
                  filePath: undefined,
                });
                imgCount++;
              }
            }
            
            console.log(`[NewsAgency] 뉴시스에서 ${imgCount}개 이미지 발견`);
          }
        } catch (error) {
          console.error(`[NewsAgency] 뉴시스 크롤링 실패:`, error);
        }
      }
      
      console.log(`[NewsAgency] 총 ${images.length}개 이미지 수집 완료`);
      return images.slice(0, count);
    } catch (error) {
      console.error(`[NewsAgency] 검색 실패:`, error);
      return images;
    }
  }

  /**
   * 모든 소스에서 이미지 수집
   */
  async collectImages(
    query: string,
    options: {
      sources?: ExtendedImageSource[];
      count?: number;
    } = {}
  ): Promise<ExtendedImage[]> {
    // 빈 검색어 체크
    if (!query || query.trim().length === 0) {
      console.log(`[ExtendedLibrary] ⚠️ 빈 검색어로 이미지 수집을 건너뜁니다.`);
      return [];
    }
    
    const {
      sources = Array.from(this.enabledSources),
      count = 10,
    } = options;

    const allImages: ExtendedImage[] = [];
    const perSource = Math.ceil(count / sources.length);

    const searchPromises = sources.map(async (source) => {
      try {
        const images: ExtendedImage[] = [];

        switch (source) {
          case 'korea_gov':
            // 🔒 잠금: 나중에 수정 예정
            console.warn(`[ExtendedLibrary] ⚠️ korea_gov 소스는 현재 비활성화 상태입니다 (같은 이미지 반복 문제)`);
            // images = await this.searchKoreaGov(query, perSource);
            break;
          case 'news_agency':
            // 🔒 잠금: 나중에 수정 예정
            console.warn(`[ExtendedLibrary] ⚠️ news_agency 소스는 현재 비활성화 상태입니다 (같은 이미지 반복 문제)`);
            // images = await this.searchNewsAgency(query, perSource);
            break;
          default:
            // ✅ 기본 ImageLibrary로 위임 (pexels, unsplash, pixabay 등)
            // ExtendedImageLibrary는 korea_gov, news_agency만 처리
            // 다른 소스는 무시 (baseLibrary에서 처리됨)
            break;
        }

        return images;
      } catch (error) {
        console.error(`[ExtendedLibrary] ${source} 검색 실패:`, error);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    results.forEach(images => allImages.push(...images));

    // 이미지를 다운로드하고 filePath 설정
    const imagesToReturn = allImages.slice(0, count);
    if (this.config.autoDownload && imagesToReturn.length > 0) {
      await this.downloadExtendedImages(imagesToReturn);
    }

    return imagesToReturn;
  }

  /**
   * 확장 이미지 다운로드
   */
  private async downloadExtendedImages(images: ExtendedImage[]): Promise<void> {
    console.log(`[ExtendedLibrary] 📥 이미지 ${images.length}개 다운로드 중...`);
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // 다운로드 디렉토리 확인
    const downloadDir = this.config.storageDir;
    console.log(`[ExtendedLibrary] 📁 저장 디렉토리: ${downloadDir}`);
    
    try {
      await fs.access(downloadDir);
      console.log(`[ExtendedLibrary] ✓ 디렉토리 존재 확인`);
    } catch {
      console.log(`[ExtendedLibrary] 📁 디렉토리 생성 중...`);
      await fs.mkdir(downloadDir, { recursive: true });
      console.log(`[ExtendedLibrary] ✓ 디렉토리 생성 완료`);
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`[ExtendedLibrary] [${i + 1}/${images.length}] 다운로드 시작: ${image.url.substring(0, 60)}...`);
      
      try {
        // node-fetch와 https Agent 설정
        const nodeFetch = await import('node-fetch');
        const https = await import('https');
        
        // SSL 검증 무시 (공공 사이트의 SSL 설정 문제 대응)
        const agent = new https.Agent({
          rejectUnauthorized: false,
          // Legacy SSL renegotiation 허용 (OpenSSL 3.0+ 필수)
          secureOptions: 0x4, // SSL_OP_LEGACY_SERVER_CONNECT
        });
        
        console.log(`[ExtendedLibrary]    → Fetch 요청 중 (node-fetch + SSL bypass)...`);
        
        // node-fetch v3는 agent를 직접 전달
        const fetchOptions: any = {
          timeout: 10000, // 10초 타임아웃
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        };
        
        if (image.url.startsWith('https')) {
          fetchOptions.agent = agent;
        }
        
        const response = await nodeFetch.default(image.url, fetchOptions);
        
        if (!response.ok) {
          console.log(`[ExtendedLibrary]    ✗ HTTP ${response.status} 에러`);
          failCount++;
          continue;
        }
        
        console.log(`[ExtendedLibrary]    → 버퍼 변환 중...`);
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(`[ExtendedLibrary]    → 파일 크기: ${(buffer.length / 1024).toFixed(2)} KB`);
        
        // 너무 작은 이미지는 건너뛰기 (로고, 아이콘 등)
        if (buffer.length < 5000) { // 5KB 미만
          console.log(`[ExtendedLibrary]    ✗ 이미지가 너무 작음 (${buffer.length} bytes), 건너뛰기`);
          failCount++;
          continue;
        }
        
        const ext = this.getExtension(image.url);
        const fileName = `${image.id}${ext}`;
        const filePath = path.join(downloadDir, fileName);
        
        console.log(`[ExtendedLibrary]    → 파일 저장 중: ${fileName}`);
        await fs.writeFile(filePath, buffer);
        
        // ✅ 중요: filePath와 localPath 모두 설정
        image.filePath = filePath;
        image.localPath = filePath;
        image.downloadedAt = new Date();
        
        successCount++;
        console.log(`[ExtendedLibrary]    ✓ 다운로드 완료: ${fileName} (${(buffer.length / 1024).toFixed(2)} KB)`);
      } catch (error) {
        failCount++;
        const errorMessage = (error as Error).message;
        const errorStack = (error as Error).stack;
        console.log(`[ExtendedLibrary]    ✗ 다운로드 실패: ${errorMessage}`);
        console.log(`[ExtendedLibrary]    상세 에러:`, error);
      }
    }
    
    console.log(`[ExtendedLibrary] 📊 다운로드 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
  }

  /**
   * URL에서 파일 확장자 추출
   */
  private getExtension(url: string): string {
    const match = url.match(/\.(jpg|jpeg|png|webp|gif)/i);
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
  }
}

/**
 * 소제목에서 핵심 키워드 추출 (조사 제거, 의미 있는 단어만)
 */
function extractKeywordsFromHeading(heading: string): string[] {
  if (!heading || heading.trim().length === 0) {
    return [];
  }

  // 조사, 어미, 불필요한 단어 제거
  const stopWords = [
    '을', '를', '이', '가', '의', '에', '에서', '로', '으로', '와', '과', '하고', '도', '만', '부터', '까지',
    '은', '는', '처럼', '같이', '보다', '치고', '마다', '따라', '더러', '에게', '께', '한테',
    '마무리', '결론', '정리', '요약', '끝으로', '마지막으로', '소개', '알아보기'
  ];

  // 일반적인 단어 제거 (너무 일반적이거나 혼동될 수 있는 단어)
  const genericWords = ['영감', '도움', '이유', '방법', '이야기', '내용', '정보', '팁', '노하우'];

  // 소제목에서 콜론(:) 앞부분 제거 (예: "마무리: 내용" → "내용")
  const cleanHeading = heading.replace(/^[^:]*:\s*/, '').trim();

  // 한글 단어 추출 (2글자 이상)
  const koreanWords = cleanHeading.match(/[가-힣]{2,}/g) || [];

  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const word of koreanWords) {
    // 조사/어미가 붙은 단어에서 조사 제거
    let cleanWord = word;
    
    // 조사 제거
    for (const stopWord of stopWords) {
      if (cleanWord.endsWith(stopWord)) {
        cleanWord = cleanWord.slice(0, -stopWord.length);
        break;
      }
      if (cleanWord.startsWith(stopWord)) {
        cleanWord = cleanWord.slice(stopWord.length);
        break;
      }
    }

    // 너무 짧거나 일반적인 단어 제외
    if (cleanWord.length < 2) continue;
    if (genericWords.includes(cleanWord)) continue;
    if (stopWords.includes(cleanWord)) continue;

    // 중복 제거
    if (!seen.has(cleanWord)) {
      seen.add(cleanWord);
      keywords.push(cleanWord);
    }
  }

  // 최대 3-4개의 핵심 키워드만 반환 (너무 많으면 검색 품질이 떨어짐)
  // 길이가 긴 단어를 우선 (구체적인 키워드가 검색에 유리)
  const sortedKeywords = keywords
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);

  console.log(`[키워드 추출] "${heading}" → [${sortedKeywords.join(', ')}]`);
  
  return sortedKeywords.length > 0 ? sortedKeywords : [cleanHeading]; // 추출 실패 시 원본 반환
}

/**
 * 자동화 시작 시 이미지 수집
 */
export async function collectImagesOnAutomationStart(
  library: ExtendedImageLibrary,
  title: string,
  keywords: string[],
  category: string,
  headings: string[],
  imageMode: 'full-auto' | 'semi-auto' | 'manual' | 'skip'
): Promise<Map<string, ExtendedImage[]>> {
  const imageMap = new Map<string, ExtendedImage[]>();

  // 뉴스 카테고리 감지
  const newsCategories = [
    'entertainment', '연예', 'news', '뉴스',
    'sports', '스포츠', 'politics', '정치',
    'economy', '경제', 'society', '사회'
  ];

  const isNewsCategory = newsCategories.some(nc =>
    category.toLowerCase().includes(nc.toLowerCase())
  );

  if (isNewsCategory) {
    library.setSourceEnabled('news_agency', true);
  }

  // 활성화된 소스 확인 및 로깅
  const enabledSources = Array.from(library['enabledSources'] || []);
  console.log(`[이미지 수집] 활성화된 소스: ${enabledSources.join(', ')}`);
  
  // 제목과 키워드 검증
  if (!title || title.trim().length === 0) {
    console.log(`[이미지 수집] ⚠️ 제목이 비어있어 이미지 수집을 건너뜁니다.`);
    return imageMap;
  }
  
  // 소제목별로 이미지 수집
  for (const heading of headings) {
    // 빈 소제목 건너뛰기
    if (!heading || heading.trim().length === 0) {
      console.log(`[이미지 수집] ⚠️ 빈 소제목을 건너뜁니다.`);
      continue;
    }
    
    // ✅ 소제목에서 핵심 키워드 추출 (조사 제거, 의미 있는 단어만)
    const extractedKeywords = extractKeywordsFromHeading(heading);
    
    // 검색 쿼리 구성: 제목 + 추출된 핵심 키워드 + 추가 키워드
    const coreKeywords = extractedKeywords.length > 0 
      ? extractedKeywords.join(' ') 
      : heading; // 추출 실패 시 원본 소제목 사용
    
    const searchQuery = `${title} ${coreKeywords} ${keywords.join(' ')}`.trim();
    console.log(`[이미지 수집] 소제목 "${heading}" → 핵심 키워드: [${extractedKeywords.join(', ')}] → 검색: "${searchQuery}"`);
    
    // 검색어 검증
    if (searchQuery.length < 2) {
      console.log(`[이미지 수집] ⚠️ 검색어가 너무 짧아 건너뜁니다: "${searchQuery}"`);
      continue;
    }
    
    const images = await library.collectImages(searchQuery, {
      sources: enabledSources.length > 0 ? enabledSources : undefined, // 명시적으로 소스 전달
      count: 5, // 소제목당 5개
    });

    console.log(`[이미지 수집] 소제목 "${heading}" 결과: ${images.length}개 이미지 수집됨`);

    // heading 속성 추가
    images.forEach(img => {
      img.heading = heading;
    });

    if (images.length > 0) {
      imageMap.set(heading, images);
    }
  }

  // 제목용 이미지도 수집
  const titleQuery = `${title} ${keywords.join(' ')}`.trim();
  
  // 제목 검색어 검증
  if (titleQuery.length >= 2) {
    console.log(`[이미지 수집] 제목 이미지 검색: "${titleQuery}"`);
    const titleImages = await library.collectImages(titleQuery, {
      sources: enabledSources.length > 0 ? enabledSources : undefined, // 명시적으로 소스 전달
      count: 3,
    });
    console.log(`[이미지 수집] 제목 이미지 결과: ${titleImages.length}개 이미지 수집됨`);
    
    if (titleImages.length > 0) {
      imageMap.set('title', titleImages);
    }
  } else {
    console.log(`[이미지 수집] ⚠️ 제목 검색어가 너무 짧아 건너뜁니다: "${titleQuery}"`);
  }
  
  console.log(`[이미지 수집] 전체 결과: ${imageMap.size}개 소제목에 ${Array.from(imageMap.values()).flat().length}개 이미지 수집됨`);

  return imageMap;
}

