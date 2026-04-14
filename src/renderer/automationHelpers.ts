// ============================================
// 자동화 시스템 헬퍼 클래스들
// ============================================

// 해시태그 생성기
export class HashtagGenerator {
  private categoryHashtags: Record<string, string[]>;
  private stopWords: string[];

  constructor() {
    this.categoryHashtags = {
      general: ['일상', '블로그', '정보', '공유', '추천'],
      news: ['속보', '이슈', '핫토픽', '화제', '뉴스'],
      sports: ['스포츠', '경기', '승부', '응원', '명장면'],
      health: ['건강', '건강정보', '건강관리', '웰빙', '건강팁'],
      finance: ['재테크', '투자', '경제', '재무', '돈관리'],
      it_review: ['IT', '리뷰', '테크', '가전', '스마트'],
      shopping_review: ['쇼핑', '리뷰', '후기', '추천템', '가성비'],
      parenting: ['육아', '육아팁', '아이키우기', '육아일상', '부모'],
      food: ['맛집', '요리', '레시피', '먹스타그램', '음식'],
      travel: ['여행', '여행지', '여행스타그램', '국내여행', '여행추천'],
      interior: ['인테리어', '홈스타일링', '집꾸미기', 'DIY', '인테리어팁'],
      pet: ['반려동물', '반려견', '반려묘', '강아지', '고양이'],
      fashion: ['패션', '스타일', '코디', 'OOTD', '패션템'],
      hobby: ['취미', '취미생활', '힐링', '일상', '라이프'],
      realestate: ['부동산', '아파트', '투자', '부동산정보', '매매'],
      car: ['자동차', '차', '시승기', '자동차리뷰', '드라이브'],
      book_movie: ['책', '영화', '리뷰', '추천', '감상'],
      self_dev: ['자기계발', '성장', '동기부여', '습관', '목표'],
      study: ['공부', '학습', '교육', '공부법', '지식'],
      game: ['게임', '게임추천', '게임리뷰', '게임팁', '겜스타그램'],
      photo_video: ['사진', '촬영', '영상', '크리에이터', '포토'],
      art: ['예술', '작품', 'DIY', '수공예', '아트'],
      music: ['음악', '노래', '추천곡', '플레이리스트', '감상']
    };
    
    this.stopWords = [
      '은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로',
      '와', '과', '하다', '있다', '되다', '이다', '아니다', '없다',
      '그', '이', '저', '것', '수', '등', '및', '또한', '그리고'
    ];
  }

  extractKeywords(title: string): string[] {
    const cleaned = title.replace(/[^\w\sㄱ-ㅎ가-힣]/g, ' ');
    const words = cleaned.split(/\s+/).filter(word => word.length > 1);
    const keywords = words.filter(word => !this.stopWords.includes(word));
    return [...new Set(keywords)];
  }

  generate(params: {
    title?: string;
    articleType?: string;
    customCategory?: string;
    targetCount?: number;
  }): string[] {
    const { title, articleType = 'general', customCategory, targetCount = 8 } = params;
    const hashtags = new Set<string>();
    
    // 1. 카테고리 기본 해시태그 (3개)
    const categoryType = articleType === 'custom' ? 'general' : articleType;
    const categoryTags = this.categoryHashtags[categoryType] || this.categoryHashtags.general;
    categoryTags.slice(0, 3).forEach(tag => hashtags.add(tag));
    
    // 2. 커스텀 카테고리가 있으면 추가
    if (customCategory && customCategory.trim()) {
      hashtags.add(customCategory.trim());
    }
    
    // 3. 제목에서 키워드 추출 (최대 4개)
    if (title) {
      const titleKeywords = this.extractKeywords(title);
      titleKeywords.slice(0, 4).forEach(keyword => {
        if (keyword.length >= 2 && keyword.length <= 10) {
          hashtags.add(keyword);
        }
      });
    }
    
    // 4. 목표 개수에 맞춰 조정
    const hashtagArray = Array.from(hashtags).slice(0, targetCount);
    
    // 5. 부족하면 카테고리 태그로 채우기
    if (hashtagArray.length < targetCount) {
      const remaining = targetCount - hashtagArray.length;
      categoryTags.slice(3, 3 + remaining).forEach(tag => {
        if (!hashtagArray.includes(tag)) {
          hashtagArray.push(tag);
        }
      });
    }
    
    return hashtagArray;
  }

  format(hashtags: string[]): string {
    return hashtags.map(tag => `#${tag}`).join(' ');
  }

