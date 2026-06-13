type SeoHeading = {
  title?: string;
  body?: unknown;
  content?: unknown;
};

type SeoValidationContent = {
  selectedTitle?: string;
  introduction?: string;
  conclusion?: string;
  bodyPlain?: string;
  headings?: SeoHeading[];
  quality?: any;
};

type SeoValidationSource = {
  contentMode?: string;
  metadata?: { keywords?: unknown[] } | Record<string, unknown>;
};

const getKeywords = (source: SeoValidationSource): string[] => {
  const keywords = (source.metadata as any)?.keywords;
  return Array.isArray(keywords) ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean) : [];
};

export function validateSeoContent(content: SeoValidationContent, source: SeoValidationSource): void {
  if (source.contentMode !== 'seo') return;

  console.log('[SeoValidator] 🔍 SEO 모드 전용 검증 시작...');

  const warnings: string[] = [];
  let titleScore = 100;
  const title = content.selectedTitle || '';
  const titleLength = title.length;

  if (titleLength < 25) {
    warnings.push(`⚠️ 제목 너무 짧음: ${titleLength}자 (SEO 권장 25~35자)`);
    titleScore -= 15;
  } else if (titleLength > 35) {
    warnings.push(`⚠️ 제목 너무 김: ${titleLength}자 (검색결과에서 잘릴 수 있음)`);
    titleScore -= 10;
  }

  if (!/\d/.test(title)) {
    warnings.push('⚠️ 제목에 숫자/연도 없음 (신뢰도 하락)');
    titleScore -= 15;
  }

  const seoTriggers = [
    '총정리', '완벽', '가이드', '비교', '차이', '해결', '꿀팁', '방법',
    '후기', '써본', '효과', '최신', '업데이트', '추천', '순위', 'TOP',
    '진짜', '실제', '직접', '비밀', '몰랐던', '이유',
  ];
  if (!seoTriggers.some((trigger) => title.includes(trigger))) {
    warnings.push('⚠️ 제목에 SEO 클릭 트리거 없음');
    titleScore -= 20;
  }

  const forbiddenSeoPatterns = ['에 대해', '에 관한', '입니다', '합니다', '알아보겠'];
  if (forbiddenSeoPatterns.some((pattern) => title.includes(pattern))) {
    warnings.push('⚠️ 제목에 설명체/딱딱한 어미 발견');
    titleScore -= 20;
  }

  const keywords = getKeywords(source);
  const seoSubKws = keywords.slice(1).filter((keyword) => keyword.length >= 2 && !/^\d+$/.test(keyword)).slice(0, 3);
  if (seoSubKws.length > 0) {
    const hasSubKwInTitle = seoSubKws.some((keyword) => title.includes(keyword));
    if (!hasSubKwInTitle) {
      warnings.push('⚠️ 제목에 서브키워드 없음 (검색 매칭 약화)');
      titleScore -= 10;
      console.warn(`[SeoValidator] ⚠️ 제목에 서브키워드 미포함: [${seoSubKws.join(', ')}] — 검색 매칭 약화`);
    } else {
      console.log('[SeoValidator] ✅ 제목 서브키워드 포함 확인');
    }
  }

  console.log(`[SeoValidator] 📊 제목 점수: ${titleScore}/100 ("${title.substring(0, 30)}...")`);

  const headingsCount = content.headings?.length || 0;
  if (headingsCount < 5) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 (SEO 권장: 5~7개, 체류시간 ↑)`);
    console.warn(`[SeoValidator] ⚠️ 소제목 부족: ${headingsCount}개`);
  }

  const bodyText = content.bodyPlain || '';
  const aiPatterns = [
    '물론', '확실히', '것입니다', '하겠습니다', '살펴보겠습니다',
    '알아보겠습니다', '소개해드리', '살펴보았습니다', '종합적으로',
    '정리하자면', '요약하면', '핵심:', '요약:', '정리:',
  ];
  let aiPatternCount = 0;
  for (const pattern of aiPatterns) {
    if (bodyText.includes(pattern)) {
      aiPatternCount++;
      console.warn(`[SeoValidator] 🚨 AI티 표현 발견: "${pattern}"`);
    }
  }
  if (aiPatternCount > 0) {
    warnings.push(`⚠️ AI티 표현 ${aiPatternCount}개 감지 (자연스러운 문체 권장)`);
  } else {
    console.log('[SeoValidator] ✅ AI 표현 0개 — 자연스러움');
  }

  const seoPK = keywords[0] || '';
  if (seoPK && bodyText.length > 100) {
    const escapedKeyword = seoPK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pkCount = (bodyText.match(new RegExp(escapedKeyword, 'gi')) || []).length;
    const density = (pkCount * seoPK.length) / bodyText.length * 100;
    if (density < 1.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (SEO 권장 1.5~3%)`);
      console.warn(`[SeoValidator] ⚠️ 메인키워드 "${seoPK}" 밀도 ${density.toFixed(1)}% — 검색 노출 부족`);
    } else if (density > 4.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (키워드 스터핑 위험, 3% 이하 권장)`);
      console.warn(`[SeoValidator] ⚠️ 메인키워드 밀도 ${density.toFixed(1)}% — 스터핑 위험`);
    } else {
      console.log(`[SeoValidator] ✅ 메인키워드 밀도 ${density.toFixed(1)}% — 적정`);
    }
  }

  if (seoSubKws.length > 0) {
    const lastHeading = content.headings && content.headings.length > 0
      ? content.headings[content.headings.length - 1]
      : undefined;
    const conclusionArea = `${content.conclusion || ''} ${String(lastHeading?.body || lastHeading?.content || '')}`;
    if (!seoSubKws.some((keyword) => conclusionArea.includes(keyword))) {
      warnings.push('⚠️ 결론부에 서브키워드 없음 (DIA 매칭 약화)');
      console.warn('[SeoValidator] ⚠️ 결론부 서브키워드 미포함 — DIA 검색 매칭 약화');
    } else {
      console.log('[SeoValidator] ✅ 결론부 서브키워드 포함 확인');
    }
  }

  if (content.headings && content.headings.length > 0) {
    const allBodies = content.headings.map((heading) => String(heading.body || heading.content || '')).join(' ');
    const sentences = allBodies.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 10);
    if (sentences.length >= 5) {
      const endings = sentences.map((sentence) => {
        const trimmed = sentence.trim();
        return trimmed.length >= 3 ? trimmed.slice(-3) : trimmed;
      });
      const diversityRatio = new Set(endings).size / endings.length;
      if (diversityRatio < 0.4) {
        warnings.push(`⚠️ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% (AI 탐지 위험, 60%+ 권장)`);
        console.warn(`[SeoValidator] ⚠️ 종결어미 반복 비율 높음 (${Math.round(diversityRatio * 100)}%) — AI 탐지 위험`);
      } else {
        console.log(`[SeoValidator] ✅ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% — 자연스러움`);
      }
    }
  }

  if (bodyText.length > 0 && bodyText.length < 2500) {
    warnings.push(`⚠️ 본문 ${bodyText.length}자 (C-Rank 권장 2500자+)`);
    console.warn(`[SeoValidator] ⚠️ 본문 ${bodyText.length}자 — C-Rank 문서 완성도 부족`);
  } else if (bodyText.length >= 2500) {
    console.log(`[SeoValidator] ✅ 본문 ${bodyText.length}자 — C-Rank 충족`);
  }

  if (content.headings && content.headings.length > 0) {
    const questionPatterns = ['?', '할까', '일까', '인가', '나요', '은가', '를까', '었을까', '던가', '는지'];
    const questionCount = content.headings.filter((heading) => {
      const headingTitle = String(heading.title || '');
      return questionPatterns.some((pattern) => headingTitle.includes(pattern));
    }).length;
    if (questionCount < 1) {
      warnings.push('⚠️ 질문형 소제목 0개 (의미론적 SEO 약화, 1개+ 권장)');
      console.warn('[SeoValidator] ⚠️ 질문형 소제목 없음 — 의미론적 SEO 약화');
    } else {
      console.log(`[SeoValidator] ✅ 질문형 소제목 ${questionCount}개 — 의미론적 SEO 강화`);
    }
  }

  if (seoPK && content.introduction) {
    const firstTwoSentences = String(content.introduction).trim().split(/[.!?]/).slice(0, 2).join(' ');
    if (!firstTwoSentences.includes(seoPK)) {
      warnings.push('⚠️ 도입부 첫 2문장에 키워드 없음 (AI 스니펫 대응 약화)');
      console.warn(`[SeoValidator] ⚠️ 도입부에 키워드 "${seoPK}" 미포함 — AI 스니펫 대응 실패`);
    } else {
      console.log('[SeoValidator] ✅ 도입부 키워드 포함 — AI 스니펫 대응 완료');
    }
  }

  if (warnings.length > 0) {
    if (!content.quality) {
      content.quality = {
        aiDetectionRisk: 'low',
        legalRisk: 'safe',
        seoScore: titleScore,
        originalityScore: 70,
        readabilityScore: 70,
        warnings: [],
      };
    }
    content.quality.seoScore = titleScore;
    content.quality.warnings = [...(content.quality.warnings || []), ...warnings];
    console.log(`[SeoValidator] 검증 완료: ${warnings.length}개 경고`);
  } else {
    console.log('[SeoValidator] ✅ SEO 검증 통과');
  }
}
