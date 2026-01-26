import { EventEmitter } from 'events';

// ✅ 예약 발행 아이템 타입
export type ScheduledPost = {
  id: string;
  title: string;
  keyword: string;
  scheduledAt: string; // ISO 날짜 문자열
  status: 'pending' | 'publishing' | 'completed' | 'failed';
  createdAt: string;
  publishedUrl?: string;
  error?: string;
};

// ✅ 최적 발행 시간대 (네이버 블로그 기준)
export const OPTIMAL_PUBLISH_TIMES = {
  // 평일 최적 시간대
  weekday: [
    { hour: 7, minute: 0, score: 85, description: '출근 전 검색 피크' },
    { hour: 8, minute: 30, score: 90, description: '출근길 검색 피크' },
    { hour: 12, minute: 0, score: 95, description: '점심시간 검색 최고조' },
    { hour: 12, minute: 30, score: 92, description: '점심시간 검색' },
    { hour: 18, minute: 0, score: 88, description: '퇴근 시간' },
    { hour: 19, minute: 30, score: 90, description: '저녁 시간 검색 피크' },
    { hour: 21, minute: 0, score: 85, description: '저녁 휴식 시간' },
  ],
  // 주말 최적 시간대
  weekend: [
    { hour: 9, minute: 0, score: 80, description: '주말 아침' },
    { hour: 10, minute: 30, score: 88, description: '주말 오전 피크' },
    { hour: 14, minute: 0, score: 85, description: '주말 오후' },
    { hour: 16, minute: 0, score: 82, description: '주말 오후 후반' },
    { hour: 20, minute: 0, score: 90, description: '주말 저녁 피크' },
    { hour: 21, minute: 30, score: 87, description: '주말 저녁' },
  ],
};

// ✅ 카테고리별 최적 시간 조정
export const CATEGORY_TIME_ADJUSTMENTS: Record<string, { preferredHours: number[]; boost: number }> = {
  'news': { preferredHours: [7, 8, 12, 18, 19], boost: 10 }, // 뉴스는 빠른 시간대
  'entertainment': { preferredHours: [12, 19, 20, 21], boost: 8 }, // 연예는 점심/저녁
  'sports': { preferredHours: [7, 12, 19, 21], boost: 8 }, // 스포츠는 경기 전후
  'tech': { preferredHours: [9, 10, 14, 15], boost: 5 }, // IT는 업무 시간
  'lifestyle': { preferredHours: [10, 14, 20, 21], boost: 5 }, // 라이프스타일은 여유 시간
  'food': { preferredHours: [11, 12, 17, 18], boost: 10 }, // 음식은 식사 전
};

export class SmartScheduler extends EventEmitter {
  private scheduledPosts: Map<string, ScheduledPost> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private publishCallback: ((post: ScheduledPost) => Promise<string | null>) | null = null;

  constructor() {
    super();
    this.loadFromStorage();
  }

  // ✅ 발행 콜백 설정
  setPublishCallback(callback: (post: ScheduledPost) => Promise<string | null>): void {
    this.publishCallback = callback;
  }

  // ✅ 로컬 스토리지에서 데이터 로드
  private loadFromStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const dataPath = path.join(app.getPath('userData'), 'scheduled-posts.json');
      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.scheduledPosts = new Map(Object.entries(data.posts || {}));
        
