import { checkHomefeedCriticalViolations } from './contentQualityChecker.js';
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
  } else if (titleLength > 42) {
    warnings.push(`⚠️ 제목 너무 김: ${titleLength}자 (권장 28~42자)`);
    titleScore -= 10;
  }

  const valueTriggers = [
    '조건', '기준', '순서', '차이', '이유', '확인', '주의', '비교',
    '선택', '고민', '헷갈', '놓치', '달라진', '결과', '할까', '일까', '어떻게', '왜',
  ];
  if (!valueTriggers.some((trigger) => title.includes(trigger))) {
    warnings.push('⚠️ 제목에서 독자가 얻을 판단 기준이나 읽을 이유가 선명하지 않음');
    titleScore -= 15;
  }
  if (/(충격|경악|소름|대박|폭로|진실\s*공개|난리|실화)/.test(title)) {
    warnings.push('⚠️ 제목에 과장·클릭베이트 표현 포함');
    titleScore -= 30;
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

  if (warnings.length > 0) {
    const quality = ensureQuality(content);
    quality.warnings = [...(quality.warnings || []), ...warnings];
    console.log(`[HomefeedValidator] 검증 완료: ${warnings.length}개 경고`);
  } else {
    console.log('[HomefeedValidator] ✅ 홈판 검증 통과');
  }

  return { hasCritical: criticalViolations.length > 0, violations: criticalViolations };
}
