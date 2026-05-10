/**
 * SPEC-CONVERSION-001 L4-2.4 — 프롬프트 개선 제안 자동 리포트
 *
 * rlhfPatternExtractor의 결과를 받아 *현재 프롬프트와의 격차*를 진단하고
 * 개선 제안을 텍스트 리포트로 출력. 사람이 읽고 프롬프트 수동 튜닝.
 *
 * LLM 미사용 — 결정론 휴리스틱.
 *
 * 메모리 [silent 폴백 금지]: 데이터 부족 시 명시 reason.
 * 메모리 [추정 효과 금지]: "이 제안 적용하면 X% 상승" 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import type { PatternExtractorResult, AggregatedPatterns } from './rlhfPatternExtractor';

export interface PromptReviewInput {
  readonly extractorResult: PatternExtractorResult;
  readonly currentBaseline?: {
    readonly targetCharCount?: number;          // 현재 프롬프트가 요구하는 분량
    readonly targetHeadingCount?: number;
    readonly targetImageCount?: number;
    readonly currentTopKeywords?: readonly string[];
  };
}

export interface PromptSuggestion {
  readonly category: 'length' | 'structure' | 'keyword' | 'image' | 'general';
  readonly severity: 'low' | 'medium' | 'high';
  readonly observation: string;
  readonly suggestion: string;
}

export interface PromptReviewReport {
  readonly suggestions: readonly PromptSuggestion[];
  readonly summary: string;
  readonly fallbackReason?: string;
}

const CHAR_DELTA_THRESHOLD_HIGH = 500;
const CHAR_DELTA_THRESHOLD_MEDIUM = 200;
const HEADING_DELTA_THRESHOLD = 1;
const IMAGE_DELTA_THRESHOLD = 1;

export function reviewPrompt(input: PromptReviewInput): PromptReviewReport {
  const { extractorResult: r } = input;
  if (r.fallbackReason) {
    return {
      suggestions: [],
      summary: `리뷰 불가 — ${r.fallbackReason}`,
      fallbackReason: r.fallbackReason,
    };
  }
  if (r.topPosts.length === 0) {
    return {
      suggestions: [],
      summary: '상위 글이 없어 리뷰 불가',
      fallbackReason: 'NO_TOP_POSTS',
    };
  }

  const suggestions: PromptSuggestion[] = [];
  const baseline = input.currentBaseline ?? {};
  const patterns = r.aggregatedPatterns;

  // 1. 분량 격차
  if (baseline.targetCharCount !== undefined && patterns.avgCharCount > 0) {
    const delta = patterns.avgCharCount - baseline.targetCharCount;
    if (Math.abs(delta) >= CHAR_DELTA_THRESHOLD_HIGH) {
      suggestions.push({
        category: 'length',
        severity: 'high',
        observation: `상위 글 평균 ${patterns.avgCharCount}자 vs 현재 목표 ${baseline.targetCharCount}자 (격차 ${delta > 0 ? '+' : ''}${delta})`,
        suggestion: delta > 0
          ? `목표 분량을 ${patterns.avgCharCount}자 근처로 상향 검토`
          : `목표 분량을 ${patterns.avgCharCount}자 근처로 하향 검토 (간결성 강화)`,
      });
    } else if (Math.abs(delta) >= CHAR_DELTA_THRESHOLD_MEDIUM) {
      suggestions.push({
        category: 'length',
        severity: 'medium',
        observation: `분량 격차 ${delta > 0 ? '+' : ''}${delta}자`,
        suggestion: '목표 분량 ±5% 미세 조정 검토',
      });
    }
  }

  // 2. 구조(헤딩) 격차
  if (baseline.targetHeadingCount !== undefined && patterns.avgHeadingCount > 0) {
    const delta = patterns.avgHeadingCount - baseline.targetHeadingCount;
    if (Math.abs(delta) >= HEADING_DELTA_THRESHOLD) {
      suggestions.push({
        category: 'structure',
        severity: 'medium',
        observation: `상위 글 평균 헤딩 ${patterns.avgHeadingCount}개 vs 현재 ${baseline.targetHeadingCount}개`,
        suggestion: `구조 아키타입에서 ${patterns.avgHeadingCount}개 근처로 분포 가중치 조정`,
      });
    }
  }

  // 3. 이미지 수
  if (baseline.targetImageCount !== undefined && patterns.avgImageCount > 0) {
    const delta = patterns.avgImageCount - baseline.targetImageCount;
    if (Math.abs(delta) >= IMAGE_DELTA_THRESHOLD) {
      suggestions.push({
        category: 'image',
        severity: 'low',
        observation: `상위 글 평균 이미지 ${patterns.avgImageCount}개 vs 현재 ${baseline.targetImageCount}개`,
        suggestion: '이미지 삽입 포인트 수 조정 검토',
      });
    }
  }

  // 4. 키워드 격차
  if (baseline.currentTopKeywords && patterns.topKeywords.length > 0) {
    const currentSet = new Set(baseline.currentTopKeywords.map((k) => k.toLowerCase()));
    const missing = patterns.topKeywords
      .filter((k) => !currentSet.has(k.term.toLowerCase()))
      .slice(0, 5)
      .map((k) => k.term);
    if (missing.length >= 3) {
      suggestions.push({
        category: 'keyword',
        severity: 'medium',
        observation: `상위 글 빈출 키워드 ${missing.length}개가 현재 프롬프트에 미반영: ${missing.join(', ')}`,
        suggestion: '카테고리별 prompt에 위 키워드 vocabularyHints에 추가 검토',
      });
    }
  }

  // 5. 구조 시그니처 분포 — 단일 패턴 편중 경고
  if (patterns.topStructureSignatures.length > 0) {
    const top = patterns.topStructureSignatures[0];
    const totalSig = patterns.topStructureSignatures.reduce((s, x) => s + x.count, 0);
    if (totalSig > 0 && top.count / totalSig >= 0.6) {
      suggestions.push({
        category: 'structure',
        severity: 'high',
        observation: `상위 글 ${Math.round(top.count / totalSig * 100)}%가 시그니처 "${top.signature}" 단일 패턴`,
        suggestion: `이 구조를 STRUCTURE_ARCHETYPES에 우선 배치 (타 패턴은 비중 낮춤)`,
      });
    }
  }

  if (suggestions.length === 0) {
    return {
      suggestions: [],
      summary: '제안 사항 없음 — 현재 프롬프트와 상위 글 패턴 일치',
    };
  }

  const high = suggestions.filter((s) => s.severity === 'high').length;
  const med = suggestions.filter((s) => s.severity === 'medium').length;
  const low = suggestions.filter((s) => s.severity === 'low').length;
  const summary = `제안 ${suggestions.length}건 (high ${high}, medium ${med}, low ${low})`;
  return { suggestions, summary };
}

/**
 * 리포트를 markdown 텍스트로 렌더. scripts/rlhf/prompt-review.ts에서 파일로 저장 가능.
 */
