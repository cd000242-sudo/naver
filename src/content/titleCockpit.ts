/**
 * [v2.1.0 Post-LDF] 제목 Cockpit — 발행 전 제목 선택·편집·재생성 API
 *
 * 배경: LDF 백엔드는 이미 `titleCandidates` 3개를 생성하고 `scoreTitleForHomefeed`로
 *       채점함. 하지만 사용자 개입 지점(발행 전 확인 UI)이 없어 AI 선택을 그대로
 *       수용. 본 모듈이 **사용자 개입 지점을 공식화**.
 *
 * 역할:
 *   1. 제목 후보 채점 결과 요약 (CTR 예측 + 개선 제안)
 *   2. 사용자 편집 제목 재채점
 *   3. 임계치 미달 제목 자동 거부
 *   4. Winner Pattern 기반 권장 템플릿 제시
 *
 * UI 연동은 후속 (v2.1.1~). 본 모듈은 **IPC 경계에서 호출 가능한 순수 함수 모음**.
 */

import {
  scoreTitleForHomefeed,
  resolveCTRCategory,
  CTR_BENCHMARKS,
  type CTRCategory,
} from './ctrCombat.js';
import type { WinnerPattern } from './attributionEngine.js';

export interface TitleAnalysis {
  title: string;
  ctrScore: number;                // 0-100
  breakdown: Record<string, number>;
  suggestions: string[];
  tier: 'excellent' | 'good' | 'acceptable' | 'poor' | 'reject';
  estimatedCTR: number;            // % 추정
  benchmarkGap: number;            // 카테고리 평균 CTR 대비 차이 (%p)
  isPublishRecommended: boolean;   // 발행 권장 여부
  rejectionReasons?: string[];
}

/**
 * [v2.1.0] 제목 종합 분석 — UI 모달에 표시할 데이터 생성
 */
export function analyzeTitle(title: string, categoryHint?: string): TitleAnalysis {
  const result = scoreTitleForHomefeed(title, categoryHint);
  const cat = resolveCTRCategory(categoryHint);
  const benchmark = CTR_BENCHMARKS[cat];

  // 티어 판정
  let tier: TitleAnalysis['tier'];
  const rejectionReasons: string[] = [];
  if (result.score >= 85) tier = 'excellent';
  else if (result.score >= 70) tier = 'good';
  else if (result.score >= 55) tier = 'acceptable';
  else if (result.score >= 40) tier = 'poor';
  else tier = 'reject';

  // AI 클리셰 감지 시 강제 거부
  const hasAICliche = result.suggestions.some(s => s.includes('AI 뻔한 표현'));
  if (hasAICliche) {
    tier = 'reject';
    rejectionReasons.push('AI 클리셰 표현 포함 (저품질 트리거)');
  }

  // 길이 심각 초과 거부
  if (title.length > 50 || title.length < 12) {
    tier = 'reject';
    rejectionReasons.push(`부적합한 길이 (${title.length}자, 권장 28~35)`);
  }

  // CTR 추정 (카테고리 평균을 1.0배 기준으로 스케일링)
  const scoreMultiplier = 0.5 + (result.score / 100) * 1.5; // 50점=0.5배, 100점=2배
  const estimatedCTR = benchmark.avg * scoreMultiplier;
  const benchmarkGap = estimatedCTR - benchmark.avg;

  return {
    title,
    ctrScore: result.score,
    breakdown: result.breakdown,
    suggestions: result.suggestions,
    tier,
    estimatedCTR: Math.round(estimatedCTR * 10) / 10,
    benchmarkGap: Math.round(benchmarkGap * 10) / 10,
    isPublishRecommended: tier !== 'reject' && tier !== 'poor',
    rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons : undefined,
  };
}

/**
 * [v2.1.0] 여러 제목 후보 비교 + 최적 선택
 */
export interface TitleRanking {
  rank: number;
  analysis: TitleAnalysis;
  isRecommended: boolean;        // 자동 추천 여부
}