  generateFormatted(params: {
    title?: string;
    articleType?: string;
    customCategory?: string;
  }): string {
    const hashtags = this.generate(params);
    return this.format(hashtags);
  }
}

// 이미지 자동 배치
export class ImageAutoPlacement {
  private thumbnailPlaced: boolean = false;
  private headingImages: Map<string, string> = new Map();

  extractHeadings(content: string): Array<{ index: number; text: string; original: string }> {
    const headings: Array<{ index: number; text: string; original: string }> = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.length > 0) {
        const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(line);
        const isMarkdown = line.startsWith('##') || line.startsWith('###');
        
        if (hasEmoji || isMarkdown) {
          const cleanHeading = line
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/^#+\s*/, '')
            .trim();
          
          if (cleanHeading.length > 0) {
            headings.push({
              index: i,
              text: cleanHeading,
              original: line
            });
          }
        }
      }
    }
    
    return headings;
  }

  matchImagesToHeadings(
    headings: Array<{ index: number; text: string; original: string }>,
    imagePaths: string[]
  ): Map<string, string> {
    const matches = new Map<string, string>();
    
    if (imagePaths.length >= headings.length) {
      headings.forEach((heading, idx) => {
        matches.set(heading.text, imagePaths[idx]);
      });
    } else {
      const interval = Math.ceil(headings.length / imagePaths.length);
      let imageIdx = 0;
      
      headings.forEach((heading, idx) => {
        if (idx % interval === 0 && imageIdx < imagePaths.length) {
          matches.set(heading.text, imagePaths[imageIdx]);
          imageIdx++;
        }
      });
    }
    
    return matches;
  }

  insertImages(content: string, imagePaths: string[], thumbnailPath: string | null = null): string {
    const result = content;
    const lines = result.split('\n');
    
    // 1. 썸네일은 맨 위에
    if (thumbnailPath && !this.thumbnailPlaced) {
      let insertIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
          insertIndex = i + 1;
          break;
        }
      }
      lines.splice(insertIndex, 0, '', `[썸네일 이미지: ${thumbnailPath}]`, '');
      this.thumbnailPlaced = true;
    }
    
    // 2. 소제목 추출
    const headings = this.extractHeadings(lines.join('\n'));
    
    // 3. 소제목과 이미지 매칭
    const matches = this.matchImagesToHeadings(headings, imagePaths);
    
    // 4. 각 소제목 다음에 이미지 삽입
    let offset = 0;
    headings.forEach(heading => {
      const imagePath = matches.get(heading.text);
      if (imagePath) {
        const insertIndex = heading.index + offset + 1;
        lines.splice(insertIndex, 0, '', `[이미지: ${imagePath}]`, '');
        offset += 3;
      }
    });
    
    return lines.join('\n');
  }

  convertToActualImages(content: string, imageMap: Record<string, string>): string {
    let result = content;
    
    Object.entries(imageMap).forEach(([placeholder, actualPath]) => {
      result = result.replace(
        new RegExp(`\\[이미지: ${placeholder}\\]`, 'g'),
        `<img src="${actualPath}" alt="본문 이미지" />`
      );
    });
    
    return result;
  }

  reset(): void {
    this.thumbnailPlaced = false;
    this.headingImages.clear();
  }
}

// 에러 핸들러
export class ErrorHandler {
  private maxRetries: number = 3;
  private retryDelay: number = 2000;

  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async retryAICall<T>(
    apiFunction: (params: any) => Promise<T>,
    params: any,
    retryCount: number = 0
  ): Promise<T> {
    try {
      this.log(`🤖 AI 호출 시도 (${retryCount + 1}/${this.maxRetries + 1})`);
      const result = await apiFunction(params);
      
      if (!result || (typeof result === 'string' && result.trim().length < 500)) {
        throw new Error('생성된 콘텐츠가 너무 짧습니다');
      }
      
      return result;
      
    } catch (error) {
      this.log(`❌ AI 호출 실패: ${(error as Error).message}`);
      
      if (retryCount < this.maxRetries) {
        this.log(`⏳ ${this.retryDelay / 1000}초 후 재시도...`);
        await this.delay(this.retryDelay);
        return this.retryAICall(apiFunction, params, retryCount + 1);
      } else {
        throw new Error(`AI 호출 ${this.maxRetries + 1}회 실패: ${(error as Error).message}`);
      }
    }
  }

