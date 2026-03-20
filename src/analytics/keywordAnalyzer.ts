import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { getProxyUrl, isProxyEnabled } from '../crawler/utils/proxyManager.js';
import { BestProductCollector } from '../services/bestProductCollector.js';

// ✅ 키워드 경쟁도 분석 결과 타입
export type KeywordCompetition = {
  keyword: string;
  searchVolume: 'high' | 'medium' | 'low';
  competition: 'high' | 'medium' | 'low';
  difficulty: number; // 0-100 (낮을수록 쉬움)
  opportunity: number; // 0-100 (높을수록 좋은 기회)
  blogCount: number;
  newsCount: number;
  topBlogAuthority: 'high' | 'medium' | 'low';
  recommendation: 'excellent' | 'good' | 'moderate' | 'difficult' | 'avoid';
  reasons: string[];
  suggestions: string[];
  relatedKeywords: string[];
  analyzedAt: string;
  // ✅ 네이버 광고 API 데이터 (있을 경우)
  naverAdData?: {
    monthlyPcQcCnt: number;      // PC 월간 검색수
    monthlyMobileQcCnt: number;  // 모바일 월간 검색수
    monthlyAvePcClkCnt: number;  // PC 월평균 클릭수
    monthlyAveMobileClkCnt: number; // 모바일 월평균 클릭수
    monthlyAvePcCtr: number;     // PC 월평균 클릭률
    monthlyAveMobileCtr: number; // 모바일 월평균 클릭률
    plAvgDepth: number;          // 월평균 노출 광고수
    compIdx: string;             // 경쟁정도 (높음/중간/낮음)
  };
};

