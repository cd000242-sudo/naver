import axios from 'axios';
import * as cheerio from 'cheerio';
import { EventEmitter } from 'events';

// ✅ 발행된 글 성과 데이터 타입
export type PostPerformance = {
  postId: string;
  url: string;
  title: string;
  publishedAt: string;
  lastCheckedAt: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  history: Array<{
    checkedAt: string;
    views: number;
    likes: number;
    comments: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  score: number; // 종합 점수 (0-100)
};

// ✅ 성과 분석 결과 타입
export type AnalyticsResult = {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  averageViews: number;
  topPerformingPosts: PostPerformance[];
  lowPerformingPosts: PostPerformance[];
  bestKeywords: string[];
  bestPublishTimes: string[];
  recommendations: string[];
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class PostAnalytics extends EventEmitter {
  private posts: Map<string, PostPerformance> = new Map();
  private isTracking: boolean = false;
  private stopRequested: boolean = false;
  private trackingInterval: number = 30 * 60 * 1000; // 기본 30분

  constructor() {
    super();
    this.loadFromStorage();
  }

  // ✅ 로컬 스토리지에서 데이터 로드
  private loadFromStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const dataPath = path.join(app.getPath('userData'), 'post-analytics.json');
      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.posts = new Map(Object.entries(data.posts || {}));
      }
    } catch (error) {
      console.log('[PostAnalytics] 저장된 데이터 없음, 새로 시작');
    }
  }

  // ✅ 로컬 스토리지에 데이터 저장
  private saveToStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const dataPath = path.join(app.getPath('userData'), 'post-analytics.json');
      const data = {
        posts: Object.fromEntries(this.posts),
        lastSaved: new Date().toISOString(),
      };
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[PostAnalytics] 저장 실패:', error);
    }
  }

  // ✅ 새 글 추가 (발행 시 호출)
  addPost(url: string, title: string): void {
    const postId = this.extractPostId(url);
    if (!postId) return;

    const post: PostPerformance = {
      postId,
      url,
      title,
      publishedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      metrics: { views: 0, likes: 0, comments: 0, shares: 0 },
      history: [],
      trend: 'stable',
      score: 0,
    };

    this.posts.set(postId, post);
    this.saveToStorage();
    console.log(`[PostAnalytics] 새 글 추가: ${title}`);
  }

  // ✅ URL에서 포스트 ID 추출
  private extractPostId(url: string): string | null {
    // 네이버 블로그 URL 패턴: https://blog.naver.com/blogId/postNo
    const match = url.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
    if (match) {
      return `${match[1]}_${match[2]}`;
    }
    return null;
  }

  // ✅ 단일 글 성과 조회
  async fetchPostMetrics(url: string): Promise<{ views: number; likes: number; comments: number } | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      
      // 조회수 추출 (여러 패턴 시도)
      let views = 0;
      const viewsText = $('.blog_count').text() || $('.post_count').text() || $('[class*="view"]').first().text();
      const viewsMatch = viewsText.match(/(\d[\d,]*)/);
      if (viewsMatch) {
        views = parseInt(viewsMatch[1].replace(/,/g, ''), 10);
      }

      // 공감 수 추출
      let likes = 0;
      const likesText = $('.sympathy_count').text() || $('[class*="like"]').first().text() || $('[class*="sympathy"]').text();
      const likesMatch = likesText.match(/(\d[\d,]*)/);
      if (likesMatch) {
        likes = parseInt(likesMatch[1].replace(/,/g, ''), 10);
      }

      // 댓글 수 추출
      let comments = 0;
      const commentsText = $('.comment_count').text() || $('[class*="comment"]').first().text();
      const commentsMatch = commentsText.match(/(\d[\d,]*)/);
      if (commentsMatch) {
        comments = parseInt(commentsMatch[1].replace(/,/g, ''), 10);
      }

      return { views, likes, comments };
    } catch (error) {
      console.error(`[PostAnalytics] 성과 조회 실패 (${url}):`, (error as Error).message);
      return null;
    }
  }

  // ✅ 모든 글 성과 업데이트
  async updateAllMetrics(): Promise<void> {
    console.log('[PostAnalytics] 모든 글 성과 업데이트 시작...');
    
    for (const [postId, post] of this.posts) {
      if (this.stopRequested) break;
      
      const metrics = await this.fetchPostMetrics(post.url);
      if (metrics) {
        // 히스토리에 추가
        post.history.push({
          checkedAt: new Date().toISOString(),
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
        });

        // 최근 10개만 유지
        if (post.history.length > 10) {
          post.history = post.history.slice(-10);
        }

        // 트렌드 계산
        post.trend = this.calculateTrend(post.history);
        
        // 점수 계산
        post.score = this.calculateScore(metrics, post.history);

        // 메트릭 업데이트
        post.metrics = { ...metrics, shares: post.metrics.shares };
        post.lastCheckedAt = new Date().toISOString();

        this.posts.set(postId, post);
        
        // 이벤트 발생
        this.emit('metricsUpdated', post);
      }

      // API 부하 방지
      await sleep(2000);
    }

    this.saveToStorage();
    console.log('[PostAnalytics] 성과 업데이트 완료');
  }

  // ✅ 트렌드 계산
  private calculateTrend(history: PostPerformance['history']): 'up' | 'down' | 'stable' {
    if (history.length < 2) return 'stable';
    
    const recent = history.slice(-3);
    if (recent.length < 2) return 'stable';
    
    const firstViews = recent[0].views;
    const lastViews = recent[recent.length - 1].views;
    
    const changeRate = (lastViews - firstViews) / (firstViews || 1);
    
    if (changeRate > 0.1) return 'up';
    if (changeRate < -0.1) return 'down';
    return 'stable';
  }

  // ✅ 점수 계산 (0-100)
  private calculateScore(metrics: { views: number; likes: number; comments: number }, history: PostPerformance['history']): number {
    // 기본 점수 (조회수 기반)
    let score = Math.min(50, metrics.views / 100);
    
    // 참여도 점수 (공감 + 댓글)
    const engagement = (metrics.likes + metrics.comments * 2) / (metrics.views || 1);
    score += Math.min(30, engagement * 1000);
    
    // 성장 점수
    if (history.length >= 2) {
      const growth = (history[history.length - 1].views - history[0].views) / (history[0].views || 1);
      score += Math.min(20, growth * 50);
    }
    
    return Math.round(Math.min(100, Math.max(0, score)));
  }

  // ✅ 성과 추적 시작
  async startTracking(): Promise<void> {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.stopRequested = false;
    console.log('[PostAnalytics] 성과 추적 시작');

    while (!this.stopRequested) {
      await this.updateAllMetrics();
      await sleep(this.trackingInterval);
    }

    this.isTracking = false;
  }

  // ✅ 성과 추적 중지
  stopTracking(): void {
    this.stopRequested = true;
    console.log('[PostAnalytics] 성과 추적 중지');
  }

  // ✅ 추적 간격 설정
  setTrackingInterval(ms: number): void {
    this.trackingInterval = Math.max(5 * 60 * 1000, ms); // 최소 5분
  }

  // ✅ 추적 상태 확인
  getIsTracking(): boolean {
    return this.isTracking;
  }

  // ✅ 모든 글 성과 가져오기
  getAllPosts(): PostPerformance[] {
    return Array.from(this.posts.values()).sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  // ✅ 특정 글 성과 가져오기
  getPost(postId: string): PostPerformance | undefined {
    return this.posts.get(postId);
  }

  // ✅ 종합 분석 결과
  getAnalytics(): AnalyticsResult {
    const posts = this.getAllPosts();
    
    const totalViews = posts.reduce((sum, p) => sum + p.metrics.views, 0);
    const totalLikes = posts.reduce((sum, p) => sum + p.metrics.likes, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.metrics.comments, 0);
    
    // 상위/하위 성과 글
    const sortedByScore = [...posts].sort((a, b) => b.score - a.score);
    const topPerformingPosts = sortedByScore.slice(0, 5);
    const lowPerformingPosts = sortedByScore.slice(-5).reverse();
    
    // 발행 시간 분석
    const publishHours = posts.map(p => new Date(p.publishedAt).getHours());
    const hourCounts: Record<number, number> = {};
    publishHours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1; });
    
    // 성과 좋은 시간대 추출
    const bestHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => `${hour}시`);
    
    // 추천사항 생성
    const recommendations = this.generateRecommendations(posts, topPerformingPosts);
    
    return {
      totalPosts: posts.length,
      totalViews,
      totalLikes,
      totalComments,
      averageViews: posts.length > 0 ? Math.round(totalViews / posts.length) : 0,
      topPerformingPosts,
      lowPerformingPosts,
      bestKeywords: [], // 추후 키워드 분석 추가
      bestPublishTimes: bestHours,
      recommendations,
    };
  }

  // ✅ 추천사항 생성
  private generateRecommendations(posts: PostPerformance[], topPosts: PostPerformance[]): string[] {
    const recommendations: string[] = [];
    
    if (posts.length === 0) {
      recommendations.push('📝 아직 발행된 글이 없습니다. 첫 글을 발행해보세요!');
      return recommendations;
    }
    
    const avgViews = posts.reduce((sum, p) => sum + p.metrics.views, 0) / posts.length;
    
    if (avgViews < 100) {
      recommendations.push('📈 평균 조회수가 낮습니다. 트렌드 키워드를 활용해보세요.');
    }
    
    if (topPosts.length > 0 && topPosts[0].score > 70) {
      recommendations.push(`🏆 "${topPosts[0].title}" 글이 좋은 성과를 보이고 있습니다. 비슷한 주제로 더 작성해보세요.`);
    }
    
    const upTrendPosts = posts.filter(p => p.trend === 'up');
    if (upTrendPosts.length > 0) {
      recommendations.push(`🔥 ${upTrendPosts.length}개 글이 상승 추세입니다. 관련 키워드로 추가 발행을 권장합니다.`);
    }
    
    const lowEngagement = posts.filter(p => 
      p.metrics.views > 100 && (p.metrics.likes + p.metrics.comments) < 5
    );
    if (lowEngagement.length > 0) {
      recommendations.push('💬 조회수는 높지만 참여도가 낮은 글이 있습니다. CTA를 강화해보세요.');
    }
    
    return recommendations;
  }

  // ✅ 글 삭제
  removePost(postId: string): void {
    this.posts.delete(postId);
    this.saveToStorage();
  }

  // ✅ 모든 데이터 초기화
  clearAll(): void {
    this.posts.clear();
    this.saveToStorage();
  }
}
