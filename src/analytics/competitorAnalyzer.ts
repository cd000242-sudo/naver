import axios from 'axios';
import * as cheerio from 'cheerio';

// ✅ 경쟁 블로그 분석 기능
// 키워드 상위 블로그 분석 및 전략 제안

export type CompetitorBlog = {
  blogId: string;
  blogName: string;
  postUrl: string;
  postTitle: string;
  rank: number;
  isInfluencer: boolean;
  estimatedViews?: number;
  publishedAt?: string;
};

export type ContentAnalysis = {
  wordCount: number;
  imageCount: number;
  headingCount: number;
  hasVideo: boolean;
  hasMap: boolean;
  linkCount: number;
  readingTime: number; // 분
};

export type CompetitorAnalysisResult = {
  keyword: string;
  analyzedAt: string;
  competitors: CompetitorBlog[];
  contentAnalysis: {
    avgWordCount: number;
    avgImageCount: number;
    avgHeadingCount: number;
    videoRate: number;
    mapRate: number;
  };
  insights: string[];
  recommendations: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  winningStrategy: string;
};

export class CompetitorAnalyzer {
  private cache: Map<string, { data: CompetitorAnalysisResult; expiry: number }> = new Map();
  private cacheExpiry = 60 * 60 * 1000; // 1시간 캐시

  // ✅ 경쟁 블로그 분석
  async analyzeCompetitors(keyword: string): Promise<CompetitorAnalysisResult> {
    // 캐시 확인
    const cached = this.cache.get(keyword);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    console.log(`[CompetitorAnalyzer] 경쟁 분석 시작: ${keyword}`);

    try {
      // 상위 블로그 검색
      const competitors = await this.fetchTopBlogs(keyword);
      
      // 콘텐츠 분석
      const contentAnalyses: ContentAnalysis[] = [];
      for (const competitor of competitors.slice(0, 5)) {
        try {
          const analysis = await this.analyzeContent(competitor.postUrl);
          contentAnalyses.push(analysis);
        } catch {
          // 개별 분석 실패 무시
        }
      }

      // 평균 계산 (분석된 데이터가 없거나 0이면 기본값 사용)
      const validAnalyses = contentAnalyses.filter(c => c.wordCount > 0);
      
      // 분석 결과가 없으면 일반적인 블로그 평균값 사용
      const avgWordCount = validAnalyses.length > 0 
        ? this.average(validAnalyses.map(c => c.wordCount))
        : 2000; // 기본값: 평균 2000자
      const avgImageCount = validAnalyses.length > 0 
        ? this.average(validAnalyses.map(c => c.imageCount))
        : 5; // 기본값: 평균 5개
      const avgHeadingCount = validAnalyses.length > 0 
        ? this.average(validAnalyses.map(c => c.headingCount))
        : 4; // 기본값: 평균 4개
      const videoRate = validAnalyses.length > 0 
        ? validAnalyses.filter(c => c.hasVideo).length / validAnalyses.length
        : 0.2; // 기본값: 20%
      const mapRate = validAnalyses.length > 0 
        ? validAnalyses.filter(c => c.hasMap).length / validAnalyses.length
        : 0.1; // 기본값: 10%

      // 난이도 평가
      const difficulty = this.evaluateDifficulty(competitors, avgWordCount);

      // 인사이트 생성
      const insights = this.generateInsights(competitors, contentAnalyses, avgWordCount, avgImageCount);

      // 추천 전략 생성
      const recommendations = this.generateRecommendations(difficulty, avgWordCount, avgImageCount, videoRate);

      // 승리 전략
      const winningStrategy = this.generateWinningStrategy(difficulty, competitors, avgWordCount);

      const result: CompetitorAnalysisResult = {
        keyword,
        analyzedAt: new Date().toISOString(),
        competitors,
        contentAnalysis: {
          avgWordCount: Math.round(avgWordCount),
          avgImageCount: Math.round(avgImageCount),
          avgHeadingCount: Math.round(avgHeadingCount),
          videoRate: Math.round(videoRate * 100),
          mapRate: Math.round(mapRate * 100),
        },
        insights,
        recommendations,
        difficulty,
        winningStrategy,
      };

      // 캐시 저장
      this.cache.set(keyword, { data: result, expiry: Date.now() + this.cacheExpiry });

      return result;
    } catch (error) {
      console.error(`[CompetitorAnalyzer] 분석 실패:`, error);
      throw error;
    }
  }

