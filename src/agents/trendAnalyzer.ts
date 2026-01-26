/**
 * 실시간 트렌드 키워드 분석기
 * 네이버 API + 크롤링 조합으로 블루오션 키워드 발굴
 * 
 * ⚠️ 중요: 더미 데이터 절대 금지! 실제 데이터만 반환
 * ⚠️ 황금비율 = 검색량 높고 + 문서량 낮음 = 블루오션
 */

import * as cheerio from 'cheerio';
import * as crypto from 'crypto';

export interface TrendKeyword {
  keyword: string;
  searchVolume?: number;      // 월간 검색량 (PC + 모바일)
  documentCount?: number;     // 블로그 문서량
  goldenRatio?: number;       // 황금비율 (검색량/문서량, 높을수록 블루오션)
  trend?: 'rising' | 'hot' | 'stable';  // 트렌드 상태
  category?: string;          // 카테고리
  source?: string;            // 출처
  isBlueOcean?: boolean;      // 블루오션 여부 (황금비율 > 1)
}

export interface TrendResult {
  success: boolean;
  keywords: TrendKeyword[];
  message?: string;
  timestamp: string;
  dataSource: string[];       // 실제 데이터 출처 명시
}

class TrendAnalyzer {
  private cache: Map<string, { data: TrendResult; timestamp: number }> = new Map();
  private cacheTTL = 1000 * 60 * 5; // 5분 캐시 (더 신선한 데이터)

  // ═══════════════════════════════════════════════════════════════
  // 🔥 실시간 급상승 키워드 수집 (크롤링)
  // ═══════════════════════════════════════════════════════════════

  async getRealtimeTrends(): Promise<TrendResult> {
    const cacheKey = 'realtime_trends';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log('[TrendAnalyzer] 캐시된 실시간 트렌드 반환');
      return cached.data;
    }

    console.log('[TrendAnalyzer] 실시간 트렌드 수집 시작...');
    const keywords: TrendKeyword[] = [];
    const dataSources: string[] = [];
    const errors: string[] = [];

