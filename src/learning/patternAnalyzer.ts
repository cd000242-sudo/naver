import mongoose, { Schema, Model } from 'mongoose';

// ==========================================
// 1. 모델 정의 분리 (Global Scope)
// ==========================================

// 인터페이스 정의
interface IAutomationPost {
  title: string;
  views: number;
  comments: number;
  shares: number;
  publishedAt: Date;
  tone?: string;
  controversyLevel?: 'none' | 'low' | 'medium';
}

interface IAutomationPattern {
  snapshotAt: Date;
  payload: any;
}

// 스키마 및 모델 캐싱 (이미 존재하면 재사용)
const PostModel: Model<IAutomationPost> = 
  mongoose.models.AutomationPost || 
  mongoose.model<IAutomationPost>('AutomationPost', new Schema({
    title: String,
    views: Number,
    comments: Number,
    shares: Number,
    publishedAt: Date,
    tone: String,
    controversyLevel: String
  }, { collection: 'automation_posts' }));

const PatternModel: Model<IAutomationPattern> = 
  mongoose.models.AutomationPattern || 
  mongoose.model<IAutomationPattern>('AutomationPattern', new Schema({
    snapshotAt: { type: Date, default: Date.now },
    payload: Object
  }, { collection: 'automation_patterns' }));


// ==========================================
// 2. 패턴 분석기 클래스
// ==========================================

export class PatternAnalyzer {
  private connectionInitialized = false;

  async analyzeAndLearn(): Promise<void> {
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI 미설정: 학습 건너뜀');
      return;
    }

    await this.ensureConnection();
    console.log('🎓 패턴 학습 시작...');

    const posts = await this.fetchRecentPosts(30);
    if (posts.length < 10) { // 데이터가 너무 적으면 분석 의미 없음
      console.log('ℹ️ 데이터 부족(10개 미만)으로 학습을 보류합니다.');
      return;
    }

    // ✅ 개선된 성공 기준: 상위 20% (Percentile)
    const sortedByViews = [...posts].sort((a, b) => b.views - a.views);
    const top20Index = Math.floor(posts.length * 0.2);
    const thresholdView = sortedByViews[top20Index]?.views || 0;

    // 최소 기준(50)은 유지하되, 상위 20%를 성공으로 간주
    const successThreshold = Math.max(50, thresholdView); 

    const successful = posts.filter(p => p.views >= successThreshold);
    const failed = posts.filter(p => p.views < successThreshold * 0.3); // 성공 기준의 30% 미만은 실패로 간주

    console.log(`📊 분석 대상: 총 ${posts.length}개 (기준 조회수: ${successThreshold})`);
    console.log(` - 성공 그룹: ${successful.length}개`);
    console.log(` - 실패 그룹: ${failed.length}개`);

    const patterns = {
      meta: {
        totalAnalyzed: posts.length,
        successThreshold,
        analyzedAt: new Date()
      },
      titlePatterns: this.analyzeTitlePatterns(successful, failed),
      publishTimes: this.analyzePublishTimes(successful),
      contentLength: this.analyzeContentLength(successful),
      toneStyles: this.analyzeToneStyles(successful),
      viralElements: this.analyzeViralElements(successful),
    };

    await this.savePatterns(patterns);
    await this.updateStrategy(patterns);

