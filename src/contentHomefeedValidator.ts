import { checkHomefeedCriticalViolations, checkPromptCompliance, formatComplianceReport } from './contentQualityChecker.js';
import {
  sanitizeContentFakeSources,
  sanitizeContentHtmlTags,
  sanitizeContentMetaCritique,
} from './contentSanitizers.js';

type HomefeedHeading = {
  title: string;
  content?: string;
  summary: string;
  keywords: string[];
  imagePrompt: string;
  body?: string;
};

type HomefeedQuality = {
  aiDetectionRisk: 'low' | 'medium' | 'high';
  legalRisk: 'safe' | 'caution' | 'danger';
  seoScore: number;
  originalityScore: number;
  readabilityScore: number;
  warnings: string[];
};

type HomefeedValidationContent = {
  selectedTitle?: string;
  introduction?: string;
  conclusion?: string;
  bodyPlain?: string;
  headings?: HomefeedHeading[];
  quality?: HomefeedQuality;
};

type HomefeedValidationSource = {
  contentMode?: string;
  metadata?: Record<string, unknown>;
};

const getSourceKeywords = (source: HomefeedValidationSource): string[] => {
  const keywords = source.metadata?.keywords;
  return Array.isArray(keywords) ? keywords.map((keyword) => String(keyword)) : [];
};

const ensureQuality = (content: HomefeedValidationContent): HomefeedQuality => {
  if (!content.quality) {
    content.quality = {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 70,
      originalityScore: 70,
      readabilityScore: 70,
      warnings: [],
    };
  }
  return content.quality;
};