// ✅ 블루오션 키워드 추천 결과
export type BlueOceanKeyword = {
  keyword: string;
  score: number; // 0-100
  searchVolume: string;
  competition: string;
  reason: string;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ✅ 네이버 광고 API 설정 타입
export type NaverAdApiConfig = {
  apiKey: string;
  secretKey: string;
  customerId: string;
};

// ✅ 네이버 검색 API 설정 타입
export type NaverSearchApiConfig = {
  clientId: string;
  clientSecret: string;
};

export class KeywordAnalyzer {
  private cache: Map<string, { data: KeywordCompetition; expiry: number }> = new Map();
  private cacheExpiry = 30 * 60 * 1000; // 30분 캐시
  private naverAdConfig: NaverAdApiConfig | null = null;
  private naverSearchConfig: NaverSearchApiConfig | null = null;
  private bestProductCollector: BestProductCollector = new BestProductCollector();

  // ✅ [2026-03-20] 프록시 적용 axios 설정 헬퍼
  private async getAxiosConfig(extraHeaders?: Record<string, string>): Promise<Record<string, any>> {
    const config: Record<string, any> = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        ...extraHeaders,
      },
      timeout: 15000,
    };

    // ✅ SmartProxy 적용 (활성 시)
    if (isProxyEnabled()) {
      const proxyUrl = await getProxyUrl();
      if (proxyUrl) {
        // axios proxy 설정으로 변환
        const url = new URL(proxyUrl);
        config.proxy = {
          host: url.hostname,
          port: parseInt(url.port),
          auth: {
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
          },
          protocol: url.protocol.replace(':', ''),
        };
      }
    }

    return config;
  }

  // ✅ 네이버 검색 API 설정
  setNaverSearchConfig(config: NaverSearchApiConfig): void {
    if (config.clientId && config.clientSecret) {
      this.naverSearchConfig = config;
      console.log('[KeywordAnalyzer] 네이버 검색 API 설정 완료');
    }
  }

  // ✅ 네이버 광고 API 설정
  setNaverAdConfig(config: NaverAdApiConfig): void {
    if (config.apiKey && config.secretKey && config.customerId) {
      this.naverAdConfig = config;
      console.log('[KeywordAnalyzer] 네이버 광고 API 설정 완료');
    } else {
      this.naverAdConfig = null;
      console.log('[KeywordAnalyzer] 네이버 광고 API 설정 불완전 - 웹 스크래핑 모드로 동작');
    }
  }

  // ✅ 네이버 광고 API 서명 생성
  private generateNaverAdSignature(timestamp: string, method: string, uri: string): string {
    if (!this.naverAdConfig) return '';
    
    const message = `${timestamp}.${method}.${uri}`;
    const hmac = crypto.createHmac('sha256', this.naverAdConfig.secretKey);
    hmac.update(message);
    return hmac.digest('base64');
  }

  // ✅ 네이버 광고 API로 키워드 검색량 조회
  private async fetchNaverAdKeywordData(keyword: string): Promise<KeywordCompetition['naverAdData'] | null> {
    if (!this.naverAdConfig) {
      console.log('[KeywordAnalyzer] 네이버 광고 API 미설정 - 스킵');
      return null;
    }

    try {
      const timestamp = String(Date.now());
      const method = 'GET';
      const uri = '/keywordstool';
      const signature = this.generateNaverAdSignature(timestamp, method, uri);

      const response = await axios.get(`https://api.searchad.naver.com${uri}`, {
        params: {
          hintKeywords: keyword,
          showDetail: '1',
        },
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': this.naverAdConfig.apiKey,
          'X-Customer': this.naverAdConfig.customerId,
          'X-Signature': signature,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      console.log('[KeywordAnalyzer] 네이버 광고 API 응답:', JSON.stringify(response.data).substring(0, 200));

      if (response.data && response.data.keywordList && response.data.keywordList.length > 0) {
        // 정확히 일치하는 키워드 찾기
        const exactMatch = response.data.keywordList.find(
          (item: any) => item.relKeyword?.toLowerCase() === keyword.toLowerCase()
        );
        
        const keywordData = exactMatch || response.data.keywordList[0];
        
        return {
          monthlyPcQcCnt: this.parseSearchCount(keywordData.monthlyPcQcCnt),
          monthlyMobileQcCnt: this.parseSearchCount(keywordData.monthlyMobileQcCnt),
          monthlyAvePcClkCnt: parseFloat(keywordData.monthlyAvePcClkCnt) || 0,
          monthlyAveMobileClkCnt: parseFloat(keywordData.monthlyAveMobileClkCnt) || 0,
          monthlyAvePcCtr: parseFloat(keywordData.monthlyAvePcCtr) || 0,
          monthlyAveMobileCtr: parseFloat(keywordData.monthlyAveMobileCtr) || 0,
          plAvgDepth: parseInt(keywordData.plAvgDepth) || 0,
          compIdx: keywordData.compIdx || '낮음',
        };
      }

      return null;
    } catch (error: any) {
      console.error('[KeywordAnalyzer] 네이버 광고 API 호출 실패:', error.response?.data || error.message);
      return null;
    }
  }

  // ✅ 검색수 파싱 (< 10, 10 ~ 100 등의 형식 처리)
  private parseSearchCount(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // "< 10" -> 5, "10 ~ 100" -> 50 등으로 변환
      if (value.includes('<')) {
        const num = parseInt(value.replace(/[^0-9]/g, ''));
        return Math.max(1, num / 2);
      }
      if (value.includes('~')) {
        const parts = value.split('~').map((p: string) => parseInt(p.replace(/[^0-9]/g, '')));
        return Math.round((parts[0] + parts[1]) / 2);
      }
      return parseInt(value.replace(/[^0-9]/g, '')) || 0;
    }
    return 0;
  }

  // ✅ 키워드 경쟁도 분석
  async analyzeKeyword(keyword: string): Promise<KeywordCompetition> {
    // 캐시 확인
    const cached = this.cache.get(keyword);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    console.log(`[KeywordAnalyzer] 키워드 분석 시작: ${keyword}`);

    try {
      // 병렬로 데이터 수집 (네이버 광고 API 포함)
      const [blogData, newsData, relatedData, naverAdData] = await Promise.all([
        this.fetchBlogSearchResults(keyword),
        this.fetchNewsSearchResults(keyword),
        this.fetchRelatedKeywords(keyword),
        this.fetchNaverAdKeywordData(keyword),
      ]);

      // 네이버 광고 API 데이터가 있으면 더 정확한 분석
      let searchVolume: 'high' | 'medium' | 'low';
      let competition: 'high' | 'medium' | 'low';
      let difficulty: number;
      let opportunity: number;

      if (naverAdData) {
        // ✅ 네이버 광고 API 기반 정확한 분석
        const totalMonthlySearch = naverAdData.monthlyPcQcCnt + naverAdData.monthlyMobileQcCnt;
        
        // 검색량 판단 (월간 검색수 기준)
        if (totalMonthlySearch >= 50000) searchVolume = 'high';
        else if (totalMonthlySearch >= 5000) searchVolume = 'medium';
        else searchVolume = 'low';
        
        // 경쟁도 판단 (네이버 광고 API의 compIdx 활용)
        if (naverAdData.compIdx === '높음') competition = 'high';
        else if (naverAdData.compIdx === '중간') competition = 'medium';
        else competition = 'low';
        
        // 난이도 계산 (광고 노출수 + 경쟁도 + 뉴스 기반)
        difficulty = this.calculateDifficultyWithAdData(naverAdData, blogData, newsData);
        
        // 기회 점수 계산 (블루오션 판단 포함)
        opportunity = this.calculateOpportunityWithAdData(naverAdData, difficulty, blogData);
        
        console.log(`[KeywordAnalyzer] 네이버 광고 API 데이터 사용: 월간검색 ${totalMonthlySearch}, 경쟁도 ${naverAdData.compIdx}`);
      } else {
        // ✅ 웹 스크래핑 기반 추정 분석
        competition = this.calculateCompetition(blogData, newsData);
        searchVolume = this.estimateSearchVolume(blogData, newsData);
        difficulty = this.calculateDifficulty(blogData, competition);
        opportunity = this.calculateOpportunity(searchVolume, competition, difficulty);
        
        console.log(`[KeywordAnalyzer] 웹 스크래핑 기반 분석 (네이버 광고 API 미설정)`);
      }

      const recommendation = this.getRecommendation(opportunity, difficulty);
      const reasons = this.generateReasons(blogData, newsData, competition, searchVolume, naverAdData || undefined);
      const suggestions = this.generateSuggestions(keyword, recommendation, relatedData);

      const result: KeywordCompetition = {
        keyword,
        searchVolume,
        competition,
        difficulty,
        opportunity,
        blogCount: blogData.totalCount,
        newsCount: newsData.totalCount,
        topBlogAuthority: blogData.topAuthority,
        recommendation,
        reasons,
        suggestions,
        relatedKeywords: relatedData.slice(0, 10),
        analyzedAt: new Date().toISOString(),
        naverAdData: naverAdData || undefined,
      };

      // 캐시 저장
      this.cache.set(keyword, { data: result, expiry: Date.now() + this.cacheExpiry });

      return result;
    } catch (error) {
      console.error(`[KeywordAnalyzer] 분석 실패:`, error);
      throw error;
    }
  }

  // ✅ 네이버 광고 API 데이터 기반 난이도 계산 (현실적 수치)
  private calculateDifficultyWithAdData(
    adData: NonNullable<KeywordCompetition['naverAdData']>,
    blogData: { totalCount: number; topAuthority: string },
    newsData: { totalCount: number; isTrending: boolean }
  ): number {
    let difficulty = 0;
    const totalMonthlySearch = adData.monthlyPcQcCnt + adData.monthlyMobileQcCnt;
    
    // 1. 월간 검색량 기반 난이도 (35점) - 검색량 높을수록 경쟁 치열
    if (totalMonthlySearch >= 100000) difficulty += 35;
    else if (totalMonthlySearch >= 50000) difficulty += 30;
    else if (totalMonthlySearch >= 10000) difficulty += 20;
    else if (totalMonthlySearch >= 1000) difficulty += 10;
    else difficulty += 5;
    
    // 2. 네이버 광고 경쟁도 기반 (25점)
    if (adData.compIdx === '높음') difficulty += 25;
    else if (adData.compIdx === '중간') difficulty += 15;
    else difficulty += 5;
    
    // 3. 블로그 수 기반 (25점)
    if (blogData.totalCount > 500000) difficulty += 25;
    else if (blogData.totalCount > 100000) difficulty += 20;
    else if (blogData.totalCount > 50000) difficulty += 15;
    else if (blogData.totalCount > 10000) difficulty += 10;
    else difficulty += 5;
    
    // 4. 뉴스/트렌딩 기반 (15점) - 뉴스 많으면 경쟁 치열
    if (newsData.isTrending) difficulty += 15;
    else if (newsData.totalCount > 10000) difficulty += 10;
    else if (newsData.totalCount > 1000) difficulty += 5;
    
    // 5. 상위 권위도 추가 페널티
    if (blogData.topAuthority === 'high') difficulty += 10;
    
    return Math.min(100, difficulty);
  }

  // ✅ 네이버 광고 API 데이터 기반 기회 점수 계산 (현실적 수치)
  // 기회점수 = 트래픽 잠재력 vs 경쟁 난이도의 균형
  private calculateOpportunityWithAdData(
    adData: NonNullable<KeywordCompetition['naverAdData']>,
    difficulty: number,
    blogData: { totalCount: number }
  ): number {
    const totalMonthlySearch = adData.monthlyPcQcCnt + adData.monthlyMobileQcCnt;
    
    // 기본 기회점수 = 100 - 난이도
    let opportunity = 100 - difficulty;
    
    // ✅ 블루오션 판단: 검색량 대비 블로그 수 비율
    // 검색량은 적당하고 블로그 수가 적으면 블루오션
    const searchToBlogRatio = blogData.totalCount > 0 
      ? totalMonthlySearch / blogData.totalCount 
      : 0;
    
    if (searchToBlogRatio >= 10) {
      // 검색량 대비 블로그 수 매우 적음 = 좋은 기회
      opportunity += 20;
    } else if (searchToBlogRatio >= 5) {
      opportunity += 10;
    } else if (searchToBlogRatio >= 1) {
      opportunity += 5;
    } else if (searchToBlogRatio < 0.1) {
      // 블로그 수가 검색량보다 10배 이상 = 포화 시장
      opportunity -= 20;
    }
    
    // ✅ 경쟁도 낮으면 보너스
    if (adData.compIdx === '낮음') opportunity += 15;
    else if (adData.compIdx === '중간') opportunity += 5;
    else if (adData.compIdx === '높음') opportunity -= 15;
    
    // ✅ 적정 검색량 보너스 (너무 높으면 경쟁, 너무 낮으면 트래픽 없음)
    if (totalMonthlySearch >= 5000 && totalMonthlySearch <= 30000) {
      // 블루오션 최적 구간
      opportunity += 10;
    } else if (totalMonthlySearch >= 1000 && totalMonthlySearch <= 50000) {
      opportunity += 5;
    } else if (totalMonthlySearch >= 100000) {
      // 대형 키워드는 진입 어려움
      opportunity -= 10;
    }
    
    return Math.max(0, Math.min(100, opportunity));
  }

  // ✅ 네이버 블로그 검색 결과 분석 (API 우선, 스크래핑 폴백)
  private async fetchBlogSearchResults(keyword: string): Promise<{
    totalCount: number;
    topAuthority: 'high' | 'medium' | 'low';
    recentPostCount: number;
    avgInfluencer: number;
  }> {
    // 1. 네이버 검색 API 사용 시도
    if (this.naverSearchConfig) {
      try {
        const response = await axios.get('https://openapi.naver.com/v1/search/blog.json', {
          params: {
            query: keyword,
            display: 10,
            sort: 'sim',
          },
          headers: {
            'X-Naver-Client-Id': this.naverSearchConfig.clientId,
            'X-Naver-Client-Secret': this.naverSearchConfig.clientSecret,
          },
          timeout: 10000,
        });

        const data = response.data;
        const totalCount = data.total || 0;
        let recentPostCount = 0;
        let influencerCount = 0;

        // 상위 결과 분석
        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            // 최근 게시물 체크
            const postDate = new Date(item.postdate);
            const daysDiff = (Date.now() - postDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 7) {
              recentPostCount++;
            }
            // 인플루언서 체크 (블로그명으로 추정)
            if (item.bloggername && (item.bloggername.includes('공식') || item.bloggername.length > 10)) {
              influencerCount++;
            }
          }
        }

        let topAuthority: 'high' | 'medium' | 'low' = 'low';
        if (influencerCount >= 5) topAuthority = 'high';
        else if (influencerCount >= 2) topAuthority = 'medium';

        console.log(`[KeywordAnalyzer] 블로그 검색 API 성공: ${keyword} (${totalCount.toLocaleString()}개)`);
        return { totalCount, topAuthority, recentPostCount, avgInfluencer: influencerCount };
      } catch (error) {
        console.warn(`[KeywordAnalyzer] 블로그 검색 API 실패, 스크래핑 시도:`, (error as Error).message);
      }
    }

    // 2. 스크래핑 폴백 (프록시 적용)
    try {
      const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
      const axiosConfig = await this.getAxiosConfig();
      const response = await axios.get(url, axiosConfig);

      const $ = cheerio.load(response.data);
      
      // 총 검색 결과 수 추출 (여러 셀렉터 시도)
      let totalCount = 0;
      const countSelectors = ['.title_num', '.sub_txt', '.result_num', '.total_number'];
      for (const selector of countSelectors) {
        const countText = $(selector).text();
        const countMatch = countText.match(/([\d,]+)/);
        if (countMatch) {
          totalCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
          break;
        }
      }

      // 결과가 없으면 블로그 아이템 수로 추정
      if (totalCount === 0) {
        const blogItems = $('.total_wrap .bx, .api_subject_bx, .view_wrap').length;
        if (blogItems > 0) {
          totalCount = blogItems * 10000; // 추정치
        }
      }

      let influencerCount = 0;
      let recentPostCount = 0;

      // 여러 셀렉터로 블로그 아이템 분석
      $('[class*="blog"], [class*="post"], .total_wrap .bx').each((i, el) => {
        if (i >= 10) return false;
        const text = $(el).text();
        if (text.includes('일 전') || text.includes('시간 전') || text.includes('분 전')) {
          recentPostCount++;
        }
        if (text.includes('인플루언서') || text.includes('공식')) {
          influencerCount++;
        }
      });

      let topAuthority: 'high' | 'medium' | 'low' = 'low';
      if (influencerCount >= 5) topAuthority = 'high';
      else if (influencerCount >= 2) topAuthority = 'medium';

      console.log(`[KeywordAnalyzer] 블로그 스크래핑 완료: ${keyword} (${totalCount.toLocaleString()}개)`);
      return { totalCount, topAuthority, recentPostCount, avgInfluencer: influencerCount };
    } catch (error) {
      console.warn(`[KeywordAnalyzer] 블로그 검색 실패:`, (error as Error).message);
      return { totalCount: 0, topAuthority: 'low', recentPostCount: 0, avgInfluencer: 0 };
    }
  }

  // ✅ 네이버 뉴스 검색 결과 분석
  private async fetchNewsSearchResults(keyword: string): Promise<{
    totalCount: number;
    recentNewsCount: number;
    isTrending: boolean;
  }> {
    try {
      const url = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}`;
      const axiosConfig = await this.getAxiosConfig();
      const response = await axios.get(url, axiosConfig);

      const $ = cheerio.load(response.data);
      
      let totalCount = 0;
      const countText = $('.title_num').text() || $('.sub_txt').text();
      const countMatch = countText.match(/([\d,]+)/);
      if (countMatch) {
        totalCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
      }

      // 최근 뉴스 수 (24시간 내)
      let recentNewsCount = 0;
      $('.news_tit').each((i, el) => {
        if (i >= 10) return false;
        const parent = $(el).closest('.news_area');
        const dateText = parent.find('.info_group').text();
        if (dateText.includes('시간 전') || dateText.includes('분 전')) {
          recentNewsCount++;
        }
      });

      const isTrending = recentNewsCount >= 3;

      return { totalCount, recentNewsCount, isTrending };
    } catch (error) {
      console.warn(`[KeywordAnalyzer] 뉴스 검색 실패:`, (error as Error).message);
      return { totalCount: 0, recentNewsCount: 0, isTrending: false };
    }
  }

  // ✅ 연관 키워드 수집
  private async fetchRelatedKeywords(keyword: string): Promise<string[]> {
    try {
      const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}`;
      const axiosConfig = await this.getAxiosConfig();
      const response = await axios.get(url, axiosConfig);

      const $ = cheerio.load(response.data);
      const related: string[] = [];

      // 연관 검색어 추출
      $('.lst_related_srch a, .related_srch a, .keyword_list a').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text !== keyword && !related.includes(text)) {
          related.push(text);
        }
      });

      return related;
    } catch (error) {
      console.warn(`[KeywordAnalyzer] 연관 키워드 수집 실패:`, (error as Error).message);
      return [];
    }
  }

  // ✅ 경쟁도 계산
  private calculateCompetition(
    blogData: { totalCount: number; topAuthority: string; avgInfluencer: number },
    newsData: { totalCount: number; isTrending: boolean }
  ): 'high' | 'medium' | 'low' {
    const blogScore = blogData.totalCount > 100000 ? 3 : blogData.totalCount > 10000 ? 2 : 1;
    const authorityScore = blogData.topAuthority === 'high' ? 3 : blogData.topAuthority === 'medium' ? 2 : 1;
    const newsScore = newsData.isTrending ? 2 : 1;
    
    const totalScore = blogScore + authorityScore + newsScore;
    
    if (totalScore >= 7) return 'high';
    if (totalScore >= 4) return 'medium';
    return 'low';
  }

  // ✅ 검색량 추정
  private estimateSearchVolume(
    blogData: { totalCount: number },
    newsData: { totalCount: number; isTrending: boolean }
  ): 'high' | 'medium' | 'low' {
    const totalContent = blogData.totalCount + newsData.totalCount;
    
    if (totalContent > 500000 || newsData.isTrending) return 'high';
    if (totalContent > 50000) return 'medium';
    return 'low';
  }

  // ✅ 난이도 계산 (0-100)
  private calculateDifficulty(
    blogData: { totalCount: number; topAuthority: string; avgInfluencer: number },
    competition: string
  ): number {
    let difficulty = 0;
    
    // 블로그 수 기반
    if (blogData.totalCount > 100000) difficulty += 40;
    else if (blogData.totalCount > 50000) difficulty += 30;
    else if (blogData.totalCount > 10000) difficulty += 20;
    else difficulty += 10;
    
    // 상위 권위도 기반
    if (blogData.topAuthority === 'high') difficulty += 30;
    else if (blogData.topAuthority === 'medium') difficulty += 20;
    else difficulty += 10;
    
    // 경쟁도 기반
    if (competition === 'high') difficulty += 30;
    else if (competition === 'medium') difficulty += 20;
    else difficulty += 10;
    
    return Math.min(100, difficulty);
  }

  // ✅ 기회 점수 계산 (0-100) - 웹 스크래핑 기반 (현실적 수치)
  private calculateOpportunity(
    searchVolume: string,
    competition: string,
    difficulty: number
  ): number {
    let opportunity = 100 - difficulty;
    
    // ✅ 검색량 높으면 경쟁 치열 = 기회점수 하락
    if (searchVolume === 'high') opportunity -= 15;
    else if (searchVolume === 'medium') opportunity += 5;
    else opportunity += 10; // 검색량 낮으면 약간 보너스 (블루오션 가능성)
    
    // ✅ 경쟁도 조정
    if (competition === 'low') opportunity += 20;
    else if (competition === 'medium') opportunity += 5;
    else if (competition === 'high') opportunity -= 20;
    
    return Math.max(0, Math.min(100, opportunity));
  }

  // ✅ 추천 등급 결정
  private getRecommendation(opportunity: number, difficulty: number): 'excellent' | 'good' | 'moderate' | 'difficult' | 'avoid' {
    if (opportunity >= 70 && difficulty <= 40) return 'excellent';
    if (opportunity >= 50 && difficulty <= 60) return 'good';
    if (opportunity >= 30 && difficulty <= 70) return 'moderate';
    if (opportunity >= 20) return 'difficult';
    return 'avoid';
  }

  // ✅ 분석 이유 생성
  private generateReasons(
    blogData: { totalCount: number; topAuthority: string; recentPostCount: number },
    newsData: { totalCount: number; isTrending: boolean },
    competition: string,
    searchVolume: string,
    naverAdData?: KeywordCompetition['naverAdData']
  ): string[] {
    const reasons: string[] = [];
    
    // ✅ 네이버 광고 API 데이터가 있으면 정확한 수치 표시
    if (naverAdData) {
      const totalMonthlySearch = naverAdData.monthlyPcQcCnt + naverAdData.monthlyMobileQcCnt;
      reasons.push(`📊 월간 검색량: ${totalMonthlySearch.toLocaleString()}회 (PC: ${naverAdData.monthlyPcQcCnt.toLocaleString()}, 모바일: ${naverAdData.monthlyMobileQcCnt.toLocaleString()})`);
      reasons.push(`🎯 네이버 광고 경쟁도: ${naverAdData.compIdx}`);
      
      if (naverAdData.plAvgDepth > 0) {
        reasons.push(`📢 평균 광고 노출수: ${naverAdData.plAvgDepth}개`);
      }
    } else {
      if (searchVolume === 'high') {
        reasons.push('🔥 검색량이 높아 트래픽 잠재력이 큽니다. (추정치)');
      } else if (searchVolume === 'low') {
        reasons.push('📉 검색량이 낮아 트래픽이 제한적일 수 있습니다. (추정치)');
      }
    }
    
    if (competition === 'high') {
      reasons.push('⚔️ 경쟁이 치열하여 상위 노출이 어려울 수 있습니다.');
    } else if (competition === 'low') {
      reasons.push('✨ 경쟁이 낮아 상위 노출 가능성이 높습니다.');
    }
    
    if (blogData.topAuthority === 'high') {
      reasons.push('👑 상위 검색 결과에 인플루언서/공식 블로그가 많습니다.');
    }
    
    if (newsData.isTrending) {
      reasons.push('📰 현재 뉴스에서 화제가 되고 있는 키워드입니다.');
    }
    
    if (blogData.recentPostCount >= 5) {
      reasons.push('📝 최근 발행된 글이 많아 경쟁이 활발합니다.');
    }
    
    // 블로그 수 정보
    if (blogData.totalCount > 0) {
      reasons.push(`📝 관련 블로그 글: ${blogData.totalCount.toLocaleString()}개`);
    }
    
    return reasons;
  }

  // ✅ 제안 생성
  private generateSuggestions(keyword: string, recommendation: string, relatedKeywords: string[]): string[] {
    const suggestions: string[] = [];
    
    if (recommendation === 'excellent' || recommendation === 'good') {
      suggestions.push(`✅ "${keyword}" 키워드로 바로 발행하세요!`);
      suggestions.push('⏰ 최적 발행 시간: 오전 7-9시, 점심 12-1시, 저녁 6-8시');
    } else if (recommendation === 'moderate') {
      suggestions.push(`📝 "${keyword}"에 구체적인 수식어를 추가해보세요.`);
      if (relatedKeywords.length > 0) {
        suggestions.push(`💡 추천 조합: "${keyword} ${relatedKeywords[0]}"`);
      }
    } else {
      suggestions.push('🔄 경쟁이 낮은 롱테일 키워드를 고려해보세요.');
      if (relatedKeywords.length > 2) {
        suggestions.push(`💡 대안 키워드: "${relatedKeywords[1]}", "${relatedKeywords[2]}"`);
      }
    }
    
    return suggestions;
  }

  // ✅ 블루오션 키워드 추천 (검색량 높고 문서량 낮은 키워드 찾기)
  async findBlueOceanKeywords(baseKeyword: string, count: number = 5): Promise<BlueOceanKeyword[]> {
    const results: BlueOceanKeyword[] = [];
    
    try {
      console.log(`[KeywordAnalyzer] 블루오션 키워드 검색 시작: ${baseKeyword}`);
      
      // 1. 네이버 검색 연관 키워드만 수집 (더미 데이터 생성 안 함)
      const relatedKeywords = await this.fetchRelatedKeywords(baseKeyword);
      console.log(`[KeywordAnalyzer] 연관 키워드 ${relatedKeywords.length}개 수집`);
      
      if (relatedKeywords.length === 0) {
        console.log('[KeywordAnalyzer] 연관 키워드가 없습니다');
        return [];
      }
      
      // 2. 각 연관 키워드의 검색량/문서량 분석 (실제 데이터만)
      for (const keyword of relatedKeywords.slice(0, 20)) {
        await sleep(300); // API 부하 방지
        
        try {
          const analysis = await this.analyzeKeyword(keyword);
          
          // ✅ 핵심 블루오션 조건: 검색량 높고 문서량 낮음
          // - 검색량: 월 1,000회 이상
          // - 문서량(블로그 수): 10만 이하
          // - 검색량/문서량 비율이 높을수록 좋음
          
          let monthlySearchVolume = 0;
          if (analysis.naverAdData) {
            monthlySearchVolume = analysis.naverAdData.monthlyPcQcCnt + analysis.naverAdData.monthlyMobileQcCnt;
          }
          
          const blogCount = analysis.blogCount || 0;
          
          // ✅ 황금키워드 점수 계산 (검색량↑ 문서량↓)
          // 핵심: 검색량은 높을수록, 문서량은 낮을수록 좋음
          let blueOceanScore = 0;
          
          if (monthlySearchVolume > 0) {
            // 1. 문서량 기반 점수 (낮을수록 높음) - 최대 60점
            if (blogCount <= 100) {
              blueOceanScore = 60; // 🔥 초황금: 문서량 100개 이하
            } else if (blogCount <= 500) {
              blueOceanScore = 55;
            } else if (blogCount <= 1000) {
              blueOceanScore = 50;
            } else if (blogCount <= 5000) {
              blueOceanScore = 40;
            } else if (blogCount <= 10000) {
              blueOceanScore = 30;
            } else if (blogCount <= 50000) {
              blueOceanScore = 20;
            } else if (blogCount <= 100000) {
              blueOceanScore = 10;
            } else {
              blueOceanScore = 0; // 문서량 10만 이상은 제외
            }
            
            // 2. 검색량 기반 보너스 (높을수록 좋음) - 최대 40점
            if (monthlySearchVolume >= 100000) {
              blueOceanScore += 40;
            } else if (monthlySearchVolume >= 50000) {
              blueOceanScore += 35;
            } else if (monthlySearchVolume >= 10000) {
              blueOceanScore += 30;
            } else if (monthlySearchVolume >= 5000) {
              blueOceanScore += 25;
            } else if (monthlySearchVolume >= 1000) {
              blueOceanScore += 20;
            } else if (monthlySearchVolume >= 500) {
              blueOceanScore += 10;
            }
            
            blueOceanScore = Math.min(100, blueOceanScore);
          }
          
          // ✅ 블루오션 필터링 조건 (엄격)
          const hasSearchVolume = monthlySearchVolume >= 500;
          const hasLowCompetition = blogCount <= 100000;
          const hasGoodScore = blueOceanScore >= 50;
          
          if (hasSearchVolume && hasLowCompetition && hasGoodScore) {
            results.push({
              keyword,
              score: Math.round(blueOceanScore),
              searchVolume: monthlySearchVolume > 0 
                ? `${monthlySearchVolume.toLocaleString()}회/월` 
                : analysis.searchVolume,
              competition: blogCount > 0 
                ? `${blogCount.toLocaleString()}개` 
                : analysis.competition,
              reason: this.generateBlueOceanReason(analysis, monthlySearchVolume, blogCount),
            });
          }
        } catch (err) {
          console.warn(`[KeywordAnalyzer] ${keyword} 분석 실패:`, (err as Error).message);
        }
      }
      
      // 점수순 정렬 (높은 순)
      results.sort((a, b) => b.score - a.score);
      
      console.log(`[KeywordAnalyzer] 블루오션 키워드 ${results.length}개 발견`);
      
      return results.slice(0, count);
    } catch (error) {
      console.error('[KeywordAnalyzer] 블루오션 키워드 검색 실패:', error);
      return [];
    }
  }

  // ✅ 블루오션 이유 생성 (검색량/문서량 기반)
  private generateBlueOceanReason(analysis: KeywordCompetition, searchVolume: number = 0, blogCount: number = 0): string {
    // 검색량/문서량 비율 기반 이유 생성
    if (searchVolume > 0 && blogCount > 0) {
      const ratio = searchVolume / blogCount;
      
      if (ratio >= 1) {
        return `🔥 검색량(${searchVolume.toLocaleString()}회) 대비 문서량(${blogCount.toLocaleString()}개)이 적어 상위노출 기회!`;
      }
      if (ratio >= 0.1) {
        return `✨ 경쟁 대비 검색량이 높아 트래픽 확보 가능 (${searchVolume.toLocaleString()}회/${blogCount.toLocaleString()}개)`;
      }
      if (blogCount <= 50000) {
        return `📊 문서량이 적어(${blogCount.toLocaleString()}개) 진입 장벽이 낮습니다.`;
      }
    }
    
    if (analysis.competition === 'low') {
      return '🌊 경쟁이 낮아 상위노출 가능성이 높습니다.';
    }
    if (analysis.difficulty <= 40) {
      return '✨ 난이도가 낮아 신규 블로그도 도전할 만합니다.';
    }
    if (analysis.opportunity >= 50) {
      return '💡 좋은 기회의 키워드입니다.';
    }
    return '📝 틈새 시장 공략이 가능한 키워드입니다.';
  }

  // ✅ 캐시 클리어
  clearCache(): void {
    this.cache.clear();
  }

  // ✅ [2026-03-20] 쇼핑커넥트 수익형 상품 키워드 발견
  // 라이프스타일 인기상품 크롤링 → 상품명 블로그 경쟁도 분석 → 고수익 저경쟁 상품 키워드 선별
  async discoverBlueOceanKeywords(count: number = 10): Promise<BlueOceanKeyword[]> {
    const results: BlueOceanKeyword[] = [];
    
    try {
      console.log('[KeywordAnalyzer] 🛒 쇼핑커넥트 수익형 상품 키워드 발견 시작...');
      
      // ═══════════════════════════════════════════
      // 1단계: 고가 라이프스타일 상품 키워드 수집 (2가지 소스)
      // ═══════════════════════════════════════════
      const productKeywords: string[] = [];
      
      // ✅ 소스 A: BestProductCollector 인기상품 (식품 제외, 라이프스타일만)
      const lifestyleCategories = ['digital', 'living', 'beauty', 'fashion', 'sports'];
      const selectedCats = lifestyleCategories.sort(() => Math.random() - 0.5).slice(0, 2);
      
      for (const catId of selectedCats) {
        try {
          const result = await this.bestProductCollector.fetchNaverBest(catId, 15, false);
          if (result.success && result.products.length > 0) {
            for (const product of result.products) {
              if (product.name && product.name.length >= 3) {
                // 식품/과자 필터링
                if (this.isFoodItem(product.name)) continue;
                
                if (product.name.length <= 25) {
                  productKeywords.push(product.name);
                }
                const words = product.name.split(/[\s/\[\]()·,]+/).filter((w: string) => w.length >= 2 && w.length <= 12);
                if (words.length >= 2) {
                  productKeywords.push(words.slice(0, 3).join(' '));
                }
              }
            }
            console.log(`[KeywordAnalyzer] 🛒 ${result.categoryName}: ${result.products.length}개 상품`);
          }
        } catch { /* skip */ }
      }
      
      // ✅ 소스 B: 네이버 쇼핑 인기 상품 검색 (나혼산/SNS 바이럴 상품류)
      const trendingProductQueries = this.getLifestyleProductQueries();
      const selectedQueries = trendingProductQueries.sort(() => Math.random() - 0.5).slice(0, 3);
      
      for (const query of selectedQueries) {
        try {
          const shopKeywords = await this.searchNaverShoppingProducts(query);
          productKeywords.push(...shopKeywords);
          console.log(`[KeywordAnalyzer] 🔍 쇼핑검색 "${query}": ${shopKeywords.length}개`);
        } catch { /* skip */ }
        await sleep(300);
      }
      
      // 중복 제거 + 셔플
      const uniqueProducts = [...new Set(productKeywords)].sort(() => Math.random() - 0.5);
      console.log(`[KeywordAnalyzer] 📦 총 상품 키워드 후보: ${uniqueProducts.length}개`);
      
      if (uniqueProducts.length === 0) {
        console.log('[KeywordAnalyzer] ⚠️ 상품 키워드 0개 — 일반 트렌드 폴백');
        return await this.discoverBlueOceanKeywordsFallback(count);
      }
      
      // ═══════════════════════════════════════════
      // 2단계: 각 상품 키워드의 블로그 경쟁도 분석
      // ═══════════════════════════════════════════
      console.log('[KeywordAnalyzer] 📊 상품 키워드 경쟁도 분석 시작...');
      
      for (const keyword of uniqueProducts.slice(0, 20)) {
        await sleep(400); // API 부하 방지
        
        try {
          const analysis = await this.analyzeKeyword(keyword);
          
          let monthlySearchVolume = 0;
          if (analysis.naverAdData) {
            monthlySearchVolume = analysis.naverAdData.monthlyPcQcCnt + analysis.naverAdData.monthlyMobileQcCnt;
          }
          
          const blogCount = analysis.blogCount || 0;
          
          // ✅ 쇼핑커넥트 수익형 점수 계산
          let score = 0;
          
          // 1. 문서량 기반 점수 (경쟁 낮을수록 높음) - 최대 50점
          if (blogCount <= 100) {
            score = 50; // 🔥 초황금: 거의 아무도 안 씀
          } else if (blogCount <= 500) {
            score = 45;
          } else if (blogCount <= 1000) {
            score = 40;
          } else if (blogCount <= 5000) {
            score = 35;
          } else if (blogCount <= 10000) {
            score = 25;
          } else if (blogCount <= 50000) {
            score = 15;
          } else if (blogCount <= 100000) {
            score = 5;
          }
          
          // 2. 검색량 기반 보너스 (수요 높을수록 좋음) - 최대 30점
          if (monthlySearchVolume >= 50000) {
            score += 30;
          } else if (monthlySearchVolume >= 10000) {
            score += 25;
          } else if (monthlySearchVolume >= 5000) {
            score += 20;
          } else if (monthlySearchVolume >= 1000) {
            score += 15;
          } else if (monthlySearchVolume >= 500) {
            score += 10;
          } else if (monthlySearchVolume >= 100) {
            score += 5;
          }
          
          // 3. 검색량/문서량 비율 보너스 (수요 대비 경쟁 낮을수록) - 최대 20점
          if (monthlySearchVolume > 0 && blogCount > 0) {
            const ratio = monthlySearchVolume / blogCount;
            if (ratio >= 10) score += 20;       // 검색 10배 > 문서
            else if (ratio >= 5) score += 15;
            else if (ratio >= 2) score += 10;
            else if (ratio >= 1) score += 5;
          }
          
          score = Math.min(100, score);
          
          // ✅ 수익형 상품 키워드 조건 (일반 키워드보다 기준 완화)
          // 쇼핑 상품은 검색량 100+만 되어도 가치 있음 (구매 의도 높음)
          const isGoodProduct = score >= 30 && (monthlySearchVolume >= 100 || blogCount <= 500);
          
          if (isGoodProduct) {
            if (!results.find(r => r.keyword === keyword)) {
              results.push({
                keyword,
                score: Math.round(score),
                searchVolume: monthlySearchVolume > 0 
                  ? `${monthlySearchVolume.toLocaleString()}회/월` 
                  : analysis.searchVolume,
                competition: blogCount > 0 
                  ? `${blogCount.toLocaleString()}개` 
                  : analysis.competition,
                reason: this.generateProductKeywordReason(keyword, monthlySearchVolume, blogCount, score),
              });
            }
          }
        } catch {
          // 개별 분석 실패 무시
        }
        
        // 충분한 결과가 모이면 중단
        if (results.length >= count * 2) break;
      }
      
      // 점수순 정렬
      results.sort((a, b) => b.score - a.score);
      
      console.log(`[KeywordAnalyzer] ✅ 쇼핑커넥트 수익형 상품 키워드 ${results.length}개 발견`);
      
      return results.slice(0, count);
    } catch (error) {
      console.error('[KeywordAnalyzer] 상품 키워드 발견 실패:', error);
      return [];
    }
  }

  // ✅ 수익형 상품 키워드 추천 이유 생성
  private generateProductKeywordReason(keyword: string, searchVolume: number, blogCount: number, score: number): string {
    const parts: string[] = [];
    
    if (blogCount <= 100) {
      parts.push('🔥 초저경쟁 (문서 100개 이하)');
    } else if (blogCount <= 1000) {
      parts.push('✅ 저경쟁 (문서 1,000개 이하)');
    } else if (blogCount <= 5000) {
      parts.push('📊 중저경쟁');
    }
    
    if (searchVolume >= 10000) {
      parts.push('🚀 고수요 (월 1만+)');
    } else if (searchVolume >= 1000) {
      parts.push('📈 수요 양호 (월 1천+)');
    } else if (searchVolume >= 100) {
      parts.push('💡 니치 수요');
    }
    
    if (searchVolume > 0 && blogCount > 0) {
      const ratio = Math.round(searchVolume / blogCount * 10) / 10;
      if (ratio >= 5) {
        parts.push(`⭐ 검색/문서 비율 ${ratio}배 (블루오션)`);
      }
    }
    
    if (score >= 80) {
      parts.push('💰 글만 써도 수익 보장');
    } else if (score >= 60) {
      parts.push('💵 높은 수익 가능성');
    }
    
    return parts.length > 0 ? parts.join(' | ') : '쇼핑커넥트 인기상품';
  }

  // ✅ 폴백: 일반 트렌드 키워드 기반 블루오션 (상품 크롤링 실패 시)
  private async discoverBlueOceanKeywordsFallback(count: number): Promise<BlueOceanKeyword[]> {
    const results: BlueOceanKeyword[] = [];
    const trendKeywords = await this.fetchTrendKeywords();
    
    for (const trendKw of trendKeywords.slice(0, 10)) {
      await sleep(500);
      try {
        const relatedKeywords = await this.fetchRelatedKeywords(trendKw);
        for (const keyword of relatedKeywords.slice(0, 5)) {
          await sleep(300);
          try {
            const analysis = await this.analyzeKeyword(keyword);
            let vol = 0;
            if (analysis.naverAdData) vol = analysis.naverAdData.monthlyPcQcCnt + analysis.naverAdData.monthlyMobileQcCnt;
            const bc = analysis.blogCount || 0;
            let s = 0;
            if (vol > 0) {
              if (bc <= 100) s = 60; else if (bc <= 500) s = 55; else if (bc <= 1000) s = 50; else if (bc <= 5000) s = 40; else if (bc <= 10000) s = 30; else if (bc <= 50000) s = 20; else s = 10;
              if (vol >= 10000) s += 30; else if (vol >= 5000) s += 25; else if (vol >= 1000) s += 20; else if (vol >= 500) s += 10;
              s = Math.min(100, s);
            }
            if (s >= 50 && vol >= 500 && bc <= 100000 && !results.find(r => r.keyword === keyword)) {
              results.push({ keyword, score: s, searchVolume: vol > 0 ? `${vol.toLocaleString()}회/월` : analysis.searchVolume, competition: bc > 0 ? `${bc.toLocaleString()}개` : analysis.competition, reason: this.generateBlueOceanReason(analysis, vol, bc) });
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
      if (results.length >= count * 2) break;
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, count);
  }

  // ✅ 식품/과자 아이템 필터
  private isFoodItem(name: string): boolean {
    const foodKeywords = [
      '떡', '과자', '쿠키', '초콜릿', '빵', '케이크', '젤리', '캔디', '사탕',
      '라면', '즉석', '간식', '음료', '우유', '커피믹스', '차류', '양념', '소스',
      '견과', '김', '반찬', '밀키트', '냉동', '통조림', '잼', '꿀', '식빵',
      '아이스크림', '젤라또', '마카롱', '도넛', '베이커리', '롯데웰푸드', '농심',
      '오리온', '해태', '크라운', '삼양', '풀무원', '비비고', '햇반'
    ];
    const lower = name.toLowerCase();
    return foodKeywords.some(fw => lower.includes(fw));
  }

  // ✅ 라이프스타일 상품 검색 쿼리 (나혼산/SNS 바이럴 상품류)
  private getLifestyleProductQueries(): string[] {
    const month = new Date().getMonth() + 1;
    
    // 계절별 핫 상품 쿼리
    const seasonalQueries: Record<string, string[]> = {
      spring: ['봄 가디건', '자외선차단제', '러닝화', '캠핑의자', '원피스'],
      summer: ['선풍기', '에어컨', '냉감이불', '수영복', '아이스메이커'],
      fall: ['가을자켓', '무선청소기', '커피머신', '담요', '가습기'],
      winter: ['전기요', '패딩', '핸드크림', '공기청정기', '어그부츠'],
    };
    
    const season = month >= 3 && month <= 5 ? 'spring' :
                   month >= 6 && month <= 8 ? 'summer' :
                   month >= 9 && month <= 11 ? 'fall' : 'winter';
    
    // 상시 인기 상품 카테고리
    const evergreen = [
      '에어프라이어', '무선청소기', '스팀다리미', '전동칫솔', '마사지건',
      '블루투스 이어폰', '스마트워치', '태블릿', '노트북 거치대', '모니터',
      '헤어드라이기', '안마의자', '로봇청소기', '공기청정기', '제습기',
      '커피머신', '전기포트', '믹서기', '식기세척기', '빔프로젝터',
      '러닝머신', '요가매트', '아령', '캠핑텐트', '캠핑체어',
      '향수 추천', '바디로션', '스킨케어', '선크림', '파운데이션',
      '골프웨어', '운동화 추천', '크로스백', '지갑 추천', '선글라스',
    ];
    
    return [...seasonalQueries[season], ...evergreen.sort(() => Math.random() - 0.5).slice(0, 10)];
  }

  // ✅ 네이버 쇼핑 검색으로 상품명 키워드 추출
  private async searchNaverShoppingProducts(query: string): Promise<string[]> {
    const keywords: string[] = [];
    try {
      const config = this.getAxiosConfig();
      const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}&sort=rel`;
      const response = await axios.get(url, {
        ...config,
        timeout: 10000,
      });
      
      const $ = cheerio.load(response.data);
      
      // 상품명 추출 (다양한 셀렉터)
      const selectors = [
        '[class*="basicList_title"]',
        '[class*="product_title"]',
        '[class*="adProduct_title"]',
        '.product_link',
      ];
      
      for (const sel of selectors) {
        $(sel).each((_: number, el: any) => {
          const name = $(el).text().trim();
          if (name && name.length >= 4 && name.length <= 30 && !this.isFoodItem(name)) {
            keywords.push(name);
          }
        });
        if (keywords.length >= 10) break;
      }
      
      // __NEXT_DATA__ 파싱 폴백
      if (keywords.length === 0) {
        const nextScript = $('script#__NEXT_DATA__').html();
        if (nextScript) {
          try {
            const data = JSON.parse(nextScript);
            const products = data?.props?.pageProps?.initialState?.products?.list || [];
            for (const p of products.slice(0, 15)) {
              const name = p?.item?.productTitle || '';
              if (name && name.length >= 4 && name.length <= 30 && !this.isFoodItem(name)) {
                keywords.push(name);
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
    return keywords;
  }

  // ✅ [2026-03-20] 네이버 트렌드 키워드 수집 (다각화 - 5개 소스)
  private async fetchTrendKeywords(): Promise<string[]> {
    const trendKeywords: string[] = [];
    
    try {
      // ✅ 병렬로 모든 소스에서 키워드 수집 (속도 최적화)
      const results = await Promise.allSettled([
        this.fetchGoogleTrendsKR(),          // 1. Google Trends 한국 RSS (가장 안정적)
        this.fetchNaverNewsHeadlines(),       // 2. 네이버 뉴스 헤드라인 키워드
        this.fetchNaverAutocompleteTrends(),  // 3. 네이버 자동완성 인기 키워드
        this.fetchShoppingTrends(),           // 4. 네이버 쇼핑 트렌드 (프록시로 CAPTCHA 우회)
      ]);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          trendKeywords.push(...result.value);
        }
      }

      console.log(`[KeywordAnalyzer] 소스별 수집 결과: Google=${(results[0] as any).value?.length || 0}, News=${(results[1] as any).value?.length || 0}, AC=${(results[2] as any).value?.length || 0}, Shop=${(results[3] as any).value?.length || 0}`);

      // 5. 확장된 시즌/계절 키워드 추가 (항상 포함)
      const seasonalKeywords = this.getSeasonalKeywords();
      trendKeywords.push(...seasonalKeywords);
      
      // 중복 제거 + 셔플
      const unique = [...new Set(trendKeywords)];
      // 랜덤 셔플 (Fisher-Yates)
      for (let i = unique.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unique[i], unique[j]] = [unique[j], unique[i]];
      }

      console.log(`[KeywordAnalyzer] ✅ 총 트렌드 키워드 ${unique.length}개 수집 (중복제거 후)`);
      return unique;
    } catch (error) {
      console.error('[KeywordAnalyzer] 트렌드 키워드 수집 실패:', error);
      return this.getSeasonalKeywords(); // 폴백: 시즌 키워드
    }
  }

  // ✅ [2026-03-20] 쇼핑커넥트 인기상품에서 키워드 추출 (BestProductCollector 연동)
  private async fetchShoppingTrends(): Promise<string[]> {
    try {
      // ✅ 네이버 쇼핑 인기상품 크롤링 (기존 bestProductCollector 활용)
      const categories = ['all', 'fashion', 'beauty', 'food', 'living'];
      const randomCat = categories[Math.floor(Math.random() * categories.length)];
      
      const result = await this.bestProductCollector.fetchNaverBest(randomCat, 20, false);
      
      if (result.success && result.products.length > 0) {
        // 상품명에서 핵심 키워드 추출
        const keywords: string[] = [];
        for (const product of result.products) {
          const name = product.name;
          if (!name || name.length < 3) continue;
          
          // 상품명 전체 추가
          if (name.length <= 20) {
            keywords.push(name);
          }
          
          // 핵심 단어 추출 (브랜드명, 상품 카테고리 등)
          const words = name.split(/[\s/\[\]()]+/).filter(w => w.length >= 2 && w.length <= 10);
          if (words.length >= 2) {
            keywords.push(words.slice(0, 3).join(' '));
          }
        }
        
        const unique = [...new Set(keywords)];
        console.log(`[KeywordAnalyzer] 🛒 쇼핑커넥트 인기상품 키워드 ${unique.length}개 수집 (카테고리: ${randomCat})`);
        return unique.slice(0, 25);
      }
      
      console.log('[KeywordAnalyzer] 쇼핑 인기상품 0개 — 프록시 크롤링 폴백');
      // 폴백: 프록시로 직접 크롤링
      return await this.fetchShoppingTrendsFallback();
    } catch (error) {
      console.warn('[KeywordAnalyzer] 쇼핑 키워드 수집 실패:', (error as Error).message);
      return [];
    }
  }

  // 쇼핑 트렌드 폴백 (프록시 직접 크롤링)
  private async fetchShoppingTrendsFallback(): Promise<string[]> {
    try {
      const axiosConfig = await this.getAxiosConfig();
      const response = await axios.get('https://search.shopping.naver.com/best/home', axiosConfig);
      const $ = cheerio.load(response.data);
      const keywords: string[] = [];
      $('a[href*="query="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/query=([^&]+)/);
        if (match) {
          const keyword = decodeURIComponent(match[1]).trim();
          if (keyword && keyword.length >= 2 && keyword.length <= 20) keywords.push(keyword);
        }
      });
      return keywords.slice(0, 20);
    } catch {
      return [];
    }
  }

  // ✅ [2026-03-20] Google Trends 한국 실시간 인기 검색어 (RSS — 가장 안정적)
  private async fetchGoogleTrendsKR(): Promise<string[]> {
    try {
      const response = await axios.get('https://trends.google.co.kr/trending/rss?geo=KR', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogBot/1.0)' },
      });
      
      const $ = cheerio.load(response.data, { xmlMode: true });
      const keywords: string[] = [];
      
      $('item title').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length >= 2 && text.length <= 30) {
          keywords.push(text);
        }
      });
      
      console.log(`[KeywordAnalyzer] 🌍 Google Trends KR ${keywords.length}개 수집`);
      return keywords.slice(0, 20);
    } catch (error) {
      console.warn('[KeywordAnalyzer] Google Trends RSS 실패:', (error as Error).message);
      return [];
    }
  }

  // ✅ [2026-03-20] 네이버 뉴스 헤드라인에서 키워드 추출
  private async fetchNaverNewsHeadlines(): Promise<string[]> {
    try {
      const axiosConfig = await this.getAxiosConfig();
      const response = await axios.get('https://news.naver.com/main/main.naver?mode=LSD&mid=shm&sid1=105', axiosConfig);
      
      const $ = cheerio.load(response.data);
      const keywords: string[] = [];
      
      // 뉴스 제목에서 키워드 추출
      $('a.cluster_text_headline, .sh_text_headline, .ranking_headline a, .rankingnews_name, a[class*="headline"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length >= 4) {
          // 제목에서 핵심 키워드 추출 (첫 2~4단어)
          const words = text.split(/[\s,…·"']+/).filter(w => w.length >= 2 && w.length <= 10);
          if (words.length >= 2) {
            keywords.push(words.slice(0, 3).join(' '));
          }
          if (words.length >= 1) {
            keywords.push(words[0]);
          }
        }
      });
      
      // 중복 제거 후 반환
      const unique = [...new Set(keywords)];
      console.log(`[KeywordAnalyzer] 📰 뉴스 헤드라인 키워드 ${unique.length}개 수집`);
      return unique.slice(0, 15);
    } catch (error) {
      console.warn('[KeywordAnalyzer] 뉴스 헤드라인 수집 실패:', (error as Error).message);
      return [];
    }
  }

  // ✅ [2026-03-20] 네이버 연관검색어 크롤링 (API 아닌 실제 검색 페이지 크롤링)
  private async fetchNaverAutocompleteTrends(): Promise<string[]> {
    try {
      const seeds = this.getAutocompletSeeds();
      const keywords: string[] = [];
      
      // 3개 시드 랜덤 선택하여 연관검색어 크롤링
      const shuffled = seeds.sort(() => Math.random() - 0.5).slice(0, 3);
      
      for (const seed of shuffled) {
        try {
          const axiosConfig = await this.getAxiosConfig();
          const response = await axios.get(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(seed)}`, axiosConfig);
          
          const $ = cheerio.load(response.data);
          
          // 연관 검색어 크롤링 (다양한 셀렉터)
          $('.related_srch .keyword, .fds-comps-keyword-chip, .fds-keyword-text').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length >= 2 && text.length <= 20 && text !== seed) {
              keywords.push(text);
            }
          });
          
          // 연관검색어 링크에서도 추출
          $('a[href*="query="]').each((_, el) => {
            const cls = $(el).attr('class') || '';
            const href = $(el).attr('href') || '';
            if (cls.includes('keyword') || cls.includes('relate') || cls.includes('chip') || href.includes('&oquery=')) {
              const text = $(el).text().trim();
              if (text && text.length >= 2 && text.length <= 20 && text !== seed) {
                keywords.push(text);
              }
            }
          });
          
          await sleep(300); // 요청 간격
        } catch {
          // 개별 실패 무시
        }
      }
      
      const unique = [...new Set(keywords)];
      console.log(`[KeywordAnalyzer] 🔍 연관검색어 크롤링 ${unique.length}개 수집`);
      return unique.slice(0, 20);
    } catch (error) {
      console.warn('[KeywordAnalyzer] 연관검색어 크롤링 실패:', (error as Error).message);
      return [];
    }
  }

  // ✅ 자동완성 시드 키워드 (다양한 카테고리에서 랜덤 선택)
  private getAutocompletSeeds(): string[] {
    const month = new Date().getMonth() + 1;
    const baseSeeds = [
      '추천', '인기', '맛집', '여행', '다이어트', '레시피', '리뷰',
      '꿀팁', '비교', '순위', '신상', '트렌드', '할인', '가성비',
      '방법', '효과', '후기', '정보', '가격', '종류',
    ];
    // 월별 시즌 시드 추가
    const monthSeeds: Record<number, string[]> = {
      1: ['새해', '겨울', '설날'], 2: ['발렌타인', '졸업', '봄'],
      3: ['벚꽃', '이사', '신학기'], 4: ['캠핑', '피크닉', '봄나들이'],
      5: ['어버이날', '어린이날', '여름'], 6: ['여름휴가', '에어컨', '장마'],
      7: ['휴가', '물놀이', '빙수'], 8: ['가을', '추석', '피서'],
      9: ['추석', '단풍', '가을여행'], 10: ['할로윈', '가을', '핫플'],
      11: ['블프', '김장', '패딩'], 12: ['크리스마스', '연말', '선물'],
    };
    return [...baseSeeds, ...(monthSeeds[month] || [])];
  }

  // ✅ [2026-03-20] 시즌/계절 키워드 (대폭 확장 + 랜덤 셔플)
  private getSeasonalKeywords(): string[] {
    const month = new Date().getMonth() + 1;
    
    // ✅ 월별 15개+ 키워드 (기존 5개에서 대폭 확장)
    const seasonalMap: Record<number, string[]> = {
      1: ['신년 다이어트', '새해 목표', '겨울 여행', '설날 선물', '스키장', '떡국 레시피', '새해 운세', '겨울 코디', '실내 운동', '가습기 추천', '연초 재테크', '세뱃돈 활용', '방학 체험', '겨울 핫초코', '홈트레이닝'],
      2: ['발렌타인데이', '입학 준비', '봄 신상', '꽃배달', '졸업 선물', '초콜릿 만들기', '봄 인테리어', '이직 준비', '봄 스킨케어', '졸업 여행', '학용품 추천', '봄 원피스', '면접 팁', '꽃 종류', '데이트 코스'],
      3: ['벚꽃 명소', '봄 나들이', '신학기', '이사 준비', '봄 인테리어', '미세먼지 대비', '원룸 꾸미기', '봄 등산', '화분 키우기', '봄 패션', '알레르기 예방', '졸업식 옷', '제주도 여행', '봄맞이 대청소', '피크닉 도시락'],
      4: ['봄 여행', '피크닉', '골프', '캠핑', '봄 패션', '텃밭 가꾸기', '바베큐', '자전거 추천', '봄 꽃 축제', '야외 활동', '샌드위치 레시피', '봄 향수', '아웃도어', '맥주 추천', '소풍 준비'],
      5: ['어버이날 선물', '어린이날', '가정의달', '야외 활동', '여름 준비', '카네이션', '가족 여행', '스승의날', '자외선 차단제', '여름 신발', '장미축제', '캠핑 장비', '에어컨 청소', '수박', '5월 축제'],
      6: ['여름 휴가', '에어컨', '선풍기', '제습기', '수영복', '장마 대비', '여름 맛집', '서핑', '물놀이', '썬크림', '다이어트 식단', '여름 이불', '아이스크림', '워터파크', '시원한 음료'],
      7: ['휴가지 추천', '물놀이', '여름 맛집', '시원한 음식', '빙수', '계곡', '바다 여행', '여름 캠핑', '냉면 맛집', '수영장', '여름 책', '삼계탕', '해외여행', '자외선 관리', '서울 핫플'],
      8: ['여름 세일', '가을 신상', '추석 선물', '캠핑', '피서지', '가을 패션', '추석 레시피', '입추', '초가을 여행', '개학 준비', '가을 인테리어', '다이어리', '가을 맥주', '서핑', '백패킹'],
      9: ['추석', '가을 여행', '단풍 명소', '환절기 건강', '가을 패션', '추석 음식', '가을 등산', '송편 만들기', '가을 캠핑', '명절 레시피', '가을 독서', '코스모스', '포도', '가을 운동', '피부관리'],
      10: ['할로윈', '가을 나들이', '핫플레이스', '가을 데이트', '단풍', '할로윈 코스튬', '가을 카페', '가을 축제', '핑크뮬리', '가을 코디', '독서의 달', '전시회', '와인', '가을 사진', '억새'],
      11: ['블랙프라이데이', '김장', '겨울 준비', '난방비', '패딩', '김장 레시피', '겨울 코디', '11월 여행', '가습기', '겨울 이불', '전기세 절약', '블프 세일', '핫딜', '온풍기', '겨울 간식'],
      12: ['크리스마스', '연말 선물', '송년회', '겨울 여행', '스키', '크리스마스 선물', '연말 파티', '겨울 맛집', '눈 오는 곳', '신년 계획', '연하장', '겨울왕국', '연말 공연', '크리스마스 케이크', '새해 여행'],
    };
    
    const keywords = seasonalMap[month] || ['맛집 추천', '여행', '다이어트', '인테리어', '재테크', '독서', '운동', '요리', '건강', '패션'];
    
    // ✅ 랜덤 셔플하여 매번 다른 순서 반환
    for (let i = keywords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keywords[i], keywords[j]] = [keywords[j], keywords[i]];
    }
    
    return keywords;
  }

  // ✅ 단일 카테고리 황금키워드 발견 (사용자 선택)
  async discoverGoldenKeywordsBySingleCategory(categoryId: string, count: number = 10): Promise<{
    success: boolean;
    category: { name: string; icon: string };
    keywords: Array<{
      keyword: string;
      score: number;
      searchVolume: number;
      blogCount: number;
      ratio: number;
      reason: string;
    }>;
  }> {
    // ✅ 네이버 블로그 전체 카테고리 (4개 대분류, 30개+ 소분류)
    const categoryMap: Record<string, { name: string; icon: string; seeds: string[] }> = {
      // 엔터테인먼트·예술
      literature: { name: '문학·책', icon: '📚', seeds: ['베스트셀러', '책 추천', '독서 리뷰', '신간 도서', '문학 작품', '독서법'] },
      movie: { name: '영화', icon: '🎬', seeds: ['영화 추천', '넷플릭스 추천', '영화 리뷰', '개봉 영화', 'OTT 추천', '영화 순위'] },
      art: { name: '미술·디자인', icon: '🎨', seeds: ['전시회 추천', '미술관', '그림 그리기', '디자인 트렌드', '일러스트', '캘리그라피'] },
      performance: { name: '공연·전시', icon: '🎭', seeds: ['뮤지컬 추천', '연극 추천', '콘서트 정보', '공연 티켓', '전시회', '페스티벌'] },
      music: { name: '음악', icon: '🎵', seeds: ['음악 추천', '플레이리스트', '노래 추천', '앨범 리뷰', '인디 음악', '클래식'] },
      drama: { name: '드라마', icon: '📺', seeds: ['드라마 추천', '드라마 리뷰', '넷플릭스 드라마', '한국 드라마', 'OTT 드라마', '드라마 순위'] },
      celebrity: { name: '스타·연예인', icon: '⭐', seeds: ['연예인 소식', '아이돌', '배우', '가수 정보', '팬덤', '엔터'] },
      cartoon: { name: '만화·애니', icon: '🎌', seeds: ['웹툰 추천', '애니 추천', '만화책', '일본 애니', '넷플릭스 애니', '웹툰 리뷰'] },
      broadcast: { name: '방송', icon: '📡', seeds: ['예능 추천', '방송 정보', 'TV 프로그램', '유튜브 추천', '팟캐스트', '라디오'] },
      
      // 생활·노하우·쇼핑
      daily: { name: '일상·생각', icon: '💭', seeds: ['일상 기록', '자기계발', '생각 정리', '에세이', '일기', '감성글'] },
      parenting: { name: '육아·결혼', icon: '👶', seeds: ['육아 꿀팁', '결혼 준비', '임신 정보', '신혼부부', '아기용품', '유아식'] },
      pet: { name: '반려동물', icon: '🐶', seeds: ['강아지 키우기', '고양이 키우기', '반려동물 용품', '펫푸드', '동물 병원', '펫 케어'] },
      photo: { name: '좋은글·이미지', icon: '🖼️', seeds: ['명언', '좋은 글귀', '감성 사진', '배경화면', '인용구', '힐링글'] },
      fashion: { name: '패션·미용', icon: '👗', seeds: ['패션 트렌드', '코디 추천', '뷰티 팁', '화장품 추천', '스킨케어', '헤어스타일'] },
      interior: { name: '인테리어·DIY', icon: '🏠', seeds: ['인테리어 팁', '홈데코', 'DIY', '가구 추천', '수납 정리', '리모델링'] },
      cooking: { name: '요리·레시피', icon: '🍳', seeds: ['레시피', '집밥', '요리 팁', '간단 요리', '밑반찬', '베이킹'] },
      product: { name: '상품리뷰', icon: '📦', seeds: ['제품 리뷰', '추천템', '가성비', '신제품', '쿠팡 추천', '올리브영'] },
      gardening: { name: '원예·재배', icon: '🌱', seeds: ['식물 키우기', '홈가드닝', '화분', '다육이', '텃밭 가꾸기', '베란다 정원'] },
      
      // 취미·여가·여행
      game: { name: '게임', icon: '🎮', seeds: ['게임 추천', '모바일 게임', 'PC 게임', '게임 공략', '신작 게임', '게임 리뷰'] },
      sports: { name: '스포츠', icon: '⚽', seeds: ['운동 추천', '헬스', '축구', '야구', '골프', '러닝'] },
      camera: { name: '사진', icon: '📷', seeds: ['사진 찍는법', '카메라 추천', '출사지', '포토스팟', '사진 보정', '인물 사진'] },
      car: { name: '자동차', icon: '🚗', seeds: ['자동차 추천', '신차 정보', '중고차', '차량 관리', '전기차', '드라이브'] },
      hobby: { name: '취미', icon: '🎯', seeds: ['취미 추천', '취미 생활', '핸드메이드', '악기 배우기', '보드게임', '퍼즐'] },
      domestic_travel: { name: '국내여행', icon: '🗺️', seeds: ['국내 여행지', '당일치기', '주말여행', '힐링 여행', '펜션 추천', '숙소 추천'] },
      world_travel: { name: '세계여행', icon: '✈️', seeds: ['해외여행', '여행 계획', '항공권', '호텔 추천', '유럽여행', '동남아여행'] },
      restaurant: { name: '맛집', icon: '🍽️', seeds: ['맛집 추천', '카페 추천', '맛집 리뷰', '핫플', '데이트 맛집', '브런치'] },
      
      // 지식·동향
      it: { name: 'IT·컴퓨터', icon: '💻', seeds: ['IT 트렌드', '앱 추천', '프로그래밍', '코딩', '개발', 'AI 활용'] },
      politics: { name: '사회·정치', icon: '📰', seeds: ['시사 이슈', '경제 뉴스', '정책 정보', '사회 문제', '트렌드', '이슈'] },
      health: { name: '건강·의학', icon: '🏥', seeds: ['건강 정보', '다이어트', '영양제', '운동법', '질병 예방', '건강식품'] },
      economy: { name: '비즈니스·경제', icon: '💼', seeds: ['경제 정보', '창업', '마케팅', '부업', '투자', '재테크'] },
      language: { name: '어학·외국어', icon: '🌍', seeds: ['영어 공부', '일본어', '중국어', '외국어 학습', '어학 앱', '언어 교환'] },
      education: { name: '교육·학문', icon: '🎓', seeds: ['교육 정보', '공부법', '자격증', '시험 준비', '학습법', '온라인 강의'] },
      realestate: { name: '부동산', icon: '🏢', seeds: ['부동산 정보', '아파트', '청약', '투자', '전세', '월세'] },
      selfdev: { name: '자기계발', icon: '📈', seeds: ['자기계발', '성공 습관', '목표 설정', '시간 관리', '독서', '마인드셋'] },
    };

    const category = categoryMap[categoryId] || categoryMap.shopping;
    const keywords: Array<{
      keyword: string;
      score: number;
      searchVolume: number;
      blogCount: number;
      ratio: number;
      reason: string;
    }> = [];

    console.log(`[KeywordAnalyzer] 🏆 ${category.icon} ${category.name} 황금키워드 발견 시작...`);

    // 모든 시드 키워드에서 연관 키워드 수집
    for (const seed of category.seeds) {
      await sleep(300);
      
      try {
        const relatedKeywords = await this.fetchRelatedKeywords(seed);
        console.log(`[KeywordAnalyzer] "${seed}" 연관 키워드 ${relatedKeywords.length}개 수집`);
        
        for (const keyword of relatedKeywords.slice(0, 5)) {
          await sleep(200);
          
          try {
            const analysis = await this.analyzeKeyword(keyword);
            
            let searchVolume = 0;
            if (analysis.naverAdData) {
              searchVolume = analysis.naverAdData.monthlyPcQcCnt + analysis.naverAdData.monthlyMobileQcCnt;
            }
            
            const blogCount = analysis.blogCount || 0;
            
            // ✅ 황금키워드 점수 계산 (검색량↑ 문서량↓) - 매우 완화된 조건
            let score = 0;
            let ratio = 0;
            
            if (searchVolume > 0) {
              ratio = blogCount > 0 ? searchVolume / blogCount : searchVolume;
              
              // 문서량 기반 점수 (낮을수록 높음) - 매우 완화
              if (blogCount <= 100) {
                score = 70; // 🔥 초황금
              } else if (blogCount <= 500) {
                score = 60;
              } else if (blogCount <= 1000) {
                score = 55;
              } else if (blogCount <= 5000) {
                score = 45;
              } else if (blogCount <= 10000) {
                score = 40;
              } else if (blogCount <= 50000) {
                score = 35;
              } else if (blogCount <= 100000) {
                score = 30;
              } else if (blogCount <= 500000) {
                score = 25;
              } else if (blogCount <= 1000000) {
                score = 20;
              } else {
                score = 15; // 문서량이 아무리 많아도 기본 점수 부여
              }
              
              // 검색량 기반 보너스 (높을수록 좋음)
              if (searchVolume >= 100000) {
                score += 30;
              } else if (searchVolume >= 50000) {
                score += 25;
              } else if (searchVolume >= 10000) {
                score += 20;
              } else if (searchVolume >= 5000) {
                score += 15;
              } else if (searchVolume >= 1000) {
                score += 10;
              } else if (searchVolume >= 500) {
                score += 8;
              } else if (searchVolume >= 100) {
                score += 5;
              } else if (searchVolume >= 10) {
                score += 3; // 아주 낮은 검색량도 포함
              }
              
              score = Math.min(100, score);
            }

            // ✅ 조건 매우 완화: 점수 15 이상, 검색량 10 이상
            if (score >= 15 && searchVolume >= 10) {
              // 중복 체크
              if (!keywords.find(k => k.keyword === keyword)) {
                keywords.push({
                  keyword,
                  score,
                  searchVolume,
                  blogCount,
                  ratio: Math.round(ratio * 100) / 100,
                  reason: this.generateBlueOceanReason(analysis, searchVolume, blogCount),
                });
              }
            }
          } catch {
            // 개별 키워드 분석 실패 무시
          }
        }
      } catch {
        // 연관 키워드 수집 실패 무시
      }
    }

    // 점수순 정렬
    keywords.sort((a, b) => b.score - a.score);

    console.log(`[KeywordAnalyzer] ✅ ${category.icon} ${category.name}: ${keywords.length}개 발견`);
    
    return {
      success: true,
      category: { name: category.name, icon: category.icon },
      keywords: keywords.slice(0, count),
    };
  }

  // ✅ 카테고리별 블루오션 황금키워드 발견 (전체 - 레거시)
  async discoverGoldenKeywordsByCategory(count: number = 5): Promise<{
    categories: Array<{
      name: string;
      icon: string;
      keywords: Array<{
        keyword: string;
        score: number;
        searchVolume: number;
        blogCount: number;
        ratio: number;
        reason: string;
      }>;
    }>;
  }> {
    const categoryConfig = [
      { name: '쇼핑/제품', icon: '🛒', seeds: ['신상품', '할인', '추천템', '인기상품', '가성비'] },
      { name: '맛집/음식', icon: '🍽️', seeds: ['맛집', '레시피', '카페', '디저트', '배달'] },
      { name: '여행/레저', icon: '✈️', seeds: ['여행지', '호텔', '펜션', '핫플', '데이트'] },
      { name: '건강/뷰티', icon: '💄', seeds: ['다이어트', '운동', '스킨케어', '헬스', '영양제'] },
      { name: '재테크/부업', icon: '💰', seeds: ['부업', '재테크', '투자', '주식', '부동산'] },
      { name: '육아/교육', icon: '👶', seeds: ['육아', '교육', '학원', '입시', '유아'] },
    ];

    const result: Array<{
      name: string;
      icon: string;
      keywords: Array<{
        keyword: string;
        score: number;
        searchVolume: number;
        blogCount: number;
        ratio: number;
        reason: string;
      }>;
    }> = [];

    console.log('[KeywordAnalyzer] 🏆 카테고리별 황금키워드 발견 시작...');

    for (const category of categoryConfig) {
      const categoryKeywords: Array<{
        keyword: string;
        score: number;
        searchVolume: number;
        blogCount: number;
        ratio: number;
        reason: string;
      }> = [];

      // 각 시드 키워드에서 연관 키워드 수집 및 분석
      for (const seed of category.seeds.slice(0, 2)) {
        await sleep(300);
        
        try {
          const relatedKeywords = await this.fetchRelatedKeywords(seed);
          
          for (const keyword of relatedKeywords.slice(0, 3)) {
            await sleep(200);
            
            try {
              const analysis = await this.analyzeKeyword(keyword);
              
              let searchVolume = 0;
              if (analysis.naverAdData) {
                searchVolume = analysis.naverAdData.monthlyPcQcCnt + analysis.naverAdData.monthlyMobileQcCnt;
              }
              
              const blogCount = analysis.blogCount || 0;
              
              // ✅ 황금키워드 점수 계산 (검색량↑ 문서량↓)
              // 핵심: 검색량은 높을수록, 문서량은 낮을수록 좋음
              let score = 0;
              let ratio = 0;
              
              if (searchVolume > 0) {
                ratio = blogCount > 0 ? searchVolume / blogCount : searchVolume;
                
                // 1. 문서량 기반 점수 (낮을수록 높음) - 최대 60점
                if (blogCount <= 100) {
                  score = 60; // 🔥 초황금: 문서량 100개 이하
                } else if (blogCount <= 500) {
                  score = 55;
                } else if (blogCount <= 1000) {
                  score = 50;
                } else if (blogCount <= 5000) {
                  score = 40;
                } else if (blogCount <= 10000) {
                  score = 30;
                } else if (blogCount <= 50000) {
                  score = 20;
                } else if (blogCount <= 100000) {
                  score = 10;
                } else {
                  score = 0; // 문서량 10만 이상은 제외
                }
                
                // 2. 검색량 기반 보너스 (높을수록 좋음) - 최대 40점
                if (searchVolume >= 100000) {
                  score += 40;
                } else if (searchVolume >= 50000) {
                  score += 35;
                } else if (searchVolume >= 10000) {
                  score += 30;
                } else if (searchVolume >= 5000) {
                  score += 25;
                } else if (searchVolume >= 1000) {
                  score += 20;
                } else if (searchVolume >= 500) {
                  score += 10;
                }
                
                score = Math.min(100, score);
              }

              // 점수 50 이상 + 문서량 10만 이하만 추가
              if (score >= 50 && searchVolume >= 500 && blogCount <= 100000) {
                // 중복 체크
                if (!categoryKeywords.find(k => k.keyword === keyword)) {
                  categoryKeywords.push({
                    keyword,
                    score,
                    searchVolume,
                    blogCount,
                    ratio: Math.round(ratio * 100) / 100,
                    reason: this.generateBlueOceanReason(analysis, searchVolume, blogCount),
                  });
                }
              }
            } catch {
              // 개별 키워드 분석 실패 무시
            }
          }
        } catch {
          // 연관 키워드 수집 실패 무시
        }
      }

      // 점수순 정렬
      categoryKeywords.sort((a, b) => b.score - a.score);

      result.push({
        name: category.name,
        icon: category.icon,
        keywords: categoryKeywords.slice(0, count),
      });

      console.log(`[KeywordAnalyzer] ${category.icon} ${category.name}: ${categoryKeywords.length}개 발견`);
    }

    console.log('[KeywordAnalyzer] ✅ 카테고리별 황금키워드 발견 완료');
    
    return { categories: result };
  }
}