    console.log('✅ 학습 및 저장 완료');
  }

  private async ensureConnection(): Promise<void> {
    if (this.connectionInitialized || mongoose.connection.readyState === 1) {
        this.connectionInitialized = true;
        return;
    }
    
    await mongoose.connect(process.env.MONGODB_URI as string, { 
        dbName: process.env.MONGODB_DB ?? 'blog_automation' 
    });
    this.connectionInitialized = true;
  }

  private async fetchRecentPosts(days: number): Promise<IAutomationPost[]> {
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      return await PostModel.find({ publishedAt: { $gte: fromDate } })
        .sort({ publishedAt: -1 })
        .limit(500)
        .lean();
    } catch (error) {
      console.warn(`⚠️ 데이터 조회 실패: ${(error as Error).message}`);
      return [];
    }
  }

  private analyzeTitlePatterns(successful: IAutomationPost[], failed: IAutomationPost[]) {
    // ✅ 정규식 개선 (한글 특화)
    const classify = (title: string): string => {
      if (/TOP\s*\d+|BEST|\d+가지|\d+개/.test(title)) return 'listicle'; // 리스트형 (TOP 5, 3가지)
      if (/[?!]/.test(title) || /충격|경악|결국|사실은/.test(title)) return 'emotional'; // 감정 호소
      if (/방법|노하우|정리|요약|가이드/.test(title)) return 'how-to'; // 정보성
      if (title.length > 35) return 'long-tail'; // 긴 제목
      return 'news'; // 일반 뉴스형
    };

    const analyzeGroup = (group: IAutomationPost[]) => {
       const types: Record<string, number> = {};
       let totalLength = 0;
       
       group.forEach(p => {
           const type = classify(p.title);
           types[type] = (types[type] || 0) + 1;
           totalLength += p.title.length;
       });

       return {
           typeCount: types,
           avgLength: group.length ? Math.round(totalLength / group.length) : 0
       };
    };

    const successStats = analyzeGroup(successful);
    
    // 가장 효과적인 타이틀 유형 찾기
    const bestType = Object.entries(successStats.typeCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    return {
      bestType,
      optimalLength: successStats.avgLength,
      stats: successStats
    };
  }

  private analyzePublishTimes(posts: IAutomationPost[]) {
    const timeBuckets = new Map<number, number[]>();
    posts.forEach((post) => {
      const hour = new Date(post.publishedAt).getHours();
      if (!timeBuckets.has(hour)) timeBuckets.set(hour, []);
      timeBuckets.get(hour)!.push(post.views);
    });

    const avgByHour = Array.from(timeBuckets.entries()).map(([hour, views]) => ({
      hour,
      avgViews: Math.round(views.reduce((a, b) => a + b, 0) / views.length),
      count: views.length
    }));

    // 조회수 높은 순으로 정렬
    const bestHours = avgByHour
        .filter(h => h.count >= 2) // 최소 2개 이상 데이터가 있는 시간대만 신뢰
        .sort((a, b) => b.avgViews - a.avgViews)
        .slice(0, 3)
        .map(h => h.hour);

    return { bestHours, detail: avgByHour };
  }

  private analyzeContentLength(posts: IAutomationPost[]) {
    // 실제 본문 길이는 DB에 없으므로, 추후 확장을 위해 로직만 유지
    // (현재는 views 기반 추정치이므로, 단순화)
    return { recommendedLength: '2000~3000자 (추정)' };
  }

  private analyzeToneStyles(posts: IAutomationPost[]) {
    const tones = posts.reduce((acc, p) => {
        const t = p.tone || 'neutral';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    
    // 가장 많이 쓰인 톤
    const bestTone = Object.entries(tones).sort((a, b) => b[1] - a[1])[0]?.[0] || 'polite';
    return { bestTone, distribution: tones };
  }

  private analyzeViralElements(posts: IAutomationPost[]) {
    if (posts.length === 0) return { engagementRate: 0 };

    const totalViews = posts.reduce((sum, p) => sum + p.views, 0);
    const totalActions = posts.reduce((sum, p) => sum + p.comments + p.shares, 0);
    
    return {
      engagementRate: (totalActions / Math.max(1, totalViews) * 100).toFixed(2) + '%'
    };
  }

  private async savePatterns(patterns: any): Promise<void> {
    if (!this.connectionInitialized) return;
    await PatternModel.create({ payload: patterns }).catch(e => 
        console.warn(`⚠️ 패턴 저장 실패: ${e.message}`)
    );
  }

  private async updateStrategy(patterns: any): Promise<void> {
    // 여기서 실제 포스팅 전략(config 등)을 업데이트하는 로직 연결
    console.log('🧠 전략 업데이트:', {
        bestTime: patterns.publishTimes.bestHours,
        bestTitle: patterns.titlePatterns.bestType,
        bestTone: patterns.toneStyles.bestTone
    });
  }
}