export function validateHomefeedContent(
  content: HomefeedValidationContent,
  source: HomefeedValidationSource,
): { hasCritical: boolean; violations: string[] } {
  sanitizeContentHtmlTags(content);
  sanitizeContentFakeSources(content);
  sanitizeContentMetaCritique(content);

  if (source.contentMode !== 'homefeed') return { hasCritical: false, violations: [] };

  console.log('[HomefeedValidator] 🔍 홈판 모드 전용 검증 시작...');

  const warnings: string[] = [];
  let titleScore = 100;

  const title = content.selectedTitle || '';
  const titleLength = title.length;

  if (titleLength < 28) {
    warnings.push(`⚠️ 제목 너무 짧음: ${titleLength}자 (권장 28~40자)`);
    titleScore -= 15;
  } else if (titleLength > 40) {
    warnings.push(`⚠️ 제목 너무 김: ${titleLength}자 (권장 28~40자)`);
    titleScore -= 10;
  }

  const emotionTriggers = [
    '충격', '경악', '소름', '반전', '눈물', '울컥', '분노', '논란',
    '난리', '폭발', '실화', '대박', '감동', '궁금', '비밀', '진실',
    '숨겨', '알고보니', '결국', '진짜', '직접', '현장', '실시간',
  ];
  const hasEmotionTrigger = emotionTriggers.some((trigger) => title.includes(trigger));
  if (!hasEmotionTrigger) {
    warnings.push('⚠️ 제목에 감정 트리거 없음 (-25점)');
    titleScore -= 25;
  }

  const forbiddenTitlePatterns = ['왜?', '왜일까?', '에 대해', '에 관한', '알아보겠습니다'];
  const hasForbiddenTitle = forbiddenTitlePatterns.some((pattern) => title.includes(pattern));
  if (hasForbiddenTitle) {
    warnings.push('⚠️ 제목에 금지 표현 발견 (설명체/뻔한 마무리)');
    titleScore -= 40;
  }

  console.log(`[HomefeedValidator] 📊 제목 점수: ${titleScore}/100 ("${title.substring(0, 30)}...")`);

  const headingsCount = content.headings?.length || 0;
  if (headingsCount < 3) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 (최소 3개 필요)`);
    console.warn(`[HomefeedValidator] ⚠️ 소제목 심각 부족: ${headingsCount}개`);

    if (headingsCount < 3 && content.headings) {
      const primaryKeyword = getSourceKeywords(source)[0]?.trim() || '';
      const additionalHeadings = [
        {
          title: primaryKeyword ? `${primaryKeyword}, 놓치면 후회할 포인트` : '놓치면 후회할 핵심 포인트',
          content: '여기서부터가 진짜 중요해요.',
          summary: '',
          keywords: [],
          imagePrompt: '',
        },
        {
          title: '직접 경험해보니 달랐어요',
          content: '솔직히 기대 안 했는데, 생각보다 달랐어요.',
          summary: '',
          keywords: [],
          imagePrompt: '',
        },
      ];
      content.headings.push(...additionalHeadings.slice(0, 4 - headingsCount));
      console.log(`[HomefeedValidator] 소제목 ${4 - headingsCount}개 자동 추가 (토픽 연관 폴백)`);
    }
  } else if (headingsCount > 8) {
    warnings.push(`⚠️ 소제목 ${headingsCount}개 — 너무 많음 (8개 이하 권장)`);
    console.warn(`[HomefeedValidator] ⚠️ 소제목 과다: ${headingsCount}개`);
  }

  const intro = content.introduction || '';
  const introLines = intro.split(/[.!?]\s*/).filter((sentence) => sentence.trim().length > 0).length;
  if (introLines > 5) {
    warnings.push(`⚠️ 도입부 ${introLines}줄 (홈판 권장: 3줄 이내)`);
    console.warn(`[HomefeedValidator] ⚠️ 도입부 너무 김: ${introLines}줄 (권장 3줄)`);
  }

  const conclusion = content.conclusion || '';
  const forbiddenPatterns = ['결론적으로', '정리하면', '요약하면', '결론은', '마무리하자면', '종합하면'];
  const hasForbiddenConclusion = forbiddenPatterns.some((pattern) => conclusion.includes(pattern));
  if (hasForbiddenConclusion) {
    warnings.push('⚠️ 마무리에 결론/정리 표현 발견 (홈판 금지)');
    console.warn('[HomefeedValidator] ⚠️ 마무리에 금지 표현 발견');
  }

  const bodyText = content.bodyPlain || '';
  const journalistPatterns = ['~로 알려졌다', '~로 전해졌다', '~로 확인됐다', '~로 밝혔다', '~에 따르면'];
  const hasJournalistTone = journalistPatterns.some((pattern) => bodyText.includes(pattern));
  if (hasJournalistTone) {
    warnings.push('⚠️ 기자체 표현 감지 (홈판에서는 구어체 권장)');
    console.warn('[HomefeedValidator] ⚠️ 기자체 표현 감지');
  }

  const validatorSubKeywords = getSourceKeywords(source)
    .slice(1)
    .filter((keyword) => keyword.length >= 2 && !/^\d+$/.test(keyword))
    .slice(0, 3);
  if (validatorSubKeywords.length > 0) {
    const lastHeading = content.headings && content.headings.length > 0
      ? content.headings[content.headings.length - 1]
      : undefined;
    const conclusionText = `${content.conclusion || ''} ${String(lastHeading?.body || lastHeading?.content || '')}`;
    const hasSubKeywordInConclusion = validatorSubKeywords.some((keyword) => conclusionText.includes(String(keyword)));
    if (!hasSubKeywordInConclusion) {
      warnings.push('⚠️ 결론부에 서브키워드 없음 (네이버 AI 토픽 매칭 약화)');
      console.warn('[HomefeedValidator] ⚠️ 결론부에 서브키워드 미포함 — 토픽 매칭 약화');
    } else {
      console.log('[HomefeedValidator] ✅ 결론부 서브키워드 포함 확인');
    }
  }

  const validatorPrimaryKeyword = getSourceKeywords(source)[0]?.trim() || '';
  if (validatorPrimaryKeyword && bodyText.length > 100) {
    const pkCount = (
      bodyText.match(new RegExp(validatorPrimaryKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []
    ).length;
    const density = (pkCount * validatorPrimaryKeyword.length) / bodyText.length * 100;
    if (density < 1.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (권장 1.5~3%)`);
      console.warn(`[HomefeedValidator] ⚠️ 메인키워드 "${validatorPrimaryKeyword}" 밀도 ${density.toFixed(1)}% — 홈피드 토픽 매칭 부족`);
    } else if (density > 4.0) {
      warnings.push(`⚠️ 메인키워드 밀도 ${density.toFixed(1)}% (과도, 3% 이하 권장)`);
      console.warn(`[HomefeedValidator] ⚠️ 메인키워드 밀도 ${density.toFixed(1)}% — 키워드 스터핑 위험`);
    } else {
      console.log(`[HomefeedValidator] ✅ 메인키워드 밀도 ${density.toFixed(1)}% — 적정`);
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
      const uniqueEndings = new Set(endings);
      const diversityRatio = uniqueEndings.size / endings.length;
      if (diversityRatio < 0.4) {
        warnings.push(`⚠️ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% (AI 탐지 위험, 60%+ 권장)`);
        console.warn(`[HomefeedValidator] ⚠️ 종결어미 반복 비율 높음 (${Math.round(diversityRatio * 100)}%) — AI 탐지 위험`);
      } else {
        console.log(`[HomefeedValidator] ✅ 종결어미 다양성 ${Math.round(diversityRatio * 100)}% — 자연스러움`);
      }
    }
  }

  const criticalResult = checkHomefeedCriticalViolations(content as any);
  const criticalViolations = criticalResult.violations;

  try {
    const compliance = checkPromptCompliance(content as any);
    const report = formatComplianceReport(compliance);
    console.log(report);

    const quality = ensureQuality(content);
    (quality as any).promptCompliance = compliance;

    if (compliance.passRate < 0.7) {
      const missing: string[] = [];
      compliance.byHeading.forEach((heading: any, index: number) => {
        const tag = `H${index + 1} "${String(heading.heading).slice(0, 20)}"`;
        if (!heading.pA) missing.push(`${tag}: P-A 의심+반박 패턴 누락`);
        if (!heading.pB) missing.push(`${tag}: P-B '절대 모를 한 가지' 디테일 누락`);
        if (!heading.pC) missing.push(`${tag}: P-C 다음 섹션 갈고리(Hook) 누락`);
      });
      if (!compliance.pD_failOrLimit) missing.push('글 전체: P-D 실패담/한계 1회 누락');
      if (!compliance.pF_introHasNumber) missing.push('도입부: P-F 첫 문장 숫자/날짜 누락');
      if (!compliance.bodyLengthOk) missing.push(`본문 길이: ${compliance.bodyLength}자 (1500~1800 권장 벗어남)`);
      if (compliance.endingDup3plus > 0) missing.push(`어미 3연속 ${compliance.endingDup3plus}건`);

      const summary = `[v2.10.1 충실도 ${Math.round(compliance.passRate * 100)}%] AI 의무 누락 ${missing.length}건 — 재생성 권장`;
      quality.warnings = [...(quality.warnings || []), summary, ...missing.map((item) => `  · ${item}`)];
      console.warn(`[Compliance] ⛔ ${summary}`);
      missing.forEach((item) => console.warn(`[Compliance]   · ${item}`));
    } else {
      console.log(`[Compliance] ✅ 충실도 ${Math.round(compliance.passRate * 100)}% — AI가 의무를 따름`);
    }
  } catch (error: any) {
    console.warn('[Compliance] 검증 실패 (무시):', error?.message);
  }

  if (warnings.length > 0) {
    const quality = ensureQuality(content);
    quality.warnings = [...(quality.warnings || []), ...warnings];
    console.log(`[HomefeedValidator] 검증 완료: ${warnings.length}개 경고`);
  } else {
    console.log('[HomefeedValidator] ✅ 홈판 검증 통과');
  }

  return { hasCritical: criticalViolations.length > 0, violations: criticalViolations };
}
