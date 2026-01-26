import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

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

    // 2. 스크래핑 폴백
    try {
      const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 10000,
      });

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
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

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
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

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
          // 1. 검색량 500회 이상
          // 2. 문서량 10만 이하
          // 3. 점수 50 이상
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

  // ✅ 자동 블루오션 키워드 발견 (입력 없이 트렌드 기반)
  async discoverBlueOceanKeywords(count: number = 10): Promise<BlueOceanKeyword[]> {
    const results: BlueOceanKeyword[] = [];
    
    try {
      console.log('[KeywordAnalyzer] 🔍 자동 블루오션 키워드 발견 시작...');
      
      // 1. 네이버 실시간 트렌드 키워드 수집
      const trendKeywords = await this.fetchTrendKeywords();
      console.log(`[KeywordAnalyzer] 트렌드 키워드 ${trendKeywords.length}개 수집`);
      
      if (trendKeywords.length === 0) {
        console.log('[KeywordAnalyzer] 트렌드 키워드가 없습니다');
        return [];
      }
      
      // 2. 각 트렌드 키워드의 연관 키워드 수집 및 분석
      for (const trendKw of trendKeywords.slice(0, 10)) {
        await sleep(500); // API 부하 방지
        
        try {
          // 연관 키워드 수집
          const relatedKeywords = await this.fetchRelatedKeywords(trendKw);
          
          // 각 연관 키워드 분석
          for (const keyword of relatedKeywords.slice(0, 5)) {
            await sleep(300);
            
            try {
              const analysis = await this.analyzeKeyword(keyword);
              
              let monthlySearchVolume = 0;
              if (analysis.naverAdData) {
                monthlySearchVolume = analysis.naverAdData.monthlyPcQcCnt + analysis.naverAdData.monthlyMobileQcCnt;
              }
              
              const blogCount = analysis.blogCount || 0;
              
              // ✅ 황금키워드 점수 계산 (검색량↑ 문서량↓)
              let blueOceanScore = 0;
              
              if (monthlySearchVolume > 0) {
                // 1. 문서량 기반 점수 (낮을수록 높음) - 최대 60점
                if (blogCount <= 100) {
                  blueOceanScore = 60; // 🔥 초황금
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
                  blueOceanScore = 0;
                }
                
                // 2. 검색량 기반 보너스 - 최대 40점
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
              
              // 블루오션 조건: 검색량 500+, 문서량 10만 이하, 점수 50+
              const hasSearchVolume = monthlySearchVolume >= 500;
              const hasLowCompetition = blogCount <= 100000;
              const hasGoodScore = blueOceanScore >= 50;
              
              if (hasSearchVolume && hasLowCompetition && hasGoodScore) {
                // 중복 체크
                if (!results.find(r => r.keyword === keyword)) {
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
              }
            } catch (err) {
              // 개별 키워드 분석 실패는 무시
            }
          }
        } catch (err) {
          // 트렌드 키워드 분석 실패는 무시
        }
        
        // 충분한 결과가 모이면 중단
        if (results.length >= count * 2) break;
      }
      
      // 점수순 정렬
      results.sort((a, b) => b.score - a.score);
      
      console.log(`[KeywordAnalyzer] ✅ 자동 발견 블루오션 키워드 ${results.length}개`);
      
      return results.slice(0, count);
    } catch (error) {
      console.error('[KeywordAnalyzer] 자동 블루오션 키워드 발견 실패:', error);
      return [];
    }
  }

  // ✅ 네이버 트렌드 키워드 수집 (실시간 검색어 / 쇼핑 트렌드)
  private async fetchTrendKeywords(): Promise<string[]> {
    const trendKeywords: string[] = [];
    
    try {
      // 1. 네이버 쇼핑 트렌드 키워드 수집
      const shoppingTrends = await this.fetchShoppingTrends();
      trendKeywords.push(...shoppingTrends);
      
      // 2. 네이버 데이터랩 인기 검색어 수집
      const datalabTrends = await this.fetchDatalabTrends();
      trendKeywords.push(...datalabTrends);
      
      // 3. 시즌/계절 키워드 추가
      const seasonalKeywords = this.getSeasonalKeywords();
      trendKeywords.push(...seasonalKeywords);
      
      // 중복 제거
      return [...new Set(trendKeywords)];
    } catch (error) {
      console.error('[KeywordAnalyzer] 트렌드 키워드 수집 실패:', error);
      return this.getSeasonalKeywords(); // 폴백: 시즌 키워드
    }
  }

  // ✅ 네이버 쇼핑 트렌드 키워드
  private async fetchShoppingTrends(): Promise<string[]> {
    try {
      const response = await axios.get('https://search.shopping.naver.com/best/home', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000,
      });
      
      const $ = cheerio.load(response.data);
      const keywords: string[] = [];
      
      // 인기 검색어 추출
      $('a[href*="query="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/query=([^&]+)/);
        if (match) {
          const keyword = decodeURIComponent(match[1]).trim();
          if (keyword && keyword.length >= 2 && keyword.length <= 20) {
            keywords.push(keyword);
          }
        }
      });
      
      return keywords.slice(0, 20);
    } catch {
      return [];
    }
  }

  // ✅ 네이버 데이터랩 트렌드
  private async fetchDatalabTrends(): Promise<string[]> {
    try {
      const response = await axios.get('https://datalab.naver.com/shoppingInsight/sCategory.naver', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000,
      });
      
      const $ = cheerio.load(response.data);
      const keywords: string[] = [];
      
      // 인기 카테고리/키워드 추출
      $('.keyword_rank a, .rank_list a').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length >= 2 && text.length <= 20) {
          keywords.push(text);
        }
      });
      
      return keywords.slice(0, 20);
    } catch {
      return [];
    }
  }

  // ✅ 시즌/계절 키워드 (폴백용)
  private getSeasonalKeywords(): string[] {
    const month = new Date().getMonth() + 1;
    
    // 계절별 인기 키워드
    const seasonalMap: Record<number, string[]> = {
      1: ['신년 다이어트', '새해 목표', '겨울 여행', '설날 선물', '스키장'],
      2: ['발렌타인데이', '입학 준비', '봄 신상', '꽃배달', '졸업 선물'],
      3: ['벚꽃 명소', '봄 나들이', '신학기', '이사 준비', '봄 인테리어'],
      4: ['봄 여행', '피크닉', '골프', '캠핑', '봄 패션'],
      5: ['어버이날 선물', '어린이날', '가정의달', '야외 활동', '여름 준비'],
      6: ['여름 휴가', '에어컨', '선풍기', '제습기', '수영복'],
      7: ['휴가지 추천', '물놀이', '여름 맛집', '시원한 음식', '빙수'],
      8: ['여름 세일', '가을 신상', '추석 선물', '캠핑', '피서지'],
      9: ['추석', '가을 여행', '단풍 명소', '환절기 건강', '가을 패션'],
      10: ['할로윈', '가을 나들이', '핫플레이스', '가을 데이트', '단풍'],
      11: ['블랙프라이데이', '김장', '겨울 준비', '난방비', '패딩'],
      12: ['크리스마스', '연말 선물', '송년회', '겨울 여행', '스키'],
    };
    
    return seasonalMap[month] || ['맛집 추천', '여행', '다이어트', '인테리어', '재테크'];
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
