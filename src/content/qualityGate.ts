/**
 * [v2.7.0 Starter Kit Phase 6 — Low Quality Escape + Pre-Publish Gate]
 *
 * 저품질 블로그 탈출 진단 + 발행 전 최종 품질 가드.
 *
 * 초보자 실수로 저품질 계정 되면 홈판 영원히 안 뜸.
 * 본 모듈이:
 *   1. 과거 글 스캔 → 저품질 위험 요소 감지
 *   2. 발행 전 실시간 가드 → 위험 글 차단
 *   3. 회복 가이드 제공
 */

import { validateBloggerIdentity, type BloggerIdentity } from '../promptLoader.js';
import { scoreTitleForHomefeed } from './ctrCombat.js';
import { scoreAdFriendliness } from './adsPostEngine.js';
import type { CTRCategory } from './ctrCombat.js';

// ═══════════════════════════════════════════════════════════════════
// 1. 저품질 위험 요소 DB
// ═══════════════════════════════════════════════════════════════════

export interface LowQualitySignal {
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'ai_cliche' | 'spam' | 'advertising' | 'duplicate' | 'off_topic';
  name: string;
  impact: string;
  howToFix: string;
}

export const LOW_QUALITY_SIGNALS: LowQualitySignal[] = [
  // AI 클리셰 (치명)
  { pattern: /알아보겠습니다|살펴보자/, severity: 'critical', category: 'ai_cliche', name: 'AI 도입부 클리셰', impact: '알고리즘이 AI 생성물로 자동 분류', howToFix: '자연스러운 개인 경험 도입부로 교체' },
  { pattern: /결론적으로 말하자면|많은 분들이/, severity: 'high', category: 'ai_cliche', name: 'AI 결론부 클리셰', impact: '독자 즉시 이탈', howToFix: '구체 사례로 마무리' },
  { pattern: /충격|경악|소름|폭로|실화/, severity: 'high', category: 'ai_cliche', name: 'AI 자극 어휘', impact: '저품질 트리거 + 클릭후 이탈 높음', howToFix: '감정어 대신 구체 수치·경험' },

  // 스팸·키워드 남용
  { pattern: /(.{2,10})\s*\1\s*\1/g, severity: 'high', category: 'spam', name: '키워드 반복 3회+', impact: 'SEO 스팸 감지', howToFix: '동의어·유사어 변주' },
  { pattern: /^#{1,6}\s*(.{1,30})$(\n.{0,20}\n){1,}^#{1,6}\s*\1/m, severity: 'medium', category: 'spam', name: '유사 제목 반복', impact: '구조 스팸', howToFix: '소제목 다양화' },

  // 광고 과다
  { pattern: /(구매링크|할인코드|이벤트|쿠폰)/g, severity: 'medium', category: 'advertising', name: '판매 키워드 과다', impact: '광고 블로그 분류 위험', howToFix: '본문 대비 광고 문구 20% 이하' },
  { pattern: /\[광고\]|\[협찬\]|\[제휴\]/, severity: 'low', category: 'advertising', name: '광고 표기 (양호)', impact: '공정위 준수 — 저품질 아님', howToFix: '유지' },

  // 주제 이탈 (다른 카테고리 대량 혼입)
  { pattern: /(정치|대선|여당|야당|대통령)/, severity: 'medium', category: 'off_topic', name: '정치·시사 주제', impact: '광고주 기피 + 저CPM', howToFix: '정치 주제 분리' },
];

// ═══════════════════════════════════════════════════════════════════
// 2. 발행 전 최종 가드
// ═══════════════════════════════════════════════════════════════════

export interface PrePublishGateResult {
  allowed: boolean;
  score: number;                  // 0-100
  blockers: string[];              // 차단 사유 (통과 불가)
  warnings: string[];              // 경고 (통과는 가능)
  recommendations: string[];
  estimatedRiskImpact: 'safe' | 'mild_risk' | 'moderate_risk' | 'high_risk';
}

/**
 * [v2.7.0] 발행 전 최종 품질 가드 — 실수 방지
 */
export function prePublishGate(params: {
  title: string;
  content: string;
  category: CTRCategory;
  bloggerIdentity?: BloggerIdentity;
  strictness?: 'lenient' | 'moderate' | 'strict';
}): PrePublishGateResult {
  const { title, content, category, bloggerIdentity, strictness = 'moderate' } = params;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // 1. 제목 CTR 점수
  const titleScore = scoreTitleForHomefeed(title, category);
  if (titleScore.score < 40) {
    blockers.push(`제목 CTR 점수 ${titleScore.score}점 (권장 70+)`);
    score -= 30;
  } else if (titleScore.score < 60) {
    warnings.push(`제목 CTR 점수 ${titleScore.score}점 (개선 권장)`);
    score -= 10;
  }
  if (titleScore.suggestions.some(s => s.includes('AI 뻔한 표현'))) {
    blockers.push('제목에 AI 클리셰 감지');
  }

  // 2. Blogger Identity 검증
  if (bloggerIdentity) {
    const idValidation = validateBloggerIdentity(content, bloggerIdentity);
    if (!idValidation.ok) {
      if (idValidation.score < 50) {
        blockers.push(`언어 DNA 일관성 ${idValidation.score}점 (심각 위반)`);
      } else {
        warnings.push(`언어 DNA 일관성 ${idValidation.score}점 — ${idValidation.issues.join(', ')}`);
        score -= 5;
      }
    }
  }

  // 3. 저품질 신호 스캔
  const detectedSignals: LowQualitySignal[] = [];
  for (const signal of LOW_QUALITY_SIGNALS) {
    if (signal.pattern.test(content) || signal.pattern.test(title)) {
      detectedSignals.push(signal);
      if (signal.severity === 'critical') {
        blockers.push(`${signal.name}: ${signal.impact}`);
        score -= 25;
      } else if (signal.severity === 'high') {
        if (strictness === 'strict') blockers.push(`${signal.name}: ${signal.impact}`);
        else warnings.push(`${signal.name}: ${signal.impact}`);
        score -= 15;
      } else if (signal.severity === 'medium') {
        warnings.push(`${signal.name}: ${signal.impact}`);
        score -= 7;
      }
      recommendations.push(signal.howToFix);
    }
  }

  // 4. 광고 친화도
  const adScore = scoreAdFriendliness(content, category);
  if (adScore.score < 50) {
    warnings.push(`광고 친화도 ${adScore.score}점 — 애드포스트 CPM 저하 위험`);
    recommendations.push(...adScore.improvements.slice(0, 2));
    score -= 10;
  }

  // 5. 길이 가드
  if (content.length < 800) {
    blockers.push(`본문 ${content.length}자 (최소 800자)`);
  } else if (content.length < 1200) {
    warnings.push(`본문 짧음 ${content.length}자 (권장 1500+)`);
    score -= 5;
  }

  // 6. 이미지 유무
  const imgCount = (content.match(/!\[.*?\]\(.*?\)|<img/g) || []).length;
  if (imgCount === 0) {
    warnings.push('이미지 0장 — 완독률·체류시간 하락');
    recommendations.push('이미지 최소 2~3장 삽입 권장');
    score -= 8;
  }

  score = Math.max(0, Math.min(100, score));

  // 위험도 판정
  let estimatedRiskImpact: PrePublishGateResult['estimatedRiskImpact'];
  if (blockers.length > 0 || score < 40) estimatedRiskImpact = 'high_risk';
  else if (score < 60) estimatedRiskImpact = 'moderate_risk';
  else if (score < 80) estimatedRiskImpact = 'mild_risk';
  else estimatedRiskImpact = 'safe';

  const allowed = blockers.length === 0;

  return {
    allowed,
    score,
    blockers,
    warnings,
    recommendations: Array.from(new Set(recommendations)).slice(0, 5),
    estimatedRiskImpact,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. 저품질 탈출 진단 (기존 포스팅 스캔)
// ═══════════════════════════════════════════════════════════════════

export interface ExistingPostDiagnosis {
  postId: string;
  title: string;
  riskLevel: 'clean' | 'mild' | 'moderate' | 'severe';
  detectedSignals: string[];
  recommendedAction: 'keep' | 'revise' | 'delete' | 'unpublish';
  revisionPriority: number;        // 0-100 (높을수록 시급)
  revisionAdvice: string[];
}

export function diagnoseExistingPost(post: { id: string; title: string; content: string; category: CTRCategory }): ExistingPostDiagnosis {
  const gateResult = prePublishGate({
    title: post.title,
    content: post.content,
    category: post.category,
    strictness: 'strict',
  });

  const detectedSignals: string[] = [...gateResult.blockers, ...gateResult.warnings];

  let riskLevel: ExistingPostDiagnosis['riskLevel'];
  let recommendedAction: ExistingPostDiagnosis['recommendedAction'];
  let revisionPriority = 0;

  if (gateResult.estimatedRiskImpact === 'safe') {
    riskLevel = 'clean';
    recommendedAction = 'keep';
  } else if (gateResult.estimatedRiskImpact === 'mild_risk') {
    riskLevel = 'mild';
    recommendedAction = 'keep';
    revisionPriority = 30;
  } else if (gateResult.estimatedRiskImpact === 'moderate_risk') {
    riskLevel = 'moderate';
    recommendedAction = 'revise';
    revisionPriority = 60;
  } else {
    riskLevel = 'severe';
    recommendedAction = gateResult.score < 20 ? 'unpublish' : 'revise';
    revisionPriority = 95;
  }

  return {
    postId: post.id,
    title: post.title,
    riskLevel,
    detectedSignals,
    recommendedAction,
    revisionPriority,
    revisionAdvice: gateResult.recommendations,
  };
}

/**
 * [v2.7.0] 다수 포스팅 일괄 진단 + 회복 플랜 생성
 */
export function bulkDiagnoseAndPlan(
  posts: { id: string; title: string; content: string; category: CTRCategory }[],
): {
  summary: { total: number; clean: number; mild: number; moderate: number; severe: number };
  recoveryPlan: {
    immediateActions: ExistingPostDiagnosis[];  // severe 우선 처리
    mediumPriority: ExistingPostDiagnosis[];
    overallRecommendation: string;
  };
} {
  const diagnoses = posts.map(diagnoseExistingPost);
  const summary = {
    total: diagnoses.length,
    clean: diagnoses.filter(d => d.riskLevel === 'clean').length,
    mild: diagnoses.filter(d => d.riskLevel === 'mild').length,
    moderate: diagnoses.filter(d => d.riskLevel === 'moderate').length,
    severe: diagnoses.filter(d => d.riskLevel === 'severe').length,
  };

  const immediateActions = diagnoses
    .filter(d => d.riskLevel === 'severe')
    .sort((a, b) => b.revisionPriority - a.revisionPriority);
  const mediumPriority = diagnoses
    .filter(d => d.riskLevel === 'moderate')
    .sort((a, b) => b.revisionPriority - a.revisionPriority);

  let overallRecommendation: string;
  const severePct = (summary.severe / summary.total) * 100;
  if (severePct > 30) {
    overallRecommendation = '🚨 저품질 탈출 긴급 — severe 포스팅 ' + summary.severe + '개 먼저 비공개 전환 후 1주일 휴지기';
  } else if (severePct > 10) {
    overallRecommendation = '⚠️ 저품질 위험 — severe 포스팅 순차 수정 + moderate 점진 개선';
  } else if (summary.moderate > summary.total * 0.3) {
    overallRecommendation = '📝 품질 개선 권장 — moderate 포스팅 주 2~3건 수정';
  } else {
    overallRecommendation = '✅ 품질 양호 — 현재 방향 유지';
  }

  return {
    summary,
    recoveryPlan: {
      immediateActions,
      mediumPriority,
      overallRecommendation,
    },
  };
}