        // 대기 중인 예약 발행 타이머 재설정
        this.restoreTimers();
      }
    } catch (error) {
      console.log('[SmartScheduler] 저장된 데이터 없음, 새로 시작');
    }
  }

  // ✅ 로컬 스토리지에 데이터 저장
  private saveToStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const dataPath = path.join(app.getPath('userData'), 'scheduled-posts.json');
      const data = {
        posts: Object.fromEntries(this.scheduledPosts),
        lastSaved: new Date().toISOString(),
      };
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SmartScheduler] 저장 실패:', error);
    }
  }

  // ✅ 타이머 복원
  private restoreTimers(): void {
    for (const [id, post] of this.scheduledPosts) {
      if (post.status === 'pending') {
        const scheduledTime = new Date(post.scheduledAt).getTime();
        const now = Date.now();
        
        if (scheduledTime > now) {
          this.setTimer(id, scheduledTime - now);
        } else {
          // 이미 지난 시간이면 즉시 발행
          this.executePublish(id);
        }
      }
    }
  }

  // ✅ 타이머 설정
  private setTimer(postId: string, delay: number): void {
    // 기존 타이머 제거
    if (this.timers.has(postId)) {
      clearTimeout(this.timers.get(postId)!);
    }
    
    const timer = setTimeout(() => {
      this.executePublish(postId);
    }, delay);
    
    this.timers.set(postId, timer);
  }

  // ✅ 발행 실행
  private async executePublish(postId: string): Promise<void> {
    const post = this.scheduledPosts.get(postId);
    if (!post || post.status !== 'pending') return;
    
    post.status = 'publishing';
    this.scheduledPosts.set(postId, post);
    this.saveToStorage();
    
    console.log(`[SmartScheduler] 예약 발행 실행: ${post.title}`);
    this.emit('publishing', post);
    
    try {
      if (this.publishCallback) {
        const publishedUrl = await this.publishCallback(post);
        
        if (publishedUrl) {
          post.status = 'completed';
          post.publishedUrl = publishedUrl;
          console.log(`[SmartScheduler] 발행 완료: ${publishedUrl}`);
        } else {
          post.status = 'failed';
          post.error = '발행 URL을 받지 못했습니다.';
        }
      } else {
        post.status = 'failed';
        post.error = '발행 콜백이 설정되지 않았습니다.';
      }
    } catch (error) {
      post.status = 'failed';
      post.error = (error as Error).message;
      console.error(`[SmartScheduler] 발행 실패:`, error);
    }
    
    this.scheduledPosts.set(postId, post);
    this.saveToStorage();
    this.timers.delete(postId);
    
    this.emit('completed', post);
  }

  // ✅ 최적 발행 시간 계산
  getOptimalPublishTime(category?: string, preferredDate?: Date): Date {
    const now = new Date();
    const targetDate = preferredDate || now;
    const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
    
    // 기본 최적 시간대
    const baseTimes = isWeekend ? OPTIMAL_PUBLISH_TIMES.weekend : OPTIMAL_PUBLISH_TIMES.weekday;
    
    // 카테고리별 조정
    const categoryAdjust = category ? CATEGORY_TIME_ADJUSTMENTS[category] : null;
    
    // 점수 계산
    const scoredTimes = baseTimes.map(time => {
      let score = time.score;
      
      // 카테고리 보너스
      if (categoryAdjust && categoryAdjust.preferredHours.includes(time.hour)) {
        score += categoryAdjust.boost;
      }
      
      // 현재 시간 이후인지 확인
      const targetTime = new Date(targetDate);
      targetTime.setHours(time.hour, time.minute, 0, 0);
      
      if (targetTime <= now) {
        // 오늘 이미 지난 시간이면 내일로
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      return { ...time, score, targetTime };
    });
    
    // 가장 높은 점수의 시간 선택
    scoredTimes.sort((a, b) => b.score - a.score);
    
    return scoredTimes[0].targetTime;
  }

  // ✅ 다음 최적 시간들 가져오기 (여러 개)
  getNextOptimalTimes(count: number = 5, category?: string): Array<{ time: Date; score: number; description: string }> {
    const now = new Date();
    const results: Array<{ time: Date; score: number; description: string }> = [];
    
    // 오늘과 내일의 시간대 확인
    for (let dayOffset = 0; dayOffset < 3 && results.length < count; dayOffset++) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + dayOffset);
      
      const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
      const baseTimes = isWeekend ? OPTIMAL_PUBLISH_TIMES.weekend : OPTIMAL_PUBLISH_TIMES.weekday;
      const categoryAdjust = category ? CATEGORY_TIME_ADJUSTMENTS[category] : null;
      
      for (const time of baseTimes) {
        const targetTime = new Date(targetDate);
        targetTime.setHours(time.hour, time.minute, 0, 0);
        
        if (targetTime <= now) continue;
        
        let score = time.score;
        if (categoryAdjust && categoryAdjust.preferredHours.includes(time.hour)) {
          score += categoryAdjust.boost;
        }
        
        results.push({
          time: targetTime,
          score,
          description: time.description,
        });
      }
    }
    
    // 점수순 정렬 후 상위 N개 반환
    return results.sort((a, b) => b.score - a.score).slice(0, count);
  }

  // ✅ 예약 발행 추가
  schedulePost(title: string, keyword: string, scheduledAt: Date | string): ScheduledPost {
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const scheduledTime = typeof scheduledAt === 'string' ? new Date(scheduledAt) : scheduledAt;
    
    const post: ScheduledPost = {
      id,
      title,
      keyword,
      scheduledAt: scheduledTime.toISOString(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    this.scheduledPosts.set(id, post);
    this.saveToStorage();
    
    // 타이머 설정
    const delay = scheduledTime.getTime() - Date.now();
    if (delay > 0) {
      this.setTimer(id, delay);
      console.log(`[SmartScheduler] 예약 발행 등록: ${title} (${scheduledTime.toLocaleString()})`);
    } else {
      // 이미 지난 시간이면 즉시 발행
      this.executePublish(id);
    }
    
    this.emit('scheduled', post);
    return post;
  }

  // ✅ 최적 시간에 자동 예약
  scheduleAtOptimalTime(title: string, keyword: string, category?: string): ScheduledPost {
    const optimalTime = this.getOptimalPublishTime(category);
    return this.schedulePost(title, keyword, optimalTime);
  }

  // ✅ 예약 취소
  cancelSchedule(postId: string): boolean {
    const post = this.scheduledPosts.get(postId);
    if (!post || post.status !== 'pending') return false;
    
    // 타이머 제거
    if (this.timers.has(postId)) {
      clearTimeout(this.timers.get(postId)!);
      this.timers.delete(postId);
    }
    
    this.scheduledPosts.delete(postId);
    this.saveToStorage();
    
    console.log(`[SmartScheduler] 예약 취소: ${post.title}`);
    this.emit('cancelled', post);
    return true;
  }

  // ✅ 모든 예약 가져오기
  getAllScheduled(): ScheduledPost[] {
    return Array.from(this.scheduledPosts.values())
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  // ✅ 대기 중인 예약만 가져오기
  getPendingScheduled(): ScheduledPost[] {
    return this.getAllScheduled().filter(p => p.status === 'pending');
  }

  // ✅ 특정 예약 가져오기
  getScheduledPost(postId: string): ScheduledPost | undefined {
    return this.scheduledPosts.get(postId);
  }

  // ✅ 예약 시간 변경 (pending 또는 failed 상태 모두 가능)
  reschedule(postId: string, newTime: Date | string): boolean {
    const post = this.scheduledPosts.get(postId);
    // pending 또는 failed 상태만 재스케줄 가능
    if (!post || (post.status !== 'pending' && post.status !== 'failed')) return false;
    
    const newScheduledTime = typeof newTime === 'string' ? new Date(newTime) : newTime;
    post.scheduledAt = newScheduledTime.toISOString();
    post.status = 'pending'; // 상태를 pending으로 변경 (failed에서 복구)
    post.error = undefined; // 에러 메시지 초기화
    
    this.scheduledPosts.set(postId, post);
    this.saveToStorage();
    
    // 타이머 재설정
    const delay = newScheduledTime.getTime() - Date.now();
    if (delay > 0) {
      this.setTimer(postId, delay);
    }
    
    console.log(`[SmartScheduler] 예약 시간 변경: ${post.title} -> ${newScheduledTime.toLocaleString()}`);
    this.emit('rescheduled', post);
    return true;
  }

  // ✅ 모든 예약 취소
  cancelAll(): void {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    for (const [id, post] of this.scheduledPosts) {
      if (post.status === 'pending') {
        this.scheduledPosts.delete(id);
      }
    }
    
    this.saveToStorage();
    console.log('[SmartScheduler] 모든 예약 취소됨');
  }

  // ✅ 통계 가져오기
  getStats(): { pending: number; completed: number; failed: number; total: number } {
    const posts = Array.from(this.scheduledPosts.values());
    return {
      pending: posts.filter(p => p.status === 'pending').length,
      completed: posts.filter(p => p.status === 'completed').length,
      failed: posts.filter(p => p.status === 'failed').length,
      total: posts.length,
    };
  }
}