  async retryImageGeneration<T>(
    generateFunction: (params: any) => Promise<T>,
    params: any,
    retryCount: number = 0
  ): Promise<T | null> {
    try {
      this.log(`🖼️ 이미지 생성 시도 (${retryCount + 1}/${this.maxRetries + 1})`);
      const result = await generateFunction(params);
      
      if (!result || (typeof result === 'object' && !('path' in result))) {
        throw new Error('이미지 생성 결과가 없습니다');
      }
      
      return result;
      
    } catch (error) {
      this.log(`❌ 이미지 생성 실패: ${(error as Error).message}`);
      
      if (retryCount < this.maxRetries) {
        this.log(`⏳ ${this.retryDelay / 1000}초 후 재시도...`);
        await this.delay(this.retryDelay);
        return this.retryImageGeneration(generateFunction, params, retryCount + 1);
      } else {
        this.log(`⚠️ 이미지 생성 최종 실패. 텍스트만 발행합니다.`);
        return null;
      }
    }
  }

  async retryNaverLogin<T>(
    loginFunction: (credentials: any) => Promise<T>,
    credentials: any,
    retryCount: number = 0
  ): Promise<T> {
    try {
      this.log(`🔐 네이버 로그인 시도 (${retryCount + 1}/${this.maxRetries + 1})`);
      const result = await loginFunction(credentials);
      return result;
      
    } catch (error) {
      this.log(`❌ 로그인 실패: ${(error as Error).message}`);
      
      if (retryCount < this.maxRetries) {
        this.log(`⏳ ${this.retryDelay / 1000}초 후 재시도...`);
        await this.delay(this.retryDelay);
        return this.retryNaverLogin(loginFunction, credentials, retryCount + 1);
      } else {
        throw new Error(`로그인 ${this.maxRetries + 1}회 실패. 아이디/비밀번호를 확인하세요.`);
      }
    }
  }

  log(message: string): void {
    const logOutput = document.getElementById('log-output');
    if (logOutput) {
      const timestamp = new Date().toLocaleTimeString('ko-KR');
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.textContent = `[${timestamp}] ${message}`;
      logOutput.appendChild(logEntry);
      logOutput.scrollTop = logOutput.scrollHeight;
    }
    console.log(message);
  }

  getUserFriendlyError(error: Error): string {
    const errorMessages: Record<string, string> = {
      'API key': 'API 키가 올바르지 않습니다. 환경 설정에서 확인해주세요.',
      'quota': 'API 사용량을 초과했습니다. 잠시 후 다시 시도해주세요.',
      'network': '네트워크 연결을 확인해주세요.',
      'timeout': '요청 시간이 초과되었습니다. 다시 시도해주세요.',
      'login': '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.',
      'permission': '권한이 없습니다. 설정을 확인해주세요.'
    };
    
    for (const [key, message] of Object.entries(errorMessages)) {
      if (error.message.toLowerCase().includes(key.toLowerCase())) {
        return message;
      }
    }
    
    return `오류가 발생했습니다: ${error.message}`;
  }

  showError(error: Error, context: string = ''): void {
    const friendlyMessage = this.getUserFriendlyError(error);
    const fullMessage = context 
      ? `${context}\n\n${friendlyMessage}` 
      : friendlyMessage;
    
    this.log(`🚨 ${fullMessage}`);
    alert(fullMessage);
  }
}

// 발행 시간 최적화
export class PublishTimeOptimizer {
  private optimalTimes: Record<string, Array<{ day: string; hours: number[] }>>;
  private ageActiveTimes: Record<string, { weekday: number[]; weekend: number[] }>;