export function rankTitleCandidates(
  candidates: string[],
  categoryHint?: string,
): TitleRanking[] {
  const analyzed = candidates
    .filter(t => typeof t === 'string' && t.trim().length > 0)
    .map(title => analyzeTitle(title, categoryHint));

  // 점수 내림차순
  analyzed.sort((a, b) => b.ctrScore - a.ctrScore);

  return analyzed.map((analysis, idx) => ({
    rank: idx + 1,
    analysis,
    isRecommended: idx === 0 && analysis.isPublishRecommended,
  }));
}

/**
 * [v2.1.0] 제목 거부 정책 체크
 * 발행 파이프라인에서 호출 → 낮은 점수 제목 자동 차단
 */
export function shouldRejectTitle(
  title: string,
  categoryHint?: string,
  strictness: 'lenient' | 'moderate' | 'strict' = 'moderate',
): { reject: boolean; reason?: string; suggestedAction?: string } {
  const analysis = analyzeTitle(title, categoryHint);

  const thresholds = {
    lenient: 40,
    moderate: 55,
    strict: 70,
  };

  if (analysis.tier === 'reject') {
    return {
      reject: true,
      reason: analysis.rejectionReasons?.join(', ') || '강제 거부 조건 위반',
      suggestedAction: '제목 재생성 필수',
    };
  }

  if (analysis.ctrScore < thresholds[strictness]) {
    return {
      reject: true,
      reason: `CTR 점수 ${analysis.ctrScore}점 < 임계치 ${thresholds[strictness]}점 (${strictness} 모드)`,
      suggestedAction: '제목 재생성 권장',
    };
  }

  return { reject: false };
}

/**
 * [v2.1.0] Winner Pattern 기반 제목 템플릿 추천
 * Attribution Engine의 winnerPattern을 받아 사용자에게 "이런 결 제목 써보세요" 가이드 제공
 */
export interface TitleTemplate {
  pattern: string;               // "{keyword} {감정어} 후기 {숫자}개"
  example: string;
  basedOn: string;               // "상위 10% 중 40%가 이 패턴"
  expectedScore: number;
}

