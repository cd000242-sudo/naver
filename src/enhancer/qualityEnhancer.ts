// 카테고리별 표현 허용 설정 + 애드포스트 최적화
const CATEGORY_RULES: Record<string, any> = {
  celebrity: {
    // 표현 제한
    maxReally: 7,
    maxHelp: 2,
    maxEmoji: 10,
    allowEmotional: true,

    // 애드포스트 최적화
    targetWordCount: 2500,        // 목표 글자 수 (광고 노출 최적화)
    minParagraphs: 8,             // 최소 문단 수 (광고 삽입 공간)
    useQuestions: true,           // 질문형 문장 (댓글 유도)
    useListFormat: true,          // 리스트 형식 (가독성)
    imagePerParagraph: 0.7,       // 문단당 이미지 비율 (체류 시간)
    cta: '궁금하신 점 댓글로 알려주세요!',  // CTA (참여 유도)
    adKeywords: ['연예인', '스타', '화제', '근황', '패션', '뷰티'],  // 고단가 키워드
  },

  finance: {
    maxReally: 3,
    maxHelp: 1,
    maxEmoji: 3,
    allowEmotional: false,

    // 애드포스트 최적화 (재테크는 광고 단가 최고!)
    targetWordCount: 3000,        // 긴 글 = 더 많은 광고
    minParagraphs: 10,
    useQuestions: true,
    useListFormat: true,          // 투자 방법 등 리스트화
    imagePerParagraph: 0.5,
    cta: '이 정보가 도움되셨다면 공유 부탁드립니다!',
    adKeywords: ['투자', '재테크', '수익', '절세', '부동산', '주식', 'ETF', '펀드'],  // 초고단가
  },

  parenting: {
    maxReally: 6,
    maxHelp: 2,
    maxEmoji: 8,
    allowEmotional: true,

    // 애드포스트 최적화
    targetWordCount: 2800,
    minParagraphs: 9,
    useQuestions: true,           // 육아 고민 질문 (공감 유도)
    useListFormat: true,
    imagePerParagraph: 0.8,       // 육아는 이미지 중요
    cta: '다른 엄마/아빠들은 어떻게 하시나요? 댓글로 공유해주세요!',
    adKeywords: ['육아', '아이', '교육', '장난감', '유아용품', '분유'],
  },

  travel: {
    maxReally: 5,
    maxHelp: 1,
    maxEmoji: 7,
    allowEmotional: true,

    // 애드포스트 최적화
    targetWordCount: 2600,
    minParagraphs: 8,
    useQuestions: true,
    useListFormat: true,
    imagePerParagraph: 1.0,       // 여행은 이미지 필수!
    cta: '여러분의 여행 팁도 댓글로 알려주세요!',
    adKeywords: ['여행', '맛집', '호텔', '숙소', '항공권', '패키지'],
  },

  lifestyle: {
    maxReally: 5,
    maxHelp: 1,
    maxEmoji: 6,
    allowEmotional: true,

    // 애드포스트 최적화
    targetWordCount: 2400,
    minParagraphs: 8,
    useQuestions: true,
    useListFormat: true,
    imagePerParagraph: 0.6,
    cta: '일상 속 작은 팁, 댓글로 나눠주세요!',
    adKeywords: ['라이프스타일', '일상', '루틴', '홈카페', '인테리어'],
  },

  default: {
    maxReally: 5,
    maxHelp: 1,
    maxEmoji: 5,
    allowEmotional: true,
    targetWordCount: 2500,
    minParagraphs: 8,
    useQuestions: true,
    useListFormat: true,
    imagePerParagraph: 0.7,
    cta: '도움이 되셨나요? 댓글로 의견 남겨주세요!',
    adKeywords: [],
  },
};

export class QualityEnhancer {
  async enhance(content: any): Promise<any> {
    console.log('🎨 품질 강화 시작');
    const startTime = Date.now();

    // 카테고리 가져오기
    const category = content.metadata?.category || content.category || 'default';
    console.log(`📂 카테고리: ${category}`);

    const [seoEnhanced, readabilityEnhanced, aiSafe] = await Promise.all([
      Promise.resolve(this.enhanceSEO(content)),
      Promise.resolve(this.enhanceReadability(content)),
      Promise.resolve(this.avoidAIDetection(content, category)),
    ]);

    // 병합
    let enhanced = {
      ...content,
      ...seoEnhanced,
      body: aiSafe.body,
      readability: readabilityEnhanced.readability,
      seo: seoEnhanced.seo,
      aiDetection: aiSafe.aiDetection,
    };

    // ✅ 애드포스트 최적화 추가!
    enhanced = this.optimizeForAdPost(enhanced, category);

    const elapsed = Date.now() - startTime;
    console.log(`✅ 품질 강화 완료: ${elapsed}ms`);

    return enhanced;
  }