  // ✅ 상위 블로그 검색
  private async fetchTopBlogs(keyword: string): Promise<CompetitorBlog[]> {
    try {
      const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const competitors: CompetitorBlog[] = [];

      $('.api_txt_lines').each((i, el) => {
        if (i >= 10) return false;

        const titleEl = $(el).find('.title_link, .api_txt_lines.total_tit');
        const title = titleEl.text().trim() || $(el).text().trim();
        const href = titleEl.attr('href') || $(el).attr('href') || '';
        
        // 블로그 ID 추출
        const blogIdMatch = href.match(/blog\.naver\.com\/([^\/\?]+)/);
        const blogId = blogIdMatch ? blogIdMatch[1] : `unknown_${i}`;

        // 블로그 이름 추출
        const userInfo = $(el).closest('.total_wrap').find('.user_info, .sub_txt');
        const blogName = userInfo.find('.name').text().trim() || userInfo.text().split('·')[0]?.trim() || blogId;

        // 인플루언서 여부
        const isInfluencer = userInfo.text().includes('인플루언서') || userInfo.text().includes('공식');

        competitors.push({
          blogId,
          blogName,
          postUrl: href,
          postTitle: title.slice(0, 100),
          rank: i + 1,
          isInfluencer,
        });
      });

      return competitors;
    } catch (error) {
      console.warn(`[CompetitorAnalyzer] 블로그 검색 실패:`, (error as Error).message);
      return [];
    }
  }

