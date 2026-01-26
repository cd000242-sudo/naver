// ✅ 자동 내부링크 삽입 기능
// 이전 발행글 중 관련 글을 자동으로 연결하여 체류시간 증가

export type PublishedPost = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
  category?: string;
  publishedAt: string;
};

export type InternalLink = {
  postId: string;
  title: string;
  url: string;
  relevanceScore: number;
  matchedKeywords: string[];
};

export type LinkInsertionResult = {
  originalContent: string;
  modifiedContent: string;
  insertedLinks: InternalLink[];
  insertionPoints: Array<{ position: number; link: InternalLink }>;
};

export class InternalLinkManager {
  private publishedPosts: Map<string, PublishedPost> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  // ✅ 로컬 스토리지에서 데이터 로드
  private loadFromStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      const dataPath = path.join(app.getPath('userData'), 'published-posts-links.json');
      if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        this.publishedPosts = new Map(Object.entries(data.posts || {}));
      }
    } catch (error) {
      console.log('[InternalLinkManager] 저장된 데이터 없음');
    }
  }

  // ✅ 로컬 스토리지에 데이터 저장
  private saveToStorage(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');

      const dataPath = path.join(app.getPath('userData'), 'published-posts-links.json');
      const data = {
        posts: Object.fromEntries(this.publishedPosts),
        lastSaved: new Date().toISOString(),
      };
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[InternalLinkManager] 저장 실패:', error);
    }
  }

  // ✅ 발행된 글 등록
  addPublishedPost(post: PublishedPost): void {
    this.publishedPosts.set(post.id, post);
    this.saveToStorage();
    console.log(`[InternalLinkManager] 글 등록: ${post.title}`);
  }

  // ✅ URL에서 글 등록 (자동 키워드 추출)
  addPostFromUrl(url: string, title: string, content?: string, category?: string): void {
    const id = this.extractPostId(url);
    if (!id) return;

    const keywords = this.extractKeywords(title, content);

    const post: PublishedPost = {
      id,
      title,
      url,
      keywords,
      category,  // ✅ 카테고리 저장
      publishedAt: new Date().toISOString(),
    };

    this.addPublishedPost(post);
    console.log(`[InternalLinkManager] 글 등록: ${post.title} (카테고리: ${category || '없음'})`);
  }

  // ✅ URL에서 포스트 ID 추출
  private extractPostId(url: string): string | null {
    const match = url.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
    if (match) {
      return `${match[1]}_${match[2]}`;
    }
    return `post_${Date.now()}`;
  }

  // ✅ 제목/내용에서 키워드 추출
  private extractKeywords(title: string, content?: string): string[] {
    const text = `${title} ${content || ''}`;

    // 불용어 제거
    const stopWords = ['은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과', '도', '만', '까지', '부터', '에게', '한테', '께', '보다', '처럼', '같이', '대해', '대한', '위한', '통한', '관한', '있는', '없는', '하는', '되는', '된', '할', '될', '하고', '되고', '그리고', '하지만', '그러나', '또한', '및', '등', '것', '수', '때', '중', '후', '전', '내', '외', '더', '가장', '매우', '정말', '진짜', '너무', '아주', '완전'];

    // 단어 추출 (2글자 이상)
    const words = text
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.includes(w));

    // 빈도수 계산
    const wordCount: Record<string, number> = {};
    words.forEach(w => {
      wordCount[w] = (wordCount[w] || 0) + 1;
    });

    // 상위 10개 키워드 반환
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  // ✅ 관련 글 찾기 (카테고리 필터링 지원)
  findRelatedPosts(title: string, content: string, maxResults: number = 5, categoryFilter?: string): InternalLink[] {
    const currentKeywords = this.extractKeywords(title, content);
    const results: InternalLink[] = [];

    for (const [id, post] of this.publishedPosts) {
      // 자기 자신 제외
      if (post.title === title) continue;

      // ✅ 카테고리 필터링 (카테고리가 지정되었으면 같은 카테고리만)
      if (categoryFilter && post.category !== categoryFilter) continue;

      // 키워드 매칭
      const matchedKeywords = currentKeywords.filter(kw =>
        post.keywords.includes(kw) ||
        post.title.toLowerCase().includes(kw.toLowerCase())
      );

      if (matchedKeywords.length > 0) {
        // 관련도 점수 계산
        const relevanceScore = this.calculateRelevance(currentKeywords, post, matchedKeywords);

        results.push({
          postId: id,
          title: post.title,
          url: post.url,
          relevanceScore,
          matchedKeywords,
        });
      }
    }

    // 관련도 순으로 정렬
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  // ✅ 관련도 점수 계산
  private calculateRelevance(currentKeywords: string[], post: PublishedPost, matchedKeywords: string[]): number {
    let score = 0;

    // 매칭된 키워드 수 (최대 50점)
    score += Math.min(50, matchedKeywords.length * 10);

    // 제목에 키워드 포함 여부 (최대 30점)
    const titleMatches = currentKeywords.filter(kw =>
      post.title.toLowerCase().includes(kw.toLowerCase())
    ).length;
    score += Math.min(30, titleMatches * 15);

    // 최근 발행 글 보너스 (최대 20점)
    const daysSincePublish = (Date.now() - new Date(post.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublish < 7) score += 20;
    else if (daysSincePublish < 30) score += 10;
    else if (daysSincePublish < 90) score += 5;

    return Math.min(100, score);
  }

  // ✅ 콘텐츠에 내부링크 자동 삽입 (같은 카테고리 우선)
  insertInternalLinks(
    content: string,
    title: string,
    options: { maxLinks?: number; insertAtEnd?: boolean; linkStyle?: 'text' | 'card'; categoryFilter?: string } = {}
  ): LinkInsertionResult {
    const { maxLinks = 3, insertAtEnd = true, linkStyle = 'text', categoryFilter } = options;

    // ✅ 카테고리 필터가 있으면 같은 카테고리 글만 검색
    const relatedPosts = this.findRelatedPosts(title, content, maxLinks, categoryFilter);
    console.log(`[InternalLinkManager] 이전글엮기: 카테고리="${categoryFilter || '전체'}", 결과=${relatedPosts.length}개`);


    if (relatedPosts.length === 0) {
      return {
        originalContent: content,
        modifiedContent: content,
        insertedLinks: [],
        insertionPoints: [],
      };
    }

    let modifiedContent = content;
    const insertionPoints: Array<{ position: number; link: InternalLink }> = [];

    if (insertAtEnd) {
      // 글 끝에 관련 글 섹션 추가
      const linkSection = this.generateLinkSection(relatedPosts, linkStyle);
      modifiedContent = `${content}\n\n${linkSection}`;

      insertionPoints.push({
        position: content.length,
        link: relatedPosts[0],
      });
    } else {
      // 본문 중간에 자연스럽게 삽입 (소제목 사이)
      const headingPattern = /<h[23][^>]*>.*?<\/h[23]>/gi;
      const headings = content.match(headingPattern) || [];

      if (headings.length >= 2 && relatedPosts.length > 0) {
        // 두 번째 소제목 앞에 첫 번째 관련 글 삽입
        const secondHeadingIndex = content.indexOf(headings[1]);
        if (secondHeadingIndex > 0) {
          const linkHtml = this.generateSingleLink(relatedPosts[0], linkStyle);
          modifiedContent =
            content.slice(0, secondHeadingIndex) +
            `\n${linkHtml}\n\n` +
            content.slice(secondHeadingIndex);

          insertionPoints.push({
            position: secondHeadingIndex,
            link: relatedPosts[0],
          });
        }
      }

      // 나머지는 끝에 추가
      if (relatedPosts.length > 1) {
        const remainingLinks = relatedPosts.slice(1);
        const linkSection = this.generateLinkSection(remainingLinks, linkStyle);
        modifiedContent = `${modifiedContent}\n\n${linkSection}`;
      }
    }

    return {
      originalContent: content,
      modifiedContent,
      insertedLinks: relatedPosts,
      insertionPoints,
    };
  }

  // ✅ 관련 글 섹션 HTML 생성
  private generateLinkSection(links: InternalLink[], style: 'text' | 'card'): string {
    if (links.length === 0) return '';

    if (style === 'card') {
      const cards = links.map(link => `
        <div style="padding: 1rem; margin: 0.5rem 0; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #03c75a;">
          <p style="margin: 0; font-weight: bold;">
            <a href="${link.url}" style="color: #03c75a; text-decoration: none;">📖 ${link.title}</a>
          </p>
        </div>
      `).join('');

      return `
        <div style="margin-top: 2rem; padding: 1.5rem; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h3 style="margin-top: 0; color: #333;">📚 함께 보면 좋은 글</h3>
          ${cards}
        </div>
      `;
    }

    // 텍스트 스타일
    const linkList = links.map(link =>
      `👉 <a href="${link.url}" style="color: #03c75a;">${link.title}</a>`
    ).join('<br>');

    return `
      <div style="margin-top: 2rem; padding: 1rem; background: #f0f7f0; border-radius: 8px;">
        <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #333;">📚 함께 보면 좋은 글</p>
        <p style="margin: 0; line-height: 1.8;">${linkList}</p>
      </div>
    `;
  }

  // ✅ 단일 링크 HTML 생성
  private generateSingleLink(link: InternalLink, style: 'text' | 'card'): string {
    if (style === 'card') {
      return `
        <div style="padding: 1rem; margin: 1rem 0; background: #f0f7f0; border-radius: 8px; border-left: 4px solid #03c75a;">
          <p style="margin: 0;">
            💡 <strong>관련 글:</strong> 
            <a href="${link.url}" style="color: #03c75a;">${link.title}</a>
          </p>
        </div>
      `;
    }

    return `<p style="margin: 1rem 0; padding: 0.5rem; background: #f8f9fa; border-radius: 4px;">💡 <strong>관련 글:</strong> <a href="${link.url}" style="color: #03c75a;">${link.title}</a></p>`;
  }

  // ✅ 모든 발행 글 가져오기
  getAllPosts(): PublishedPost[] {
    return Array.from(this.publishedPosts.values())
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  // ✅ 글 삭제
  removePost(postId: string): void {
    this.publishedPosts.delete(postId);
    this.saveToStorage();
  }

  // ✅ 모든 데이터 초기화
  clearAll(): void {
    this.publishedPosts.clear();
    this.saveToStorage();
  }

  // ✅ 통계
  getStats(): { totalPosts: number; totalKeywords: number; avgKeywordsPerPost: number } {
    const posts = this.getAllPosts();
    const totalKeywords = posts.reduce((sum, p) => sum + p.keywords.length, 0);

    return {
      totalPosts: posts.length,
      totalKeywords,
      avgKeywordsPerPost: posts.length > 0 ? Math.round(totalKeywords / posts.length) : 0,
    };
  }

  // ✅ 카테고리별 글 목록 조회
  getPostsByCategory(category: string): PublishedPost[] {
    return this.getAllPosts().filter(p => p.category === category);
  }

  // ✅ 모든 카테고리 목록 조회
  getAllCategories(): string[] {
    const categories = new Set<string>();
    for (const post of this.publishedPosts.values()) {
      if (post.category) categories.add(post.category);
    }
    return Array.from(categories).sort();
  }

  // ✅ 글에 카테고리 업데이트
  updatePostCategory(postId: string, category: string): boolean {
    const post = this.publishedPosts.get(postId);
    if (post) {
      post.category = category;
      this.saveToStorage();
      console.log(`[InternalLinkManager] 카테고리 업데이트: ${post.title} → ${category}`);
      return true;
    }
    return false;
  }

  // ✅ 기존 글 자동 카테고리 분류 (키워드 기반)
  autoCategorizeAllPosts(): { updated: number; total: number; results: Array<{ postId: string; title: string; category: string }> } {
    const categoryKeywords: Record<string, string[]> = {
      // 엔터테인먼트·예술
      '문학·책': ['책', '소설', '작가', '문학', '베스트셀러', '독서', '서평'],
      '영화': ['영화', '개봉', '흥행', '배우', '감독', '시사회', '박스오피스'],
      '미술·디자인': ['미술', '디자인', '전시회', '아트', '작품', '갤러리'],
      '공연·전시': ['공연', '전시', '콘서트', '뮤지컬', '연극', '티켓'],
      '음악': ['음악', '앨범', '가수', '아이돌', '차트', '신곡', '컴백'],
      '드라마': ['드라마', '방송', '시청률', '회차', 'OST'],
      '스타·연예인': ['연예인', '스타', '아이돌', '셀럽', '팬', '열애', '결혼'],
      '만화·애니': ['만화', '애니', '웹툰', '애니메이션'],
      '방송': ['방송', 'TV', '예능', '라디오'],
      // 생활·노하우·쇼핑
      '일상·생각': ['일상', '생각', '일기', '하루'],
      '생활 꿀팁': ['꿀팁', '팁', '노하우', '방법', '추천'],
      '육아·결혼': ['육아', '결혼', '아이', '임신', '출산', '웨딩'],
      '반려동물': ['반려동물', '강아지', '고양이', '펫', '동물'],
      '좋은글·이미지': ['명언', '좋은글', '감동'],
      '패션·미용': ['패션', '미용', '코디', '스타일', '옷', '화장품', '메이크업'],
      '인테리어·DIY': ['인테리어', 'DIY', '홈', '가구', '리빙', '집꾸미기'],
      '요리·레시피': ['요리', '레시피', '음식', '맛집', '베이킹'],
      '상품리뷰': ['리뷰', '후기', '언박싱', '제품', '구매', '가전', '가성비'],
      '원예·재배': ['원예', '재배', '식물', '화분', '가드닝'],
      // 취미·여가·여행
      '게임': ['게임', '플레이', '공략', '캐릭터'],
      '스포츠': ['스포츠', '축구', '야구', '농구', '운동', '헬스'],
      '사진': ['사진', '카메라', '촬영', '포토'],
      '자동차': ['자동차', '차량', '시승', '출시', '신차'],
      '취미': ['취미', '공예', '악기', '수집'],
      '국내여행': ['국내여행', '여행', '관광', '숙소', '호텔'],
      '세계여행': ['세계여행', '해외여행', '해외', '유럽', '동남아'],
      '맛집': ['맛집', '카페', '디저트', '식당', '먹방'],
      // 지식·동향
      'IT·컴퓨터': ['IT', '컴퓨터', '프로그래밍', '코딩', 'AI', '개발', '앱'],
      '사회·정치': ['사회', '정치', '뉴스', '이슈', '시사'],
      '건강·의학': ['건강', '의학', '병원', '치료', '다이어트', '운동'],
      '비즈니스·경제': ['비즈니스', '경제', '투자', '주식', '부업', '재테크', '창업'],
      '어학·외국어': ['어학', '외국어', '영어', '일본어', '중국어', '토익'],
      '교육·학문': ['교육', '학문', '대학', '입시', '자격증', '공부'],
      '부동산': ['부동산', '아파트', '전세', '월세', '분양', '청약'],
      '자기계발': ['자기계발', '성장', '동기부여', '습관', '목표'],
    };

    const results: Array<{ postId: string; title: string; category: string }> = [];
    let updated = 0;

    for (const [id, post] of this.publishedPosts) {
      // 이미 카테고리가 있는 글은 건너뛰기
      if (post.category) continue;

      const titleLower = post.title.toLowerCase();
      const keywordsStr = post.keywords.join(' ').toLowerCase();
      const combinedText = `${titleLower} ${keywordsStr}`;

      let bestCategory = '';
      let bestScore = 0;

      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        let score = 0;
        for (const keyword of keywords) {
          if (combinedText.includes(keyword.toLowerCase())) {
            score += 1;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestCategory = category;
        }
      }

      if (bestCategory && bestScore >= 1) {
        post.category = bestCategory;
        results.push({ postId: id, title: post.title, category: bestCategory });
        updated++;
        console.log(`[InternalLinkManager] 자동 분류: "${post.title}" → ${bestCategory} (점수: ${bestScore})`);
      }
    }

    if (updated > 0) {
      this.saveToStorage();
    }

    console.log(`[InternalLinkManager] 자동 분류 완료: ${updated}/${this.publishedPosts.size}개 글 분류됨`);
    return { updated, total: this.publishedPosts.size, results };
  }

  // ✅ 분류되지 않은 글 목록 조회
  getUncategorizedPosts(): PublishedPost[] {
    return this.getAllPosts().filter(p => !p.category);
  }

  // ✅ 카테고리명 정규화 매핑 (영어/다른 형식 → 표준 한글)
  private getCategoryNormalizationMap(): Record<string, string> {
    return {
      // 영어 → 한글
      'celebrity': '스타·연예인',
      'entertainment': '스타·연예인',
      'star': '스타·연예인',
      'business_economy': '비즈니스·경제',
      'business': '비즈니스·경제',
      'economy': '비즈니스·경제',
      'finance': '비즈니스·경제',
      'it_computer': 'IT·컴퓨터',
      'it': 'IT·컴퓨터',
      'tech': 'IT·컴퓨터',
      'technology': 'IT·컴퓨터',
      'health': '건강·의학',
      'medical': '건강·의학',
      'travel': '국내여행',
      'food': '맛집',
      'restaurant': '맛집',
      'beauty': '패션·미용',
      'fashion': '패션·미용',
      'game': '게임',
      'gaming': '게임',
      'sports': '스포츠',
      'sport': '스포츠',
      'movie': '영화',
      'movies': '영화',
      'drama': '드라마',
      'music': '음악',
      'pet': '반려동물',
      'pets': '반려동물',
      'parenting': '육아·결혼',
      'interior': '인테리어·DIY',
      'diy': '인테리어·DIY',
      'review': '상품리뷰',
      'reviews': '상품리뷰',
      'education': '교육·학문',
      'realestate': '부동산',
      'real_estate': '부동산',
      'cooking': '요리·레시피',
      'recipe': '요리·레시피',
      'car': '자동차',
      'cars': '자동차',
      'auto': '자동차',

      // 슬래시 형식 변환
      '인테리어/리빙': '인테리어·DIY',
      '인테리어/DIY': '인테리어·DIY',
      '가전리뷰': '상품리뷰',
      '가전 리뷰': '상품리뷰',
      '트렌드 및 이슈': '사회·정치',
      '트렌드및이슈': '사회·정치',
      '연예/라이프': '스타·연예인',
      '연예/이슈': '스타·연예인',

      // 언더스코어/하이픈 형식 변환
      '스타_연예인': '스타·연예인',
      '스타-연예인': '스타·연예인',
      '비즈니스_경제': '비즈니스·경제',
      '비즈니스-경제': '비즈니스·경제',
      'IT_컴퓨터': 'IT·컴퓨터',
      'IT-컴퓨터': 'IT·컴퓨터',
    };
  }

  // ✅ 모든 글의 카테고리명 정규화 (영어/이상한 형식 → 표준 한글)
  normalizeAllCategories(): { updated: number; total: number; results: Array<{ postId: string; title: string; before: string; after: string }> } {
    const normMap = this.getCategoryNormalizationMap();
    const results: Array<{ postId: string; title: string; before: string; after: string }> = [];
    let updated = 0;

    for (const [id, post] of this.publishedPosts) {
      if (!post.category) continue;

      const originalCategory = post.category;
      const lowerCategory = originalCategory.toLowerCase().trim();

      // 매핑 테이블에서 찾기
      let normalizedCategory = normMap[lowerCategory] || normMap[originalCategory];

      // 없으면 원본 그대로 유지
      if (!normalizedCategory) {
        // 표준 카테고리인지 확인
        const standardCategories = [
          '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송',
          '일상·생각', '생활 꿀팁', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
          '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
          'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문', '부동산', '자기계발'
        ];
        if (standardCategories.includes(originalCategory)) continue; // 이미 표준 형식
        continue;
      }

      // 변경 필요한 경우
      if (normalizedCategory !== originalCategory) {
        post.category = normalizedCategory;
        results.push({ postId: id, title: post.title, before: originalCategory, after: normalizedCategory });
        updated++;
        console.log(`[InternalLinkManager] 카테고리 정규화: "${originalCategory}" → "${normalizedCategory}"`);
      }
    }

    if (updated > 0) {
      this.saveToStorage();
    }

    console.log(`[InternalLinkManager] 정규화 완료: ${updated}개 카테고리 변환됨`);
    return { updated, total: this.publishedPosts.size, results };
  }
}