  private enhanceSEO(content: any): any {
    const { title, body, hashtags = [] } = content;
    return {
      ...content,
      title: this.optimizeTitle(title),
      seo: {
        keywordDensity: this.calculateKeywordDensity(body, hashtags),
        metaDescription: this.generateMetaDescription(body),
        score: this.calculateSEOScore(content),
      },
    };
  }

  private enhanceReadability(content: any): any {
    let { body } = content;
    body = this.addParagraphs(body);
    body = this.highlightHeadings(body);
    return {
      ...content,
      body,
      readability: {
        score: this.calculateReadabilityScore(body),
        estimatedReadTime: this.estimateReadTime(body),
      },
    };
  }

  private avoidAIDetection(content: any, category: string = 'default'): any {
    let { body } = content;

    const rules = CATEGORY_RULES[category] || CATEGORY_RULES.default;
    console.log(`🎨 AI 표현 최적화 (카테고리: ${category})`);

    // ✅ [핵심 추가] HTML 태그 제거 (AI가 생성한 <u>, <b>, <strong>, <em> 등 제거)
    // 태그가 텍스트로 노출되는 문제 해결 (예: <u>직전</u> → 직전)
    const htmlTagsRemoved = body.replace(/<\/?u>/gi, '')
      .replace(/<\/?b>/gi, '')
      .replace(/<\/?strong>/gi, '')
      .replace(/<\/?em>/gi, '')
      .replace(/<\/?i>/gi, '')
      .replace(/<\/?mark>/gi, '')
      .replace(/<\/?s>/gi, '')
      .replace(/<\/?strike>/gi, '');

    if (htmlTagsRemoved !== body) {
      console.log(`  ✓ HTML 인라인 태그 제거 완료 (<u>, <b>, <strong> 등)`);
      body = htmlTagsRemoved;
    }

    // 1. "도움이 되었으면..." - 카테고리별 제한
    const helpMatches = body.match(/도움이 되었으면 좋겠습니다\.?\s*/g);
    if (helpMatches && helpMatches.length > rules.maxHelp) {
      let count = 0;
      body = body.replace(/도움이 되었으면 좋겠습니다\.?\s*/g, (match: string) => {
        count++;
        return count <= rules.maxHelp ? match : '';
      });
      console.log(`  ✓ "도움이..." ${helpMatches.length}개 → ${rules.maxHelp}개`);
    }

    // 2. "정말" - 카테고리별 제한
    const reallyMatches = body.match(/정말 /g);
    if (reallyMatches && reallyMatches.length > rules.maxReally) {
      let count = 0;
      const keepRatio = rules.maxReally / reallyMatches.length;
      body = body.replace(/정말 /g, (match: string) => {
        count++;
        return Math.random() < keepRatio ? match : '';
      });
      console.log(`  ✓ "정말" ${reallyMatches.length}개 → ~${rules.maxReally}개`);
    }

    // 3. 이모지 - 카테고리별 제한 (유니코드 이모지 범위 사용)
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojiMatches = body.match(emojiRegex);
    if (emojiMatches && emojiMatches.length > rules.maxEmoji) {
      let count = 0;
      body = body.replace(emojiRegex, (match: string) => {
        count++;
        return count <= rules.maxEmoji ? match : '';
      });
      console.log(`  ✓ 이모지 ${emojiMatches.length}개 → ${rules.maxEmoji}개`);
    }

    // 4. 같은 패턴 반복 다양화
    const patternMatches = body.match(/정말 [^\.!?]*인 것 같아요\.?/g);
    if (patternMatches && patternMatches.length > 2) {
      const alternatives = rules.allowEmotional
        ? [
          '확실히 좋은 변화입니다.',
          '기대되는 부분이네요.',
          '주목할 만한 변화입니다.',
          '정말 반가운 소식이에요.',
          '눈여겨볼 만합니다.',
        ]
        : [
          '확실히 긍정적입니다.',
          '주목할 만합니다.',
          '눈여겨볼 필요가 있습니다.',
          '중요한 변화입니다.',
          '실질적인 개선입니다.',
        ];

      let altIndex = 0;
      body = body.replace(/정말 [^\.!?]*인 것 같아요\.?/g, (match: string) => {
        if (altIndex === 0) {
          altIndex++;
          return match;
        }
        const replacement = alternatives[(altIndex - 1) % alternatives.length];
        altIndex++;
        return replacement;
      });
    }

    // 5. 연속 동일 표현 제거
    body = body.replace(/([^\.!?]+[\.!?])\s*\1/g, '$1');

    // 6. 기본 AI 표현 교체
    const basicAI = [
      { from: /물론입니다/g, to: '그렇습니다' },
      { from: /확실히 말씀드리자면/g, to: '실제로' },
      { from: /~것입니다(?!\s*\.)/g, to: '~합니다' },
    ];

    basicAI.forEach(({ from, to }) => {
      body = body.replace(from, to);
    });

    // 7. 공백 정리
    body = body.replace(/\n{3,}/g, '\n\n');
    body = body.replace(/\s{2,}/g, ' ');
    body = body.trim();

    console.log(`  ✅ AI 표현 최적화 완료`);

    return {
      ...content,
      body,
      aiDetection: {
        risk: 'low',
        score: this.calculateAIDetectionRisk(body),
      },
    };
  }