    try {
      // 1. 구글 트렌드 급상승 검색어 (가장 안정적)
      try {
        const googleTrends = await this.crawlGoogleTrends();
        if (googleTrends.length > 0) {
          keywords.push(...googleTrends);
          dataSources.push('Google Trends');
          console.log(`[TrendAnalyzer] ✅ 구글 트렌드 ${googleTrends.length}개 성공`);
        }
      } catch (e) {
        errors.push('Google Trends');
        console.warn('[TrendAnalyzer] ⚠️ 구글 트렌드 실패:', e);
      }

      // 2. 연예 뉴스 핫이슈
      try {
        const entertainmentTrends = await this.crawlEntertainmentNews();
        if (entertainmentTrends.length > 0) {
          keywords.push(...entertainmentTrends);
          dataSources.push('네이버 연예뉴스');
          console.log(`[TrendAnalyzer] ✅ 연예뉴스 ${entertainmentTrends.length}개 성공`);
        }
      } catch (e) {
        errors.push('네이버 연예뉴스');
        console.warn('[TrendAnalyzer] ⚠️ 연예뉴스 실패:', e);
      }

      // 3. 네이버 뉴스 핫토픽 (폴백)
      try {
        const newsTrends = await this.crawlNaverNewsHot();
        if (newsTrends.length > 0) {
          keywords.push(...newsTrends);
          dataSources.push('네이버 뉴스');
          console.log(`[TrendAnalyzer] ✅ 네이버 뉴스 ${newsTrends.length}개 성공`);
        }
      } catch (e) {
        errors.push('네이버 뉴스');
        console.warn('[TrendAnalyzer] ⚠️ 네이버 뉴스 실패:', e);
      }

      // 4. 네이버 실시간 검색어 (시그널)
      try {
        const naverTrends = await this.crawlNaverSignal();
        if (naverTrends.length > 0) {
          keywords.push(...naverTrends);
          dataSources.push('네이버 DataLab');
        }
      } catch (e) {
        console.warn('[TrendAnalyzer] ⚠️ 네이버 DataLab 실패:', e);
      }

      // ⚠️ 실제 수집된 키워드만 반환
      const uniqueKeywords = this.deduplicateKeywords(keywords);

      if (uniqueKeywords.length === 0) {
        console.warn('[TrendAnalyzer] ⚠️ 모든 소스에서 키워드 수집 실패');
        return {
          success: false,
          keywords: [],
          message: `트렌드 수집 실패: ${errors.join(', ')}. 네트워크 연결을 확인해주세요.`,
          timestamp: new Date().toISOString(),
          dataSource: []
        };
      }

      const result: TrendResult = {
        success: true,
        keywords: uniqueKeywords,
        timestamp: new Date().toISOString(),
        dataSource: dataSources
      };

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      console.log(`[TrendAnalyzer] ✅ ${result.keywords.length}개 실시간 트렌드 수집 완료 (출처: ${dataSources.join(', ')})`);

      return result;
    } catch (error) {
      console.error('[TrendAnalyzer] 실시간 트렌드 수집 실패:', error);
      return {
        success: false,
        keywords: [],
        message: (error as Error).message,
        timestamp: new Date().toISOString(),
        dataSource: []
      };
    }
  }

  // 네이버 뉴스 핫토픽 크롤링 (폴백용)
  private async crawlNaverNewsHot(): Promise<TrendKeyword[]> {
    try {
      const response = await fetch('https://news.naver.com/main/ranking/popularDay.naver', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) return [];

      const html = await response.text();
      const $ = cheerio.load(html);
      const keywords: TrendKeyword[] = [];

      // 인기 뉴스 제목에서 키워드 추출
      $('.rankingnews_name, .list_title, .rankingnews_list a').each((i, elem) => {
        if (i >= 20) return;
        const title = $(elem).text().trim();
        if (title && title.length > 2 && title.length < 50) {
          // 핵심 키워드 추출
          const names = title.match(/[가-힣]{2,6}/g);
          if (names) {
            names.slice(0, 2).forEach(name => {
              if (!keywords.find(k => k.keyword === name) && name.length >= 2) {
                keywords.push({
                  keyword: name,
                  trend: 'hot',
                  category: '뉴스',
                  source: '네이버 뉴스'
                });
              }
            });
          }
        }
      });

      return keywords.slice(0, 15);
    } catch (error) {
      console.warn('[TrendAnalyzer] 네이버 뉴스 크롤링 실패:', error);
      return [];
    }
  }

  // 네이버 시그널 (DataLab 인기 검색어)
  private async crawlNaverSignal(): Promise<TrendKeyword[]> {
    try {
      // 네이버 쇼핑 인사이트 인기 검색어 페이지
      const response = await fetch('https://datalab.naver.com/shoppingInsight/sCategory.naver', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.warn('[TrendAnalyzer] 네이버 DataLab 접근 실패');
        return [];
      }

      // 대안: 네이버 실시간 검색어 관련 API가 없으므로 
      // 인기 키워드를 수동으로 구성하거나 다른 소스 활용
      return [];
    } catch (error) {
      console.warn('[TrendAnalyzer] 네이버 시그널 크롤링 실패:', error);
      return [];
    }
  }

  // 구글 트렌드 급상승 검색어
  private async crawlGoogleTrends(): Promise<TrendKeyword[]> {
    try {
      const response = await fetch('https://trends.google.co.kr/trending/rss?geo=KR', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.warn('[TrendAnalyzer] 구글 트렌드 접근 실패');
        return [];
      }

      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      const keywords: TrendKeyword[] = [];

      $('item').each((i, elem) => {
        if (i >= 20) return; // 상위 20개만
        const title = $(elem).find('title').text().trim();
        if (title) {
          keywords.push({
            keyword: title,
            trend: 'rising',
            category: '급상승',
            source: 'Google Trends'
          });
        }
      });

      console.log(`[TrendAnalyzer] 구글 트렌드 ${keywords.length}개 수집`);
      return keywords;
    } catch (error) {
      console.warn('[TrendAnalyzer] 구글 트렌드 크롤링 실패:', error);
      return [];
    }
  }

  // 연예 뉴스 핫이슈
  private async crawlEntertainmentNews(): Promise<TrendKeyword[]> {
    try {
      // 네이버 연예 뉴스 인기 기사
      const response = await fetch('https://entertain.naver.com/ranking', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.warn('[TrendAnalyzer] 네이버 연예 뉴스 접근 실패');
        return [];
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const keywords: TrendKeyword[] = [];

      // 랭킹 기사 제목에서 키워드 추출
      $('.tit, .title, .news_tit, a[class*="title"]').each((i, elem) => {
        if (i >= 15) return;
        const title = $(elem).text().trim();
        if (title && title.length > 2 && title.length < 50) {
          // 핵심 키워드 추출 (따옴표 안의 내용, 인물명 등)
          const quoted = title.match(/"([^"]+)"|'([^']+)'|「([^」]+)」/);
          if (quoted) {
            keywords.push({
              keyword: quoted[1] || quoted[2] || quoted[3],
              trend: 'hot',
              category: '연예',
              source: '네이버 연예뉴스'
            });
          }

          // 한글 2-6글자 키워드 (인물명 가능성)
          const names = title.match(/[가-힣]{2,6}/g);
          if (names) {
            names.slice(0, 2).forEach(name => {
              if (!keywords.find(k => k.keyword === name)) {
                keywords.push({
                  keyword: name,
                  trend: 'hot',
                  category: '연예',
                  source: '네이버 연예뉴스'
                });
              }
            });
          }
        }
      });

      console.log(`[TrendAnalyzer] 연예 뉴스 ${keywords.length}개 키워드 수집`);
      return keywords;
    } catch (error) {
      console.warn('[TrendAnalyzer] 연예 뉴스 크롤링 실패:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 블루오션 키워드 분석 (네이버 API)
  // ═══════════════════════════════════════════════════════════════

  async analyzeBlueOceanKeywords(
    keywords: string[],
    naverClientId?: string,
    naverClientSecret?: string
  ): Promise<TrendKeyword[]> {
    if (!naverClientId || !naverClientSecret) {
      console.warn('[TrendAnalyzer] 네이버 API 키가 없어 문서량만 분석');
    }

    const results: TrendKeyword[] = [];

    for (const keyword of keywords.slice(0, 10)) { // 최대 10개
      try {
        // 문서량 조회 (네이버 검색 API)
        let documentCount = 0;
        if (naverClientId && naverClientSecret) {
          documentCount = await this.getDocumentCount(keyword, naverClientId, naverClientSecret);
        }

        // 🎯 황금비율 계산: 문서량이 적을수록 블루오션
        const goldenRatio = documentCount > 0 ? Math.round(10000 / documentCount * 100) / 100 : 100;
        const isBlueOcean = documentCount < 3000;

        results.push({
          keyword,
          documentCount,
          goldenRatio,
          isBlueOcean,
          trend: goldenRatio > 10 ? 'rising' : goldenRatio > 1 ? 'stable' : 'hot',
          source: '분석'
        });

        // API 요청 간 딜레이
        await new Promise(r => setTimeout(r, 100));
      } catch (error) {
        console.warn(`[TrendAnalyzer] ${keyword} 분석 실패:`, error);
      }
    }

    // 🎯 황금비율 높은 순 정렬
    return results.sort((a, b) => (b.goldenRatio || 0) - (a.goldenRatio || 0));
  }

  // 네이버 검색 API로 문서량 조회
  async getDocumentCount(
    keyword: string,
    clientId: string,
    clientSecret: string
  ): Promise<number> {
    try {
      const response = await fetch(
        `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=1`,
        {
          headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret
          }
        }
      );

      if (!response.ok) return 0;

      const data = await response.json();
      return data.total || 0;
    } catch {
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 네이버 광고 API로 검색량 조회
  // ═══════════════════════════════════════════════════════════════

  private generateNaverAdSignature(timestamp: string, method: string, uri: string, secretKey: string): string {
    const message = `${timestamp}.${method}.${uri}`;
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(message);
    return hmac.digest('base64');
  }

  private parseSearchCount(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.includes('<')) {
        const num = parseInt(value.replace(/[^0-9]/g, ''));
        return Math.max(1, num / 2);
      }
      if (value.includes('~')) {
        const parts = value.split('~').map((p: string) => parseInt(p.replace(/[^0-9]/g, '')));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return Math.round((parts[0] + parts[1]) / 2);
        }
      }
      const parsed = parseInt(value.replace(/[^0-9]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  async getSearchVolume(
    keyword: string,
    apiKey: string,
    secretKey: string,
    customerId: string
  ): Promise<number> {
    try {
      const timestamp = String(Date.now());
      const method = 'GET';
      const uri = '/keywordstool';
      const signature = this.generateNaverAdSignature(timestamp, method, uri, secretKey);

      // 🔧 키워드 정제: 공백 제거 (네이버 광고 API는 공백 없이 검색해야 함)
      const cleanKeyword = keyword
        .trim()
        .replace(/\s+/g, ''); // 공백만 제거

      if (!cleanKeyword || cleanKeyword.length < 2) {
        console.log(`[TrendAnalyzer] 키워드 너무 짧음: "${keyword}" → "${cleanKeyword}"`);
        return -1; // -1 = 조회 불가
      }

      console.log(`[TrendAnalyzer] 검색량 조회: "${keyword}" → "${cleanKeyword}"`);

      const response = await fetch(
        `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(cleanKeyword)}&showDetail=1`,
        {
          headers: {
            'X-Timestamp': timestamp,
            'X-API-KEY': apiKey,
            'X-Customer': customerId,
            'X-Signature': signature,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[TrendAnalyzer] 광고 API 오류 (${cleanKeyword}): ${response.status} - ${errorText.substring(0, 100)}`);
        return -1; // -1 = API 오류
      }

      const data = await response.json();

      if (data && data.keywordList && data.keywordList.length > 0) {
        // 정확히 일치하는 키워드 찾기
        const exactMatch = data.keywordList.find(
          (item: any) => item.relKeyword?.toLowerCase() === cleanKeyword.toLowerCase()
        );
        const keywordData = exactMatch || data.keywordList[0];

        const pcCount = this.parseSearchCount(keywordData.monthlyPcQcCnt);
        const mobileCount = this.parseSearchCount(keywordData.monthlyMobileQcCnt);

        const total = pcCount + mobileCount;
        console.log(`[TrendAnalyzer] ✅ 검색량 (${cleanKeyword}): PC ${pcCount} + 모바일 ${mobileCount} = ${total}`);
        return total;
      }

      return 0; // 검색량 0
    } catch (error) {
      console.warn(`[TrendAnalyzer] 검색량 조회 실패 (${keyword}):`, error);
      return -1; // -1 = 오류
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎯 통합 트렌드 분석 (실시간 + 블루오션)
  // ═══════════════════════════════════════════════════════════════

  async getSmartTrends(
    category?: string,
    naverClientId?: string,
    naverClientSecret?: string,
    naverAdApiKey?: string,
    naverAdSecretKey?: string,
    naverAdCustomerId?: string
  ): Promise<TrendResult> {
    console.log(`[TrendAnalyzer] 스마트 트렌드 분석 시작 (카테고리: ${category || '전체'})`);

    const dataSources: string[] = [];

    // 1. 실시간 트렌드 수집 (⚠️ 실제 데이터만!)
    const realtimeTrends = await this.getRealtimeTrends();

    // ⚠️ 실제 수집된 데이터가 없으면 빈 결과 반환 (더미 데이터 금지!)
    if (!realtimeTrends.success || realtimeTrends.keywords.length === 0) {
      console.warn('[TrendAnalyzer] ⚠️ 실시간 트렌드 데이터 없음 - 더미 데이터 사용 안함');
      return {
        success: false,
        keywords: [],
        message: '현재 실시간 트렌드 데이터를 수집할 수 없습니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
        dataSource: []
      };
    }

    dataSources.push(...(realtimeTrends.dataSource || []));

    // 2. 카테고리 필터링
    let filteredKeywords = realtimeTrends.keywords;
    if (category) {
      const catLower = category.toLowerCase();
      filteredKeywords = filteredKeywords.filter(k =>
        !k.category || k.category.toLowerCase().includes(catLower)
      );
    }

    // ⚠️ 필터링 후 키워드가 없으면 빈 결과 (더미 생성 안함!)
    if (filteredKeywords.length === 0) {
      console.warn('[TrendAnalyzer] ⚠️ 필터링 후 키워드 없음');
      return {
        success: true,
        keywords: [],
        message: `${category || '전체'} 카테고리에 해당하는 트렌드 키워드가 없습니다.`,
        timestamp: new Date().toISOString(),
        dataSource: dataSources
      };
    }

    // 3. 🎯 황금비율 분석 (검색량 + 문서량)
    const hasSearchApi = naverClientId && naverClientSecret;
    const hasAdApi = naverAdApiKey && naverAdSecretKey && naverAdCustomerId;

    if (hasSearchApi || hasAdApi) {
      console.log(`[TrendAnalyzer] 🎯 황금비율 분석 시작 (검색API: ${hasSearchApi ? '✅' : '❌'}, 광고API: ${hasAdApi ? '✅' : '❌'})`);

      if (hasSearchApi) dataSources.push('네이버 검색 API');
      if (hasAdApi) dataSources.push('네이버 광고 API');

      for (let i = 0; i < Math.min(filteredKeywords.length, 15); i++) {
        const k = filteredKeywords[i];
        try {
          // 📊 검색량 조회 (네이버 광고 API)
          if (hasAdApi) {
            const searchVol = await this.getSearchVolume(k.keyword, naverAdApiKey!, naverAdSecretKey!, naverAdCustomerId!);
            // -1 = 조회 불가/오류, 0 이상 = 실제 검색량
            if (searchVol >= 0) {
              k.searchVolume = searchVol;
              console.log(`   [${k.keyword}] 검색량: ${searchVol.toLocaleString()}`);
            } else {
              console.log(`   [${k.keyword}] 검색량: 조회 불가`);
              // searchVolume을 undefined로 유지 (조회 불가 표시)
            }
          }

          // 📄 문서량 조회 (네이버 검색 API)
          if (hasSearchApi) {
            const docCount = await this.getDocumentCount(k.keyword, naverClientId!, naverClientSecret!);
            k.documentCount = docCount;
            console.log(`   [${k.keyword}] 문서량: ${docCount.toLocaleString()}`);
          }

          // 🎯 황금비율 계산: 검색량 / 문서량 (높을수록 블루오션)
          if (k.searchVolume !== undefined && k.documentCount !== undefined && k.documentCount > 0) {
            // 진짜 황금비율 = 검색량 / 문서량
            k.goldenRatio = Math.round((k.searchVolume / k.documentCount) * 100) / 100;
            // 검색량 높고 + 문서량 낮음 = 블루오션
            k.isBlueOcean = k.goldenRatio >= 1 && k.documentCount < 5000;
          } else if (k.documentCount !== undefined) {
            // 검색량 없으면 문서량 기반으로 계산
            k.goldenRatio = k.documentCount > 0 ? Math.round(10000 / k.documentCount * 100) / 100 : 100;
            k.isBlueOcean = k.documentCount < 3000;
          } else if (k.searchVolume !== undefined && k.searchVolume > 0) {
            // 문서량 없으면 검색량만 표시
            k.goldenRatio = k.searchVolume > 1000 ? 10 : 5;
            k.isBlueOcean = true;
          }

          // API 요청 간 딜레이 (Rate Limit 방지)
          await new Promise(r => setTimeout(r, 200));
        } catch (error) {
          console.warn(`[TrendAnalyzer] ${k.keyword} 분석 실패:`, error);
        }
      }
    } else {
      console.warn('[TrendAnalyzer] ⚠️ 네이버 API 키 없음 - 황금비율 분석 불가');
    }

    // 4. 🏆 블루오션 키워드만 필터링 + 황금비율 높은 순 정렬
    const blueOceanKeywords = filteredKeywords
      .filter(k => k.isBlueOcean === true || (k.documentCount !== undefined && k.documentCount < 5000))
      .sort((a, b) => (b.goldenRatio || 0) - (a.goldenRatio || 0));

    // 블루오션이 없으면 전체 키워드 중 상위 반환 (황금비율 순)
    const finalKeywords = blueOceanKeywords.length > 0
      ? blueOceanKeywords
      : filteredKeywords.sort((a, b) => (b.goldenRatio || 0) - (a.goldenRatio || 0));

    console.log(`[TrendAnalyzer] ✅ 분석 완료: ${finalKeywords.length}개 키워드 (블루오션: ${blueOceanKeywords.length}개)`);

    return {
      success: true,
      keywords: finalKeywords.slice(0, 20),
      timestamp: new Date().toISOString(),
      dataSource: dataSources
    };
  }

  // 중복 키워드 제거
  private deduplicateKeywords(keywords: TrendKeyword[]): TrendKeyword[] {
    const seen = new Set<string>();
    return keywords.filter(k => {
      const key = k.keyword.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 트렌드 결과를 읽기 좋은 텍스트로 변환
  formatTrendResult(result: TrendResult): string {
    if (!result.success || result.keywords.length === 0) {
      return '현재 수집된 트렌드 키워드가 없습니다.';
    }

    let text = '## 🔥 실시간 트렌드 키워드\n\n';

    // 카테고리별 그룹화
    const byCategory: Record<string, TrendKeyword[]> = {};
    result.keywords.forEach(k => {
      const cat = k.category || '기타';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(k);
    });

    for (const [category, keywords] of Object.entries(byCategory)) {
      text += `### ${category}\n`;
      keywords.slice(0, 5).forEach((k, i) => {
        const badge = k.trend === 'rising' ? '📈' : k.trend === 'hot' ? '🔥' : '📊';
        const docInfo = k.documentCount ? ` (문서량: ${k.documentCount.toLocaleString()})` : '';
        text += `${i + 1}. ${badge} **${k.keyword}**${docInfo}\n`;
      });
      text += '\n';
    }

    text += `\n_마지막 업데이트: ${new Date(result.timestamp).toLocaleString('ko-KR')}_`;

    return text;
  }
}

export const trendAnalyzer = new TrendAnalyzer();
