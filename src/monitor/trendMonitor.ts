import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

type HotKeyword = {
  text: string;
  velocity: number;
  rank?: number;
  category?: string;
};

// ✅ 트렌드 알림 이벤트 타입
export type TrendAlertEvent = {
  type: 'breaking' | 'rising' | 'new';
  keyword: string;
  velocity: number;
  rank: number;
  category?: string;
  detectedAt: string;
  suggestion: string;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class TrendMonitor extends EventEmitter {
  private redisClient: RedisClientType | null = null;
  private stopRequested = false;
  private readonly seenKeywords = new Set<string>();
  private readonly keywordHistory: Map<string, number[]> = new Map(); // 키워드별 순위 히스토리
  private alertCallback: ((alert: TrendAlertEvent) => void) | null = null;
  private monitorInterval: number = 60_000; // 기본 1분
  private isMonitoring: boolean = false;

  // ✅ 알림 콜백 설정 (Electron 메인 프로세스에서 사용)
  setAlertCallback(callback: (alert: TrendAlertEvent) => void): void {
    this.alertCallback = callback;
  }

  // ✅ 모니터링 간격 설정 (밀리초)
  setMonitorInterval(ms: number): void {
    this.monitorInterval = Math.max(30_000, ms); // 최소 30초
  }

  // ✅ 모니터링 상태 확인
  getIsMonitoring(): boolean {
    return this.isMonitoring;
  }

  // ✅ 현재 트렌드 키워드 즉시 가져오기
  async getCurrentTrends(): Promise<HotKeyword[]> {
    return this.fetchHotKeywords();
  }

  async monitorRealtime(): Promise<void> {
    this.stopRequested = false;
    this.isMonitoring = true;
    this.log('👀 실시간 트렌드 모니터링 시작');
    await this.ensureRedis();

    while (!this.stopRequested) {
      try {
        const keywords = await this.fetchHotKeywords();
        
        for (const keyword of keywords) {
          // 순위 히스토리 업데이트
          const history = this.keywordHistory.get(keyword.text) || [];
          history.push(keyword.rank || 0);
          if (history.length > 10) history.shift(); // 최근 10개만 유지
          this.keywordHistory.set(keyword.text, history);
          
          if (await this.alreadyCovered(keyword.text)) {
            continue;
          }
          
          // ✅ 급상승 키워드 감지 (velocity 기반 + 순위 상승 기반)
          const isBreaking = keyword.velocity > 1000;
          const isRising = this.isRapidlyRising(keyword.text);
          const isNew = history.length === 1 && (keyword.rank || 20) <= 10;
          
          if (isBreaking || isRising || isNew) {
            const alertType = isBreaking ? 'breaking' : (isRising ? 'rising' : 'new');
            const alert: TrendAlertEvent = {
              type: alertType,
              keyword: keyword.text,
              velocity: keyword.velocity,
              rank: keyword.rank || 0,
              category: keyword.category,
              detectedAt: new Date().toISOString(),
              suggestion: this.generateSuggestion(keyword, alertType),
            };
            
            this.log(`🔥 ${alertType === 'breaking' ? '급상승' : alertType === 'rising' ? '상승중' : '신규'} 키워드 감지: ${keyword.text} (순위: ${keyword.rank}, 속도: ${keyword.velocity})`);
            
            // 이벤트 발생
            this.emit('trendAlert', alert);
            
            // 콜백 호출
            if (this.alertCallback) {
              this.alertCallback(alert);
            }
            
            await this.addToUrgentQueue({
              ...alert,
              priority: alertType,
            });
            this.seenKeywords.add(keyword.text);
          }
        }

        await sleep(this.monitorInterval);
      } catch (error) {
        this.log(`⚠️ 모니터링 오류: ${(error as Error).message}`);
        await sleep(300_000);
      }
    }
    this.isMonitoring = false;
  }

  // ✅ 급상승 여부 판단 (순위 히스토리 기반)
  private isRapidlyRising(keyword: string): boolean {
    const history = this.keywordHistory.get(keyword);
    if (!history || history.length < 3) return false;
    
    // 최근 3개 순위가 계속 상승 중인지 확인
    const recent = history.slice(-3);
    return recent[0] > recent[1] && recent[1] > recent[2];
  }

  // ✅ 발행 제안 생성
  private generateSuggestion(keyword: HotKeyword, alertType: string): string {
    if (alertType === 'breaking') {
      return `🚨 지금 바로 "${keyword.text}" 관련 글을 발행하세요! 검색량이 폭발적으로 증가 중입니다.`;
    } else if (alertType === 'rising') {
      return `📈 "${keyword.text}" 키워드가 빠르게 상승 중입니다. 30분 내 발행을 권장합니다.`;
    } else {
      return `✨ "${keyword.text}" 새로운 트렌드 키워드입니다. 선점 발행으로 상위 노출을 노려보세요!`;
    }
  }

  stop(): void {
    this.stopRequested = true;
  }

  private async ensureRedis(): Promise<void> {
    if (this.redisClient || !process.env.REDIS_URL) {
      return;
    }
    this.redisClient = createClient({ url: process.env.REDIS_URL });
    this.redisClient.on('error', (err) => this.log(`Redis error: ${err.message}`));
    await this.redisClient.connect().catch((error) => {
      this.log(`⚠️ Redis 연결 실패: ${(error as Error).message}`);
      this.redisClient = null;
    });
  }

  private async fetchHotKeywords(): Promise<HotKeyword[]> {
    try {
      // ✅ 네이버 실시간 검색어 (데이터랩)
      const response = await axios.get('https://datalab.naver.com/keyword/realtimeList.naver', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });
      const $ = cheerio.load(response.data);
      const results: HotKeyword[] = [];
      
      $('.item_area .item_title').each((index, element) => {
        const text = $(element).text().trim();
        if (!text) return;
        
        // ✅ 순위 기반 velocity 계산 (상위일수록 높음)
        const rank = index + 1;
        const baseVelocity = Math.max(100, 2000 - (rank * 80));
        const velocity = baseVelocity + Math.floor(Math.random() * 300);
        
        results.push({ 
          text, 
          velocity,
          rank,
          category: this.detectCategory(text),
        });
      });
      
      return results.slice(0, 20);
    } catch (error) {
      this.log(`⚠️ 급상승 키워드를 가져오지 못했습니다: ${(error as Error).message}`);
      
      // ✅ 폴백: 네이버 뉴스 인기 검색어 시도
      try {
        return await this.fetchNaverNewsKeywords();
      } catch {
        return [];
      }
    }
  }

  // ✅ 네이버 뉴스 인기 검색어 (폴백)
  private async fetchNaverNewsKeywords(): Promise<HotKeyword[]> {
    try {
      const response = await axios.get('https://news.naver.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });
      const $ = cheerio.load(response.data);
      const results: HotKeyword[] = [];
      
      // 뉴스 헤드라인에서 키워드 추출
      $('a.cjs_t').each((index, element) => {
        const text = $(element).text().trim();
        if (text && text.length > 2 && text.length < 30) {
          results.push({
            text,
            velocity: 1000 - (index * 50),
            rank: index + 1,
            category: 'news',
          });
        }
      });
      
      return results.slice(0, 10);
    } catch {
      return [];
    }
  }

  // ✅ 키워드 카테고리 자동 감지
  private detectCategory(keyword: string): string {
    const categories: Record<string, string[]> = {
      'entertainment': ['배우', '가수', '아이돌', '드라마', '영화', '예능', '콘서트', '앨범'],
      'sports': ['축구', '야구', '농구', '배구', '골프', '테니스', '경기', '선수', '감독', '승리', '패배'],
      'politics': ['대통령', '국회', '정부', '장관', '의원', '선거', '정책', '법안'],
      'economy': ['주식', '코스피', '환율', '금리', '부동산', '투자', '경제', '기업'],
      'tech': ['AI', '인공지능', '스마트폰', '앱', '게임', '출시', '업데이트'],
      'social': ['사건', '사고', '날씨', '태풍', '지진', '화재', '교통'],
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => keyword.includes(kw))) {
        return category;
      }
    }
    return 'general';
  }

  private async alreadyCovered(keyword: string): Promise<boolean> {
    if (this.seenKeywords.has(keyword)) {
      return true;
    }
    if (!this.redisClient) {
      return false;
    }
    const key = `covered:${keyword}`;
    const exists = await this.redisClient.exists(key);
    if (exists) {
      return true;
    }
    await this.redisClient.set(key, '1', { EX: 60 * 60 * 6 });
    return false;
  }

  private async addToUrgentQueue(item: Record<string, unknown>): Promise<void> {
    if (!this.redisClient) {
      this.log(`⚡ 긴급 큐 (로컬 로그) => ${JSON.stringify(item)}`);
      return;
    }
    await this.redisClient.lPush('urgent:keywords', JSON.stringify(item));
  }

  private log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(message);
  }
}