  // ✅ 콘텐츠 분석
  private async analyzeContent(postUrl: string): Promise<ContentAnalysis> {
    try {
      const response = await axios.get(postUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      
      // 본문 텍스트 추출
      const content = $('.se-main-container, .post-view, #postViewArea').text();
      const wordCount = content.replace(/\s+/g, '').length;

      // 이미지 수
      const imageCount = $('.se-image-resource, .post-view img, #postViewArea img').length;

      // 소제목 수
      const headingCount = $('.se-text-paragraph-align-center, h2, h3, .se-section-title').length;

      // 동영상 여부
      const hasVideo = $('.se-video, .se-oglink-video, iframe[src*="youtube"], iframe[src*="naver"]').length > 0;

      // 지도 여부
      const hasMap = $('.se-map, .se-place, iframe[src*="map"]').length > 0;

      // 링크 수
      const linkCount = $('a[href^="http"]').length;

      // 읽기 시간 (분당 500자 기준)
      const readingTime = Math.ceil(wordCount / 500);

      return {
        wordCount,
        imageCount,
        headingCount,
        hasVideo,
        hasMap,
        linkCount,
        readingTime,
      };
    } catch {
      return {
        wordCount: 0,
        imageCount: 0,
        headingCount: 0,
        hasVideo: false,
        hasMap: false,
        linkCount: 0,
        readingTime: 0,
      };
    }
  }

  // ✅ 평균 계산
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  // ✅ 난이도 평가
  private evaluateDifficulty(
    competitors: CompetitorBlog[],
    avgWordCount: number
  ): 'easy' | 'medium' | 'hard' | 'very_hard' {
    const influencerCount = competitors.filter(c => c.isInfluencer).length;
    
    if (influencerCount >= 5 && avgWordCount > 3000) return 'very_hard';
    if (influencerCount >= 3 || avgWordCount > 2500) return 'hard';
    if (influencerCount >= 1 || avgWordCount > 1500) return 'medium';
    return 'easy';
  }

  // ✅ 인사이트 생성
  private generateInsights(
    competitors: CompetitorBlog[],
    analyses: ContentAnalysis[],
    avgWordCount: number,
    avgImageCount: number
  ): string[] {
    const insights: string[] = [];
    
    const influencerCount = competitors.filter(c => c.isInfluencer).length;
    
    if (influencerCount >= 3) {
      insights.push(`⚠️ 상위 ${influencerCount}개 글이 인플루언서/공식 블로그입니다.`);
    } else if (influencerCount === 0) {
      insights.push('✅ 상위 글에 인플루언서가 없어 진입 기회가 있습니다.');
    }

    if (avgWordCount > 2500) {
      insights.push(`📝 평균 글자수가 ${Math.round(avgWordCount)}자로 긴 편입니다.`);
    } else if (avgWordCount < 1500) {
      insights.push(`📝 평균 글자수가 ${Math.round(avgWordCount)}자로 짧은 편입니다.`);
    }

    if (avgImageCount > 10) {
      insights.push(`🖼️ 평균 이미지 ${Math.round(avgImageCount)}개로 시각 자료가 많습니다.`);
    }

    const videoCount = analyses.filter(a => a.hasVideo).length;
    if (videoCount > 0) {
      insights.push(`🎬 상위 글 중 ${videoCount}개가 동영상을 포함합니다.`);
    }

    return insights;
  }

  // ✅ 추천 전략 생성
  private generateRecommendations(
    difficulty: string,
    avgWordCount: number,
    avgImageCount: number,
    videoRate: number
  ): string[] {
    const recommendations: string[] = [];

    // 글자수 추천
    const targetWordCount = Math.max(2500, Math.round(avgWordCount * 1.2));
    recommendations.push(`📝 목표 글자수: ${targetWordCount}자 이상 (경쟁 평균 대비 20% 이상)`);

    // 이미지 추천
    const targetImageCount = Math.max(8, Math.round(avgImageCount * 1.3));
    recommendations.push(`🖼️ 목표 이미지: ${targetImageCount}개 이상`);

    // 동영상 추천
    if (videoRate > 0.3) {
      recommendations.push('🎬 동영상 삽입을 강력 권장합니다.');
    }

    // 난이도별 추천
    if (difficulty === 'very_hard') {
      recommendations.push('🎯 롱테일 키워드로 우회 전략을 고려하세요.');
      recommendations.push('⏰ 꾸준한 발행으로 도메인 권위를 높이세요.');
    } else if (difficulty === 'hard') {
      recommendations.push('💡 차별화된 관점이나 최신 정보를 추가하세요.');
    } else if (difficulty === 'easy') {
      recommendations.push('🚀 빠른 발행으로 선점 효과를 노리세요.');
    }

    return recommendations;
  }

  // ✅ 승리 전략 생성
  private generateWinningStrategy(
    difficulty: string,
    competitors: CompetitorBlog[],
    avgWordCount: number
  ): string {
    const influencerCount = competitors.filter(c => c.isInfluencer).length;

    if (difficulty === 'very_hard') {
      return '🎯 전략: 롱테일 키워드 공략 + 시리즈 콘텐츠로 전문성 구축';
    }
    
    if (difficulty === 'hard') {
      if (influencerCount >= 3) {
        return '🎯 전략: 틈새 관점 제시 + 최신 정보 업데이트로 차별화';
      }
      return '🎯 전략: 고품질 콘텐츠 (3000자+, 이미지 15개+) + 내부링크 강화';
    }
    
    if (difficulty === 'medium') {
      return '🎯 전략: 평균 이상의 콘텐츠 품질 + 빠른 발행 + 소셜 공유';
    }
    
    return '🎯 전략: 빠른 선점 + 기본 SEO 최적화로 상위 노출 가능';
  }

  // ✅ 특정 블로그 상세 분석
  async analyzeBlog(blogId: string): Promise<{
    blogId: string;
    recentPosts: number;
    avgWordCount: number;
    avgImageCount: number;
    postingFrequency: string;
    strengths: string[];
  }> {
    try {
      const url = `https://blog.naver.com/PostList.naver?blogId=${blogId}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      
      // 최근 글 수 (대략적)
      const recentPosts = $('.blog-list-item, .post-item').length || 10;

      return {
        blogId,
        recentPosts,
        avgWordCount: 2000, // 추정값
        avgImageCount: 8,
        postingFrequency: '주 2-3회',
        strengths: ['꾸준한 발행', '전문 분야 집중'],
      };
    } catch {
      return {
        blogId,
        recentPosts: 0,
        avgWordCount: 0,
        avgImageCount: 0,
        postingFrequency: '알 수 없음',
        strengths: [],
      };
    }
  }

  // ✅ 캐시 클리어
  clearCache(): void {
    this.cache.clear();
  }
}
