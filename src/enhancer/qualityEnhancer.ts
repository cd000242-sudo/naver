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

    // ✅ [2026-03-30] AI 지문 후처리 강화 — 접속사 정규화
    const conjunctionNorm = [
      { from: /또한\s/g, to: '그리고 ' },
      { from: /이러한\s/g, to: '이런 ' },
      { from: /그러므로\s/g, to: '그래서 ' },
      { from: /따라서\s/g, to: '그래서 ' },
      { from: /이에 따라\s/g, to: '그러다 보니 ' },
      { from: /더불어\s/g, to: '또 ' },
    ];

    let conjunctionFixed = 0;
    conjunctionNorm.forEach(({ from, to }) => {
      const matches = body.match(from);
      if (matches && matches.length > 1) {
        // 2회 이상이면 첫 번째만 남기고 나머지를 구어체로 교체
        let count = 0;
        body = body.replace(from, (match: string) => {
          count++;
          if (count === 1) return match; // 첫 번째는 유지
          conjunctionFixed++;
          return to;
        });
      }
    });
    if (conjunctionFixed > 0) {
      console.log(`  ✓ 접속사 정규화 ${conjunctionFixed}개 교체 (또한→그리고, 이러한→이런 등)`);
    }

    // ✅ [2026-03-30 v2] 연속 동일 어미 3회 자동 교체 엔진
    const endingSentences = body.split(/(?<=[.!?])\s+/);
    if (endingSentences.length >= 3) {
      const endingMap: Record<string, string[]> = {
        '합니다': ['한데요', '하죠', '하거든요'],
        '입니다': ['인데요', '이죠', '이거든요'],
        '습니다': ['는데요', '죠', '거든요'],
        '해요': ['하죠', '하거든요', '한 거예요'],
        '네요': ['더라고요', '잖아요', '거든요'],
        '거든요': ['잖아요', '더라고요', '네요'],
        '더라고요': ['네요', '거든요', '잖아요'],
        '잖아요': ['거든요', '네요', '더라고요'],
        '예요': ['이죠', '인 거예요', '이에요'],
        '이에요': ['예요', '이죠', '인 거예요'],
        '인가요': ['나요', '일까요', '인 건가요'],
        '나요': ['인가요', '일까요', '인 건가요'],
      };
      const endingRegex = /(합니다|입니다|습니다|해요|네요|거든요|더라고요|잖아요|인가요|나요|예요|이에요)([.!?]*)$/;
      let consecutiveCount = 0;
      let lastEndingWord = '';
      let fixedEndings = 0;

      for (let i = 0; i < endingSentences.length; i++) {
        const endMatch = endingSentences[i].match(endingRegex);
        const currentEndingWord = endMatch ? endMatch[1] : '';
        const punctuation = endMatch ? endMatch[2] : '';

        if (currentEndingWord && currentEndingWord === lastEndingWord) {
          consecutiveCount++;
          if (consecutiveCount >= 2) {
            // 3연속 동일 어미 → 실제 교체!
            const alternatives = endingMap[currentEndingWord];
            if (alternatives && alternatives.length > 0) {
              const replacement = alternatives[Math.floor(Math.random() * alternatives.length)];
              endingSentences[i] = endingSentences[i].replace(endingRegex, `${replacement}${punctuation}`);
              fixedEndings++;
              consecutiveCount = 0; // 교체 후 카운트 리셋
            }
          }
        } else {
          consecutiveCount = 0;
        }
        lastEndingWord = currentEndingWord;
      }

      if (fixedEndings > 0) {
        body = endingSentences.join(' ');
        console.log(`  ✓ 동일 어미 3연속 ${fixedEndings}회 자동 교체 완료`);
      }
    }

    // 7. 공백 정리
    body = body.replace(/\n{3,}/g, '\n\n');
    body = body.replace(/\s{2,}/g, ' ');
    body = body.trim();

    // ✅ [2026-03-30] 8. 접속사 교체 — AI 전형적 접속사를 자연어로 변환
    const conjunctionReplacements = [
      { from: /또한,?\s/g, to: () => ['그리고 ', '게다가 ', '거기에 '][Math.floor(Math.random() * 3)] },
      { from: /이러한\s/g, to: () => ['이런 ', '이렇게 ', '이처럼 '][Math.floor(Math.random() * 3)] },
      { from: /그러므로,?\s/g, to: () => ['그래서 ', '그러니까 ', '결국 '][Math.floor(Math.random() * 3)] },
      { from: /따라서,?\s/g, to: () => ['그래서 ', '그러다 보니 ', '결국은 '][Math.floor(Math.random() * 3)] },
      { from: /그럼에도 불구하고,?\s/g, to: () => ['그래도 ', '근데 ', '하지만 '][Math.floor(Math.random() * 3)] },
    ];

    let conjunctionsReplaced = 0;
    conjunctionReplacements.forEach(({ from, to }) => {
      const matches = body.match(from);
      if (matches && matches.length > 0) {
        body = body.replace(from, () => {
          conjunctionsReplaced++;
          return to();
        });
      }
    });
    if (conjunctionsReplaced > 0) {
      console.log(`  ✓ AI 접속사 ${conjunctionsReplaced}개 자연어 교체`);
    }

    // ✅ [2026-03-30 v2] 9. 문장 길이 균일도 체크 (Burstiness Enforcement)
    const burstTokens = body.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 3);
    if (burstTokens.length >= 5) {
      const lengths = burstTokens.map((s: string) => s.length);
      const avgLen = lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum: number, l: number) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev < 5) {
        console.log(`  ⚠️ 문장 길이 균일도 경고: 표준편차 ${stdDev.toFixed(1)} (최소 5 이상 권장) — AI 패턴 위험`);
      } else {
        console.log(`  ✅ 문장 길이 분산도 양호: 표준편차 ${stdDev.toFixed(1)}`);
      }
    }

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
    // ✅ [2026-02-27 FIX] 제목 잘림 방지 — 네이버 블로그 제한은 ~100자
    // 기존: 35자 초과 시 slice(0,32)+'...'로 강제 절단 → 제거
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

  // ✅ [2026-03-30 v2] AI 탐지 위험도 계산 — 12패턴 + 문장균일도 + 어미반복 + 구조검증
  private calculateAIDetectionRisk(body: string): number {
    let riskScore = 0;

    // 1. AI 전형적 문구 탐지 (12패턴)
    const aiPhrases = [
      '물론', '확실히', '것입니다', '하겠습니다',
      '에 대해 알아보겠습니다', '살펴보겠습니다', '소개해드리겠습니다',
      '종합적으로', '결론적으로', '요약하면',
      '주목할 만한', '귀추가 주목'
    ];
    let phraseCount = 0;
    aiPhrases.forEach(phrase => {
      const matches = body.match(new RegExp(phrase, 'g'));
      phraseCount += matches ? matches.length : 0;
    });
    riskScore += phraseCount * 5;

    // 2. 접속사 반복 체크
    const formalConjunctions = body.match(/(?:또한|이러한|그러므로|따라서|그럼에도 불구하고)/g);
    if (formalConjunctions && formalConjunctions.length > 3) {
      riskScore += (formalConjunctions.length - 3) * 3;
    }

    // 3. 문장 길이 균일도 (표준편차가 낮으면 AI)
    const riskSentences = body.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 3);
    if (riskSentences.length >= 5) {
      const lens = riskSentences.map((s: string) => s.length);
      const avg = lens.reduce((a: number, b: number) => a + b, 0) / lens.length;
      const stdDev = Math.sqrt(lens.reduce((sum: number, l: number) => sum + Math.pow(l - avg, 2), 0) / lens.length);
      if (stdDev < 3) riskScore += 15;       // 매우 균일 → 고위험
      else if (stdDev < 5) riskScore += 8;   // 약간 균일 → 중위험
    }

    // 4. 연속 동일 어미 잔존 체크
    const endCheckSentences = body.split(/(?<=[.!?])\s+/);
    const endRx = /(합니다|입니다|습니다|해요|네요|거든요|더라고요|잖아요|예요|이에요)[.!?]*$/;
    let consecEnd = 0;
    let prevEnd = '';
    for (const sent of endCheckSentences) {
      const m = sent.match(endRx);
      const curr = m ? m[1] : '';
      if (curr && curr === prevEnd) {
        consecEnd++;
        if (consecEnd >= 2) riskScore += 5; // 3연속 어미 잔존
      } else {
        consecEnd = 0;
      }
      prevEnd = curr;
    }

    // 5. 도입부↔소제목1 톤 겹침 검증
    const h2Sections = body.split(/<h2>/);
    if (h2Sections.length >= 3) {
      const intro = h2Sections[0].trim();
      const firstSection = h2Sections[1]?.split('</h2>')[1]?.trim() || '';
      if (intro && firstSection) {
        const introEndings = intro.match(/(합니다|해요|네요|거든요|더라고요|잖아요|예요)[.!?]/g) || [];
        const secEndings = firstSection.substring(0, 200).match(/(합니다|해요|네요|거든요|더라고요|잖아요|예요)[.!?]/g) || [];
        if (introEndings.length > 0 && secEndings.length > 0) {
          const introSet = new Set(introEndings);
          const overlap = secEndings.filter((e: string) => introSet.has(e)).length;
          if (overlap / secEndings.length > 0.7) {
            riskScore += 8; // 도입부와 소제목1 어미 70%+ 중복
          }
        }
      }
    }

    // 6. 소제목 간 의미 중복 체크 (키워드 유사도)
    if (h2Sections.length >= 3) {
      const headings = body.match(/<h2>([^<]+)<\/h2>/g)?.map((h: string) => h.replace(/<[^>]+>/g, '').trim()) || [];
      for (let i = 0; i < headings.length; i++) {
        for (let j = i + 1; j < headings.length; j++) {
          const wordsA = new Set(headings[i].split(/\s+/));
          const wordsB = new Set(headings[j].split(/\s+/));
          let common = 0;
          wordsA.forEach((w: string) => { if (wordsB.has(w) && w.length >= 2) common++; });
          const similarity = common / Math.max(wordsA.size, wordsB.size);
          if (similarity > 0.5) {
            riskScore += 5; // 소제목 간 단어 50%+ 겹침
            console.log(`  ⚠️ 소제목 유사도 경고: "${headings[i]}" ↔ "${headings[j]}" (${(similarity * 100).toFixed(0)}%)`);
          }
        }
      }
    }

    // 최종 스코어 (0~100)
    return Math.min(riskScore, 100);
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

    // ✅ [2026-02-27 FIX] 제목 잘림 방지 — 기존 35자 제한 삭제
    // 네이버 블로그 실제 제한은 ~100자, 강제 절단 불필요

    return title;
  }
}

export const qualityEnhancer = new QualityEnhancer();

