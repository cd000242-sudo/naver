import {
  resolveHeadingCountRange,
  judgeHeadingCount,
  describeHeadingCount,
} from './content/headingCountPolicy.js';
import { HOMEFEED_ISSUE_STORY_CATEGORIES, resolveCategory } from './promptLoader.js';
import { measureTitleWidth, resolveTitleLengthRange } from './content/titleLengthPolicy.js';
import { countHomefeedTitleHookSignals, STRONG_HOOK_SIGNALS } from './content/homefeedTitleHookFloor.js';

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

  /*
   * [2026-09-17] 길이를 글자 수가 아니라 폭으로 재고, 숫자는 titleLengthPolicy 에서 가져온다.
   *
   * 실측 사고: "긴 바지인데 달랐다. 조여정 베니스 영화제 패션, 비율의 차이" 가 이 검사기에서
   * 100/100 을 받았다. 30자라 28자 기준을 넘겼기 때문인데, 폭으로는 29 로 하한(33) 미달이고
   * 후킹 장치도 0개였다. 같은 제목을 두고 검사기끼리 정반대로 말하고 있었다.
   *
   * 상한은 후킹 장치가 3개 이상이면 묻지 않는다 — 실측상 긴 제목 자체는 불리하지 않았다
   * (42~48 1.05배, 48 초과 1.57배). 걸러야 할 것은 '후킹 없이 길어진 제목'이다.
   */
  const titleWidth = measureTitleWidth(title);
  const titleRange = resolveTitleLengthRange('homefeed');
  const hookSignals = countHomefeedTitleHookSignals(title);

  if (titleWidth < titleRange.min) {
    warnings.push(`⚠️ 제목 너무 짧음: 폭 ${titleWidth} (권장 ${titleRange.min} 이상)`);
    titleScore -= 15;
  } else if (titleWidth > titleRange.max && hookSignals < STRONG_HOOK_SIGNALS) {
    warnings.push(`⚠️ 제목 너무 김: 폭 ${titleWidth} · 후킹 장치 ${hookSignals}개 (장치 ${STRONG_HOOK_SIGNALS}개 이상이면 길이는 묻지 않음)`);
    titleScore -= 10;
  }

  /*
   * 후킹 장치 개수. 실측(홈판 1,299편 vs 미진입 794편)에서 장치 정확 개수별 배수는
   *   0개 0.44 · 1개 0.84 · 2개 1.14 · 3개 이상 1.88
   * 이다. 1개 이하는 홈판 진입에 불리한 쪽이라 점수에 반영한다.
   */
  if (hookSignals === 0) {
    warnings.push('⚠️ 제목에 후킹 장치 없음 (대조·인용·결론차단·말줄임·정체범주 0개 — 실측 0.44배)');
    titleScore -= 25;
  } else if (hookSignals < 2) {
    warnings.push(`⚠️ 제목 후킹 장치 ${hookSignals}개 — 실측 0.84배로 여전히 불리하다`);
    titleScore -= 15;
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

  // [2026-08-26] 기준을 headingCountPolicy 단일 출처로 옮겼다.
  // 예전엔 모든 홈판 글에 "최소 3개"를 요구했는데, homefeed/issue-story.prompt는
  // "인물·근황 글은 소제목 없이 흐름으로"(0~3개)라고 지시한다. 지시를 따른 글이
  // 부족 경고로 찍히고 있었다.
  const headingsCount = content.headings?.length || 0;
  const isIssueStory = HOMEFEED_ISSUE_STORY_CATEGORIES.has(
    resolveCategory((source as any)?.categoryHint),
  );
  const headingRange = resolveHeadingCountRange('homefeed', { issueStory: isIssueStory });
  if (judgeHeadingCount(headingsCount, headingRange) !== 'ok') {
    const line = describeHeadingCount(headingsCount, headingRange);
    warnings.push(line);
    console.warn(`[HomefeedValidator] ${line}`);
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