  constructor() {
    this.optimalTimes = {
      general: [
        { day: 'weekday', hours: [7, 8, 12, 13, 19, 20, 21] },
        { day: 'weekend', hours: [10, 11, 14, 15, 20, 21] }
      ],
      news: [
        { day: 'weekday', hours: [7, 8, 9, 12, 18, 19] },
        { day: 'weekend', hours: [9, 10, 19, 20] }
      ],
      sports: [
        { day: 'weekday', hours: [12, 18, 19, 20, 21, 22] },
        { day: 'weekend', hours: [14, 15, 19, 20, 21] }
      ],
      health: [
        { day: 'weekday', hours: [6, 7, 12, 13, 21, 22] },
        { day: 'weekend', hours: [8, 9, 10, 21] }
      ],
      finance: [
        { day: 'weekday', hours: [7, 8, 12, 13, 18, 19] },
        { day: 'weekend', hours: [10, 11, 19, 20] }
      ],
      food: [
        { day: 'weekday', hours: [11, 12, 13, 17, 18, 19] },
        { day: 'weekend', hours: [11, 12, 13, 17, 18] }
      ],
      travel: [
        { day: 'weekday', hours: [12, 13, 19, 20, 21] },
        { day: 'weekend', hours: [10, 11, 14, 15, 19, 20] }
      ],
      parenting: [
        { day: 'weekday', hours: [10, 11, 14, 15, 21, 22] },
        { day: 'weekend', hours: [9, 10, 14, 15, 21] }
      ],
      shopping_review: [
        { day: 'weekday', hours: [12, 13, 19, 20, 21, 22] },
        { day: 'weekend', hours: [13, 14, 19, 20, 21] }
      ],
      it_review: [
        { day: 'weekday', hours: [12, 13, 19, 20, 21] },
        { day: 'weekend', hours: [14, 15, 19, 20] }
      ]
    };
    
    this.ageActiveTimes = {
      '20s': { weekday: [12, 13, 19, 20, 21, 22, 23], weekend: [11, 12, 14, 15, 19, 20, 21, 22] },
      '30s': { weekday: [7, 8, 12, 13, 19, 20, 21], weekend: [10, 11, 14, 15, 19, 20] },
      '40s': { weekday: [6, 7, 12, 13, 18, 19, 20], weekend: [9, 10, 14, 15, 19] },
      'all': { weekday: [7, 8, 12, 13, 19, 20, 21], weekend: [10, 11, 14, 15, 19, 20] }
    };
  }

  isWeekend(date: Date = new Date()): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  getOptimalHours(articleType: string, targetAge: string): number[] {
    const dayType = this.isWeekend() ? 'weekend' : 'weekday';
    
    const categoryTimes = this.optimalTimes[articleType] || this.optimalTimes.general;
    const categoryHours = categoryTimes.find(t => t.day === dayType)?.hours || [];
    
    const ageHours = this.ageActiveTimes[targetAge] 
      ? this.ageActiveTimes[targetAge][dayType] 
      : this.ageActiveTimes.all[dayType];
    
    const intersection = categoryHours.filter(hour => ageHours.includes(hour));
    
    return intersection.length > 0 ? intersection : categoryHours;
  }

  getNextOptimalTime(articleType: string, targetAge: string): Date {
    const now = new Date();
    const currentHour = now.getHours();
    const optimalHours = this.getOptimalHours(articleType, targetAge);
    
    const todayRemaining = optimalHours.filter(hour => hour > currentHour);
    
    if (todayRemaining.length > 0) {
      const nextHour = todayRemaining[0];
      const nextTime = new Date(now);
      nextTime.setHours(nextHour, 0, 0, 0);
      return nextTime;
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const tomorrowOptimal = this.getOptimalHours(articleType, targetAge);
      const firstHour = tomorrowOptimal[0] || 9;
      
      tomorrow.setHours(firstHour, 0, 0, 0);
      return tomorrow;
    }
  }