export function recommendTitleTemplates(
  pattern: WinnerPattern,
  primaryKeyword: string,
  categoryHint?: string,
): TitleTemplate[] {
  const templates: TitleTemplate[] = [];
  const cat = resolveCTRCategory(categoryHint);

  if (pattern.sampleSize < 10) {
    // 샘플 부족 시 카테고리 기본 템플릿
    const fallbackByCategory: Record<CTRCategory, TitleTemplate[]> = {
      food: [
        { pattern: '{kw} 가성비 TOP {N}, 직접 먹어본 후기', example: `${primaryKeyword} 가성비 TOP 3, 직접 먹어본 후기`, basedOn: '카테고리 기본값', expectedScore: 75 },
        { pattern: '{kw} 솔직 후기, 이거 한 번쯤은', example: `${primaryKeyword} 솔직 후기, 이거 한 번쯤은`, basedOn: '카테고리 기본값', expectedScore: 70 },
      ],
      parenting: [
        { pattern: '{N}살 {kw} 현실, 저는 이렇게 해요', example: `5살 ${primaryKeyword} 현실, 저는 이렇게 해요`, basedOn: '카테고리 기본값', expectedScore: 78 },
        { pattern: '{kw} 맘들 공감, 이거 저만 그런가요', example: `${primaryKeyword} 맘들 공감, 이거 저만 그런가요`, basedOn: '카테고리 기본값', expectedScore: 72 },
      ],
      beauty: [
        { pattern: '{kw} 한 달 써본 솔직 후기, {N}가지 변화', example: `${primaryKeyword} 한 달 써본 솔직 후기, 3가지 변화`, basedOn: '카테고리 기본값', expectedScore: 80 },
        { pattern: '{kw} 비싼 것보다 이게 낫더라구요', example: `${primaryKeyword} 비싼 것보다 이게 낫더라구요`, basedOn: '카테고리 기본값', expectedScore: 75 },
      ],
      health: [
        { pattern: '{kw} {N}개월 해보니 이런 변화가', example: `${primaryKeyword} 3개월 해보니 이런 변화가`, basedOn: '카테고리 기본값', expectedScore: 82 },
        { pattern: '{kw} 효과 있을까? 실측 데이터', example: `${primaryKeyword} 효과 있을까? 실측 데이터`, basedOn: '카테고리 기본값', expectedScore: 78 },
      ],
      travel: [
        { pattern: '{kw} {N}박{N}일 코스, 현지인 추천', example: `${primaryKeyword} 2박3일 코스, 현지인 추천`, basedOn: '카테고리 기본값', expectedScore: 76 },
        { pattern: '{kw} 가기 전 알았으면 좋았을 {N}가지', example: `${primaryKeyword} 가기 전 알았으면 좋았을 5가지`, basedOn: '카테고리 기본값', expectedScore: 74 },
      ],
      tech: [
        { pattern: '{kw} {N}개월 써본 장단점 솔직히', example: `${primaryKeyword} 3개월 써본 장단점 솔직히`, basedOn: '카테고리 기본값', expectedScore: 77 },
        { pattern: '{kw} 구매 전 체크 {N}가지', example: `${primaryKeyword} 구매 전 체크 5가지`, basedOn: '카테고리 기본값', expectedScore: 73 },
      ],
      lifestyle: [
        { pattern: '{kw} 루틴 공유, 이렇게 바꾸니 달라지더라구요', example: `${primaryKeyword} 루틴 공유, 이렇게 바꾸니 달라지더라구요`, basedOn: '카테고리 기본값', expectedScore: 71 },
      ],
      entertainment: [
        { pattern: '{kw} 본 분들 공감 백프로', example: `${primaryKeyword} 본 분들 공감 백프로`, basedOn: '카테고리 기본값', expectedScore: 70 },
      ],
      finance: [
        { pattern: '{kw} 초보 가이드, {N}분 안에 이해하는 법', example: `${primaryKeyword} 초보 가이드, 5분 안에 이해하는 법`, basedOn: '카테고리 기본값', expectedScore: 80 },
        { pattern: '{kw} 남들이 안 알려주는 {N}가지 현실', example: `${primaryKeyword} 남들이 안 알려주는 3가지 현실`, basedOn: '카테고리 기본값', expectedScore: 78 },
      ],
      general: [
        { pattern: '{kw} 솔직 후기 {N}가지', example: `${primaryKeyword} 솔직 후기 3가지`, basedOn: '일반 기본값', expectedScore: 70 },
      ],
    };
    return fallbackByCategory[cat] || fallbackByCategory.general;
  }

  // Winner Pattern이 충분하면 실측 기반 템플릿 생성
  const topKw = pattern.topKeywords.slice(0, 3).map(k => k.keyword);
  const avgLen = pattern.avgTitleLength;

  templates.push({
    pattern: `{kw} 관련 ${avgLen}자 내외 제목 (상위 10% 평균 길이)`,
    example: `${primaryKeyword} ${topKw.length > 0 ? '관련 ' + topKw[0] : ''} 후기`,
    basedOn: `상위 10% ${pattern.sampleSize}건 실측 평균`,
    expectedScore: pattern.avgTitleScore || 75,
  });

  if (pattern.commonHours.length > 0) {
    const topHour = pattern.commonHours[0];
    templates.push({
      pattern: `{kw} ${topHour.hour}시 발행 타이밍 고려 제목`,
      example: `${primaryKeyword} 지금 확인하세요`,
      basedOn: `상위 10%의 ${topHour.share}%가 ${topHour.hour}시 발행`,
      expectedScore: 75,
    });
  }

  return templates;
}

/**
 * [v2.1.0] 사용자 직접 편집 제목을 실시간 채점 (UI 입력 필드 이벤트용)
 */
export function realtimeScoreTitle(
  userInput: string,
  categoryHint?: string,
): { score: number; tier: string; hint: string } {
  if (!userInput || userInput.trim().length < 5) {
    return { score: 0, tier: 'empty', hint: '제목을 5자 이상 입력해주세요' };
  }
  const analysis = analyzeTitle(userInput, categoryHint);
  const topHint = analysis.suggestions[0] || (analysis.tier === 'excellent' ? '훌륭한 제목입니다!' : '');
  return {
    score: analysis.ctrScore,
    tier: analysis.tier,
    hint: topHint,
  };
}