export function renderReportMarkdown(report: PromptReviewReport, header?: string): string {
  const lines: string[] = [
    `# 프롬프트 개선 제안 — ${header ?? new Date().toISOString().slice(0, 10)}`,
    '',
    `## 요약: ${report.summary}`,
    '',
  ];
  if (report.fallbackReason) {
    lines.push(`> ⚠️ ${report.fallbackReason}`);
    return lines.join('\n');
  }
  if (report.suggestions.length === 0) {
    lines.push('현재 제안 사항 없습니다.');
    return lines.join('\n');
  }
  for (const s of report.suggestions) {
    lines.push(`### [${s.severity.toUpperCase()}] ${s.category}`);
    lines.push(`- **관찰**: ${s.observation}`);
    lines.push(`- **제안**: ${s.suggestion}`);
    lines.push('');
  }
  return lines.join('\n');
}

// helper: AggregatedPatterns 컴팩트 dump (디버그용)
export function aggregatedPatternsToText(p: AggregatedPatterns): string {
  return [
    `chars=${p.avgCharCount}`,
    `headings=${p.avgHeadingCount}`,
    `images=${p.avgImageCount}`,
    `topSig=[${p.topStructureSignatures.slice(0, 3).map((s) => s.signature).join(', ')}]`,
    `topKw=[${p.topKeywords.slice(0, 5).map((k) => k.term).join(', ')}]`,
  ].join(' | ');
}