  private optimizeTitle(title: string): string {
    if (title.length > 35) {
      return title.slice(0, 32) + '...';
    }
    return title;
  }

  private calculateKeywordDensity(body: string, hashtags: string[]): number {
    const words = body.split(/\s+/).length;
    let keywordCount = 0;
    hashtags.forEach(tag => {
      const regex = new RegExp(tag.replace('#', ''), 'gi');
      const matches = body.match(regex);
      keywordCount += matches ? matches.length : 0;
    });

    return (keywordCount / words) * 100;
  }

  private generateMetaDescription(body: string): string {
    const sentences = body.split(/[.!?]/);
    const firstSentences = sentences.slice(0, 2).join('. ');
    return firstSentences.slice(0, 150) + '...';
  }

  private calculateSEOScore(content: any): number {
    let score = 50;
    if (content.title && content.title.length >= 25 && content.title.length <= 35) {
      score += 10;
    }
    if (content.hashtags && content.hashtags.length >= 5) {
      score += 10;
    }
    if (content.body && content.body.length >= 1500) {
      score += 10;
    }
    if (content.images && content.images.length >= 3) {
      score += 10;
    }

    const h2Count = (content.body?.match(/<h2>/g) || []).length;
    if (h2Count >= 3) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  private addParagraphs(body: string): string {
    return body.replace(/(.{200,}?[.!?])/g, '$1</p><p>');
  }

  private highlightHeadings(body: string): string {
    return body.replace(/##\s*(.+)/g, '<h2>$1</h2>');
  }

  private calculateReadabilityScore(body: string): number {
    const sentences = body.split(/[.!?]/).length;
    const words = body.split(/\s+/).length;
    const avgWordsPerSentence = words / sentences;
    if (avgWordsPerSentence >= 15 && avgWordsPerSentence <= 25) {
      return 90;
    } else if (avgWordsPerSentence < 10 || avgWordsPerSentence > 35) {
      return 50;
    } else {
      return 70;
    }
  }

  private estimateReadTime(body: string): string {
    const words = body.split(/\s+/).length;
    const minutes = Math.ceil(words / 200);
    return `${minutes}분`;
  }

  private calculateAIDetectionRisk(body: string): number {
    const aiPhrases = ['물론', '확실히', '것입니다', '하겠습니다'];
    let count = 0;
    aiPhrases.forEach(phrase => {
      const matches = body.match(new RegExp(phrase, 'g'));
      count += matches ? matches.length : 0;
    });

    if (count === 0) return 5;
    if (count <= 3) return 20;
    if (count <= 7) return 50;
    return 80;
  }

  /**
   * 애드포스트 수익 최적화
   */
  private optimizeForAdPost(content: any, category: string): any {
    const rules = CATEGORY_RULES[category] || CATEGORY_RULES.default;
    let { body, title, hashtags = [] } = content;
    console.log('💰 애드포스트 수익 최적화 시작');

    // 1. 글자 수 최적화 (광고 노출 최대화)
    const currentLength = body.length;
    if (currentLength < rules.targetWordCount) {
      console.log(`  ⚠️ 글자 수 부족: ${currentLength}자 (목표: ${rules.targetWordCount}자)`);
      // 글이 짧으면 경고 (재생성 권장)
    } else {
      console.log(`  ✅ 글자 수 적정: ${currentLength}자`);
    }

    // 2. 문단 구조 최적화 (광고 삽입 공간)
    const paragraphs = body.split('</p>').filter((p: string) => p.trim());
    if (paragraphs.length < rules.minParagraphs) {
      console.log(`  ⚠️ 문단 수 부족: ${paragraphs.length}개 (최소: ${rules.minParagraphs}개)`);
    }

    // 3. 리스트 형식 추가 (가독성 + 체류 시간)
    if (rules.useListFormat) {
      body = this.addListFormatting(body);
    }

    // 4. 질문형 문장 추가 (댓글 유도 = 재방문)
    if (rules.useQuestions) {
      body = this.addEngagementQuestions(body, category);
    }

    // 5. CTA 추가 (참여 유도)
    if (rules.cta && !body.includes(rules.cta)) {
      body += `\n\n<p>${rules.cta}</p>`;
    }

    // 6. 고단가 키워드 자연스럽게 삽입
    if (rules.adKeywords.length > 0) {
      hashtags = this.optimizeHashtags(hashtags, rules.adKeywords);
    }

    // 7. 제목 SEO 최적화 (클릭률 향상)
    title = this.optimizeTitleForSEO(title, rules.adKeywords);

    console.log('  ✅ 애드포스트 최적화 완료');

    return {
      ...content,
      body,
      title,
      hashtags,
      adPostOptimized: {
        wordCount: body.length,
        paragraphs: paragraphs.length,
        estimatedAdSlots: Math.floor(paragraphs.length / 3), // 3문단당 광고 1개
        keywords: rules.adKeywords,
      },
    };
  }

  /**
   * 리스트 형식 추가
   */
  private addListFormatting(body: string): string {
    // "첫째", "둘째", "셋째" 또는 "1.", "2.", "3." 패턴을 <ul><li>로 변환
    body = body.replace(/([1-9]\.\s+[^\n]+)/g, '<li>$1</li>');
    const listMatches = body.match(/(<li>.*?<\/li>)/g);
    if (listMatches && listMatches.length > 0) {
      // 연속된 li 태그를 ul로 감싸기
      body = body.replace(/(<li>.*?<\/li>\s*)+/g, (match) => {
        if (match.match(/<ul>/)) return match; // 이미 ul로 감싸져 있으면 스킵
        return `<ul>${match}</ul>`;
      });
    }

    return body;
  }

  /**
   * 참여 유도 질문 추가
   */
  private addEngagementQuestions(body: string, category: string): string {
    const questions: Record<string, string[]> = {
      celebrity: [
        '여러분은 어떻게 생각하시나요?',
        '이 소식, 놀랍지 않나요?',
        '다들 어떤 반응이신가요?',
      ],
      finance: [
        '여러분은 어떤 전략을 사용하시나요?',
        '이 방법, 시도해볼 만하지 않을까요?',
        '투자 경험 공유해주시겠어요?',
      ],
      parenting: [
        '다른 부모님들은 어떻게 하시나요?',
        '비슷한 고민 있으신가요?',
        '효과 있는 방법 아시는 분?',
      ],
      travel: [
        '이 장소 가보신 분 계신가요?',
        '추천하고 싶은 곳 있으세요?',
        '여행 팁 공유해주실래요?',
      ],
      lifestyle: [
        '여러분의 루틴은 어떤가요?',
        '이 방법 시도해보셨나요?',
        '일상 속 팁 공유해주세요!',
      ],
    };

    const categoryQuestions = questions[category] || questions.lifestyle;
    const randomQuestion = categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];

    // 글 중간에 자연스럽게 삽입
    const paragraphs = body.split('</p>');
    if (paragraphs.length > 3) {
      const insertIndex = Math.floor(paragraphs.length / 2);
      paragraphs[insertIndex] += `\n\n<p>${randomQuestion}</p>`;
    }

    return paragraphs.join('</p>');
  }

  /**
   * 해시태그 최적화 (고단가 키워드)
   */
  private optimizeHashtags(hashtags: string[], adKeywords: string[]): string[] {
    // 기존 해시태그 + 고단가 키워드 결합
    const optimized = [...hashtags];

    adKeywords.forEach(keyword => {
      const tag = keyword.startsWith('#') ? keyword : `#${keyword}`;
      if (!optimized.includes(tag)) {
        optimized.push(tag);
      }
    });

    // 최대 15개로 제한
    return optimized.slice(0, 15);
  }

  /**
   * 제목 SEO 최적화
   */
  private optimizeTitleForSEO(title: string, adKeywords: string[]): string {
    // 제목에 고단가 키워드가 없으면 추가
    if (adKeywords.length > 0) {
      const hasKeyword = adKeywords.some(kw =>
        title.toLowerCase().includes(kw.toLowerCase())
      );

      if (!hasKeyword && title.length < 25) {
        // 키워드 자연스럽게 추가
        const keyword = adKeywords[0];
        title = `${title.replace(/[?!]$/, '')}: ${keyword} 완벽 가이드`;
      }
    }

    // 제목 길이 최적화 (25-35자)
    if (title.length > 35) {
      title = title.slice(0, 32) + '...';
    }

    return title;
  }
}

export const qualityEnhancer = new QualityEnhancer();