  suggestPublishTime(articleType: string, targetAge: string): {
    date: Date;
    formatted: string;
    reason: string;
  } {
    const nextTime = this.getNextOptimalTime(articleType, targetAge);
    const formatted = nextTime.toLocaleString('ko-KR', {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
    
    return {
      date: nextTime,
      formatted: formatted,
      reason: this.getReasonForTime(nextTime, articleType, targetAge)
    };
  }

  getReasonForTime(date: Date, articleType: string, targetAge: string): string {
    const hour = date.getHours();
    const dayType = this.isWeekend(date) ? '주말' : '평일';
    const ageDesc: Record<string, string> = {
      '20s': '20대',
      '30s': '30대',
      '40s': '40~50대',
      'all': '전 연령'
    };
    const ageLabel = ageDesc[targetAge] || '전 연령';
    
    let timeDesc = '';
    if (hour >= 6 && hour < 9) timeDesc = '아침 출근 시간대';
    else if (hour >= 12 && hour < 14) timeDesc = '점심 시간대';
    else if (hour >= 18 && hour < 23) timeDesc = '저녁 퇴근 후 시간대';
    else timeDesc = '여유 시간대';
    
    return `${dayType} ${timeDesc}, ${ageLabel} 독자가 가장 활발한 시간입니다.`;
  }

  validatePublishTime(date: Date, articleType: string, targetAge: string): {
    isOptimal: boolean;
    message: string;
  } {
    const hour = date.getHours();
    const optimalHours = this.getOptimalHours(articleType, targetAge);
    
    const isOptimal = optimalHours.includes(hour);
    
    return {
      isOptimal,
      message: isOptimal 
        ? '✅ 최적의 발행 시간입니다!' 
        : `⚠️ 더 좋은 시간: ${optimalHours.join(', ')}시`
    };
  }
}

// 품질 체크
export class QualityChecker {
  private minWordCount: number = 1500;
  private minImages: number = 3;
  private minHashtags: number = 5;
  private maxAIDetectionScore: number = 0.7;

  checkQuality(params: {
    title?: string;
    content?: string;
    images?: string[];
    hashtags?: string[];
    targetAge?: string;
  }): {
    overall: 'good' | 'warning' | 'error';
    scores: Record<string, number>;
    warnings: string[];
    errors: string[];
    suggestions: string[];
  } {
    const {
      title,
      content,
      images,
      hashtags,
      targetAge = 'all'
    } = params;
    
    const results: {
      overall: 'good' | 'warning' | 'error';
      scores: Record<string, number>;
      warnings: string[];
      errors: string[];
      suggestions: string[];
    } = {
      overall: 'good',
      scores: {},
      warnings: [],
      errors: [],
      suggestions: []
    };
    
    // 1. 제목 검사
    const titleCheck = this.checkTitle(title || '');
    results.scores.title = titleCheck.score;
    if (titleCheck.warnings.length > 0) {
      results.warnings.push(...titleCheck.warnings);
    }
    
    // 2. 글자수 검사
    const wordCountCheck = this.checkWordCount(content || '', targetAge);
    results.scores.wordCount = wordCountCheck.score;
    if (wordCountCheck.error) {
      results.errors.push(wordCountCheck.error);
    }
    
    // 3. 이미지 검사
    const imageCheck = this.checkImages(images || []);
    results.scores.images = imageCheck.score;
    if (imageCheck.warning) {
      results.warnings.push(imageCheck.warning);
    }
    
    // 4. 해시태그 검사
    const hashtagCheck = this.checkHashtags(hashtags || []);
    results.scores.hashtags = hashtagCheck.score;
    if (hashtagCheck.warning) {
      results.warnings.push(hashtagCheck.warning);
    }
    
    // 5. 문단 구조 검사
    const structureCheck = this.checkStructure(content || '');
    results.scores.structure = structureCheck.score;
    if (structureCheck.warnings.length > 0) {
      results.warnings.push(...structureCheck.warnings);
    }
    
    // 6. AI 탐지 검사
    const aiCheck = this.checkAIPattern(content || '');
    results.scores.aiDetection = aiCheck.score;
    if (aiCheck.warning) {
      results.warnings.push(aiCheck.warning);
    }
    
    // 전체 점수 계산
    const avgScore = Object.values(results.scores).reduce((a, b) => a + b, 0) / Object.keys(results.scores).length;
    
    if (results.errors.length > 0) {
      results.overall = 'error';
    } else if (avgScore < 0.7 || results.warnings.length > 2) {
      results.overall = 'warning';
    } else {
      results.overall = 'good';
    }
    
    results.suggestions = this.generateSuggestions(results);
    
    return results;
  }

  checkTitle(title: string): { score: number; warnings: string[] } {
    const result = { score: 1.0, warnings: [] as string[] };
    
    if (!title || title.trim().length === 0) {
      result.score = 0;
      result.warnings.push('❌ 제목이 없습니다');
      return result;
    }
    
    const length = title.trim().length;
    
    if (length < 10) {
      result.score = 0.5;
      result.warnings.push('⚠️ 제목이 너무 짧습니다 (10자 이상 권장)');
    } else if (length > 50) {
      result.score = 0.7;
      result.warnings.push('⚠️ 제목이 너무 깁니다 (50자 이하 권장)');
    }
    
    const clickWords = ['방법', '팁', '추천', '완벽', '필수', '꿀', '대박', '비법'];
    const hasClickWord = clickWords.some(word => title.includes(word));
    
    if (!hasClickWord) {
      result.score = Math.min(result.score, 0.8);
      result.warnings.push('💡 제목에 흥미를 끄는 키워드를 추가하면 좋습니다');
    }
    
    return result;
  }

  checkWordCount(content: string, targetAge: string): { score: number; error: string | null } {
    const result = { score: 1.0, error: null as string | null };
    
    if (!content) {
      result.score = 0;
      result.error = '❌ 본문이 없습니다';
      return result;
    }
    
    // HTML 태그 제거 후 순수 텍스트 글자수만 계산
    const stripHtmlTags = (html: string): string => {
      let plainText = html.replace(/<[^>]*>/g, '');
      plainText = plainText.replace(/&nbsp;/g, ' ');
      plainText = plainText.replace(/&lt;/g, '<');
      plainText = plainText.replace(/&gt;/g, '>');
      plainText = plainText.replace(/&amp;/g, '&');
      plainText = plainText.replace(/&quot;/g, '"');
      plainText = plainText.replace(/&#39;/g, "'");
      return plainText;
    };
    const plainText = stripHtmlTags(content);
    const wordCount = plainText.replace(/\s/g, '').length;
    
    const minCounts: Record<string, number> = {
      'all': 1500,
      '20s': 2000,
      '30s': 3000,
      '40s': 4000
    };
    
    const minRequired = minCounts[targetAge] || minCounts.all;
    
    if (wordCount < minRequired) {
      result.score = wordCount / minRequired;
      result.error = `❌ 글자수 부족: ${wordCount}자 (최소 ${minRequired}자 필요)`;
    } else {
      result.score = 1.0;
    }
    
    return result;
  }

  checkImages(images: string[]): { score: number; warning: string | null } {
    const result = { score: 1.0, warning: null as string | null };
    
    if (!images || images.length === 0) {
      result.score = 0.3;
      result.warning = '⚠️ 이미지가 없습니다 (최소 3개 권장)';
    } else if (images.length < this.minImages) {
      result.score = images.length / this.minImages;
      result.warning = `⚠️ 이미지가 부족합니다: ${images.length}개 (최소 ${this.minImages}개 권장)`;
    }
    
    return result;
  }

  checkHashtags(hashtags: string[] | string | undefined): { score: number; warning: string | null } {
    const result = { score: 1.0, warning: null as string | null };
    
    let count = 0;
    if (Array.isArray(hashtags)) {
      count = hashtags.length;
    } else if (typeof hashtags === 'string') {
      count = hashtags.split(/\s+/).filter(tag => tag.trim().length > 0).length;
    }
    
    if (count === 0) {
      result.score = 0.5;
      result.warning = '⚠️ 해시태그가 없습니다 (최소 5개 권장)';
    } else if (count < this.minHashtags) {
      result.score = count / this.minHashtags;
      result.warning = `⚠️ 해시태그가 부족합니다: ${count}개 (최소 ${this.minHashtags}개 권장)`;
    }
    
    return result;
  }

  checkStructure(content: string): { score: number; warnings: string[] } {
    const result = { score: 1.0, warnings: [] as string[] };
    
    if (!content) return result;
    
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    const paragraphLengths = paragraphs.map(p => p.split('\n').length);
    
    const uniqueLengths = [...new Set(paragraphLengths)];
    
    if (uniqueLengths.length < 3) {
      result.score = 0.6;
      result.warnings.push('⚠️ 문단 길이가 너무 균일합니다 (AI 티가 날 수 있음)');
    }
    
    const oneLiners = paragraphLengths.filter(len => len === 1).length;
    const oneLinerRatio = oneLiners / paragraphs.length;
    
    if (oneLinerRatio < 0.15) {
      result.score = Math.min(result.score, 0.8);
      result.warnings.push('💡 1줄 강조 문장을 더 추가하면 자연스럽습니다');
    }
    
    const headings = content.match(/^[🎯🔥💡✨📌🚀⚡💪👍📝🎨📚🌟]+\s*.+$/gm);
    const headingCount = headings ? headings.length : 0;
    
    if (headingCount < 3) {
      result.score = Math.min(result.score, 0.7);
      result.warnings.push('💡 소제목을 3개 이상 사용하면 가독성이 좋아집니다');
    }
    
    return result;
  }

  checkAIPattern(content: string): { score: number; warning: string | null } {
    const result = { score: 1.0, warning: null as string | null };
    
    if (!content) return result;
    
    let aiScore = 0;
    
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    
    const sentenceStarts = paragraphs.map(p => {
      const firstSentence = p.split(/[.!?]/)[0];
      return firstSentence.substring(0, 5);
    });
    
    const uniqueStarts = [...new Set(sentenceStarts)].length;
    if (uniqueStarts < paragraphs.length * 0.7) {
      aiScore += 0.2;
    }
    
    const formalPhrases = [
      '입니다', '습니다', '하겠습니다', '드리겠습니다',
      '말씀드리면', '정리하면', '요약하자면'
    ];
    
    let formalCount = 0;
    formalPhrases.forEach(phrase => {
      const matches = content.match(new RegExp(phrase, 'g'));
      if (matches) formalCount += matches.length;
    });
    
    if (formalCount > paragraphs.length * 0.5) {
      aiScore += 0.3;
    }
    
    const emotionalWords = ['정말', '진짜', '너무', '완전', '대박', '최고'];
    const hasEmotions = emotionalWords.some(word => content.includes(word));
    
    if (!hasEmotions) {
      aiScore += 0.2;
    }
    
    const questions = content.match(/[?？]/g);
    const questionCount = questions ? questions.length : 0;
    
    if (questionCount < 2) {
      aiScore += 0.15;
    }
    
    result.score = 1 - aiScore;
    
    if (aiScore > 0.5) {
      result.warning = '⚠️ AI가 작성한 것처럼 보일 수 있습니다. 더 자연스럽게 수정하세요.';
    }
    
    return result;
  }

  generateSuggestions(results: {
    scores: Record<string, number>;
    warnings: string[];
    errors: string[];
  }): string[] {
    const suggestions: string[] = [];
    
    if (results.scores.title < 0.8) {
      suggestions.push('제목을 더 매력적으로 수정하세요 (숫자, 궁금증 유발 단어 추가)');
    }
    
    if (results.scores.wordCount < 0.9) {
      suggestions.push('글자수를 늘려 더 자세한 정보를 제공하세요');
    }
    
    if (results.scores.images < 0.8) {
      suggestions.push('이미지를 더 추가하여 가독성을 높이세요');
    }
    
    if (results.scores.hashtags < 0.8) {
      suggestions.push('관련 해시태그를 더 추가하세요');
    }
    
    if (results.scores.structure < 0.8) {
      suggestions.push('문단 길이를 다양하게 조정하세요 (1줄, 2~3줄, 4~5줄 섞어서)');
    }
    
    if (results.scores.aiDetection < 0.7) {
      suggestions.push('더 자연스러운 표현으로 수정하세요 (감정 표현, 질문, 경험담 추가)');
    }
    
    return suggestions;
  }

  generateReport(checkResults: {
    overall: 'good' | 'warning' | 'error';
    scores: Record<string, number>;
    warnings: string[];
    errors: string[];
    suggestions: string[];
  }): string {
    const { overall, scores, warnings, errors, suggestions } = checkResults;
    
    let report = '=== 콘텐츠 품질 검사 결과 ===\n\n';
    
    const overallEmoji: Record<string, string> = {
      good: '✅',
      warning: '⚠️',
      error: '❌'
    };
    
    const overallText: Record<string, string> = {
      good: '우수',
      warning: '주의 필요',
      error: '개선 필수'
    };
    
    report += `${overallEmoji[overall]} 전체 평가: ${overallText[overall]}\n\n`;
    
    report += '📊 상세 점수:\n';
    Object.entries(scores).forEach(([key, score]) => {
      const percentage = Math.round(score * 100);
      const bar = '█'.repeat(Math.floor(score * 10)) + '░'.repeat(10 - Math.floor(score * 10));
      const label: Record<string, string> = {
        title: '제목',
        wordCount: '글자수',
        images: '이미지',
        hashtags: '해시태그',
        structure: '문단 구조',
        aiDetection: 'AI 자연스러움'
      };
      
      report += `  ${label[key] || key}: ${bar} ${percentage}%\n`;
    });
    
    if (errors.length > 0) {
      report += '\n🚨 해결해야 할 문제:\n';
      errors.forEach(error => report += `  ${error}\n`);
    }
    
    if (warnings.length > 0) {
      report += '\n⚠️ 개선 권장 사항:\n';
      warnings.forEach(warning => report += `  ${warning}\n`);
    }
    
    if (suggestions.length > 0) {
      report += '\n💡 개선 제안:\n';
      suggestions.forEach((suggestion, idx) => report += `  ${idx + 1}. ${suggestion}\n`);
    }
    
    return report;
  }

  canPublish(checkResults: { overall: string }): boolean {
    return checkResults.overall !== 'error';
  }

  confirmPublish(checkResults: {
    overall: 'good' | 'warning' | 'error';
    scores: Record<string, number>;
    warnings: string[];
    errors: string[];
    suggestions: string[];
  }): boolean {
    const report = this.generateReport(checkResults);
    
    if (checkResults.overall === 'good') {
      return confirm(`${report}\n\n바로 발행하시겠습니까?`);
    } else if (checkResults.overall === 'warning') {
      return confirm(`${report}\n\n경고가 있지만 발행하시겠습니까?`);
    } else {
      alert(`${report}\n\n치명적인 문제가 있어 발행할 수 없습니다.`);
      return false;
    }
  }
}

// 일일 포스팅 관리
export class DailyPostManager {
  private storageKey: string = 'dailyPostHistory';
  private defaultLimit: number = 3;

  getTodayKey(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  getHistory(): Record<string, Array<{ title?: string; timestamp: string; [key: string]: any }>> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  saveHistory(history: Record<string, any[]>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(history));
    } catch (error) {
      console.error('발행 기록 저장 실패:', error);
    }
  }

  getTodayCount(): number {
    const history = this.getHistory();
    const todayKey = this.getTodayKey();
    return history[todayKey] ? history[todayKey].length : 0;
  }

  canPublishToday(): boolean {
    const limit = this.getLimit();
    const todayCount = this.getTodayCount();
    return todayCount < limit;
  }

  getLimit(): number {
    try {
      const stored = localStorage.getItem('dailyPostLimit');
      return stored ? parseInt(stored) : this.defaultLimit;
    } catch {
      return this.defaultLimit;
    }
  }

  setLimit(limit: number): void {
    localStorage.setItem('dailyPostLimit', limit.toString());
  }

  addPost(postInfo: Record<string, any>): void {
    const history = this.getHistory();
    const todayKey = this.getTodayKey();
    
    if (!history[todayKey]) {
      history[todayKey] = [];
    }
    
    history[todayKey].push({
      ...postInfo,
      timestamp: new Date().toISOString()
    });
    
    this.saveHistory(history);
    this.cleanOldHistory(history);
  }

  cleanOldHistory(history: Record<string, any[]>): void {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const cleaned: Record<string, any[]> = {};
    Object.keys(history).forEach(dateKey => {
      const [year, month, day] = dateKey.split('-').map(Number);
      const recordDate = new Date(year, month - 1, day);
      
      if (recordDate >= thirtyDaysAgo) {
        cleaned[dateKey] = history[dateKey];
      }
    });
    
    this.saveHistory(cleaned);
  }

  getTodayPosts(): Array<Record<string, any>> {
    const history = this.getHistory();
    const todayKey = this.getTodayKey();
    return history[todayKey] || [];
  }

  checkBeforePublish(): boolean {
    const limit = this.getLimit();
    const todayCount = this.getTodayCount();
    const remaining = limit - todayCount;
    
    if (!this.canPublishToday()) {
      alert(`⚠️ 일일 포스팅 제한 초과\n\n오늘 ${limit}회 모두 발행했습니다.\n내일 다시 시도하거나 환경 설정에서 제한을 늘리세요.`);
      return false;
    }
    
    if (remaining <= 1) {
      return confirm(`⚠️ 오늘 남은 발행 횟수: ${remaining}회\n\n계속하시겠습니까?`);
    }
    
    return true;
  }

  getStatistics(): {
    totalPosts: number;
    last7Days: number;
    last30Days: number;
    todayPosts: number;
    averagePerDay: string;
    mostActiveDay: string | null;
    mostActiveCount: number;
  } {
    const history = this.getHistory();
    const dates = Object.keys(history).sort().reverse();
    
    const stats = {
      totalPosts: 0,
      last7Days: 0,
      last30Days: 0,
      todayPosts: this.getTodayCount(),
      averagePerDay: '0',
      mostActiveDay: null as string | null,
      mostActiveCount: 0
    };
    
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    dates.forEach(dateKey => {
      const posts = history[dateKey];
      const [year, month, day] = dateKey.split('-').map(Number);
      const recordDate = new Date(year, month - 1, day);
      
      stats.totalPosts += posts.length;
      
      if (recordDate >= sevenDaysAgo) {
        stats.last7Days += posts.length;
      }
      
      if (recordDate >= thirtyDaysAgo) {
        stats.last30Days += posts.length;
      }
      
      if (posts.length > stats.mostActiveCount) {
        stats.mostActiveCount = posts.length;
        stats.mostActiveDay = dateKey;
      }
    });
    
    if (dates.length > 0) {
      stats.averagePerDay = (stats.totalPosts / dates.length).toFixed(1);
    }
    
    return stats;
  }

  generateStatsReport(): string {
    const stats = this.getStatistics();
    const limit = this.getLimit();
    
    return `
📊 발행 통계
오늘: ${stats.todayPosts}/${limit}회
최근 7일: ${stats.last7Days}회
최근 30일: ${stats.last30Days}회
평균: ${stats.averagePerDay}회/일
${stats.mostActiveDay ? `가장 활발했던 날: ${stats.mostActiveDay} (${stats.mostActiveCount}회)` : ''}
    `.trim();
  }
}

