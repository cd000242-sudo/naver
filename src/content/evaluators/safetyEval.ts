/**
 * 안전성 평가기 — 끝판왕 Phase 1 (v2.10.177)
 *
 * 기존 검증 모듈을 통합:
 *   - sourceFidelityCheck: 원본 보존율
 *   - hallucinationCheck: sentiment mismatch + 부정 키워드 환각
 *   - forbidden patterns: AI 보고체, 광고 클리셰 (qualityGate.ts 기존 모듈 위임)
 *
 * 평가 항목 (가중치 합 100):
 *   1. Fidelity (원본 모드일 때) — 60점
 *   2. Hallucination — 25점
 *   3. Forbidden 패턴 부재 — 15점
 *
 * 원본 텍스트(rawText)가 짧으면(<500자) Fidelity 제외, 가중치 재분배.
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';
import { checkSourceFidelity } from '../sourceFidelityCheck';
import { checkHallucination, inferHallucinationCategory } from '../hallucinationCheck';
import { auditAffiliateAuthenticity } from '../affiliateAuthenticity';
import { auditEvidenceIntegrity } from '../evidenceIntegrity';

const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /알아보겠습니다|살펴보겠습니다|시작하겠습니다|마치겠습니다/, label: 'AI 보고체' },
  { pattern: /충격|경악|폭로|소름|실화/, label: 'AI 자극 어휘' },
  { pattern: /결론적으로 말하자면|많은 분들이/, label: 'AI 결론 클리셰' },
];

export function evaluateSafety(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const rawText = input.rawText || '';
  const hasRawSource = rawText.length >= 500;

  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  // 1. Fidelity (60점) — rawText 있을 때만
  if (hasRawSource) {
    try {
      const fid = checkSourceFidelity({
        rawText,
        resultBody: body,
        minCompressionRatio: 0.85,
        minRetentionScore: 0.92,
      });
      let fidScore = 0;
      // compression 0~30점
      const compRaw = Math.min(1, fid.compressionRatio / 0.85);
      fidScore += compRaw * 30;
      // retention 0~30점
      const retRaw = Math.min(1, fid.retentionScore / 0.92);
      fidScore += retRaw * 30;
      details.fidelity = Math.round(fidScore);
      details.compressionRatio = Math.round(fid.compressionRatio * 100) / 100;
      details.retentionScore = Math.round(fid.retentionScore * 100) / 100;

      if (!fid.passed) {
        if (fid.compressionRatio < 0.85) issues.push(`원본 압축률 ${(fid.compressionRatio * 100).toFixed(0)}% (URL 모드 임계 85%)`);
        if (fid.retentionScore < 0.92) issues.push(`핵심 fact 보존율 ${(fid.retentionScore * 100).toFixed(0)}% (URL 모드 임계 92%)`);
        if (fid.missingFacts.length > 0) {
          suggestions.push(`누락 핵심 정보: ${fid.missingFacts.slice(0, 3).join(', ')}`);
        }
      }
      total += fidScore;
    } catch {
      details.fidelity = 45;
      total += 45;
    }
  } else {
    // rawText 없으면 가중치 재분배: hallucination 50, forbidden 50
    details.fidelity = -1;
  }

  // 2. Hallucination
  try {
    const category = inferHallucinationCategory({
      contentMode: input.contentMode,
      toneStyle: input.toneStyle,
      categoryHint: input.categoryHint,
    });
    const hall = checkHallucination(rawText, body, category);
    let hallScore = hasRawSource ? 25 : 50;  // rawText 없으면 더 비중 ↑
    if (hall.isLikelyHallucinated) {
      hallScore = 0;
      issues.push(`강한 환각 의심 (P${hall.positiveOriginal}/N${hall.negativeOriginal} → P${hall.positiveResult}/N${hall.negativeResult})`);
      if (hall.suspiciousNegativeKeywords.length > 0) {
        suggestions.push(`원본에 없는 부정 키워드 출현: ${hall.suspiciousNegativeKeywords.slice(0, 3).join(', ')}`);
      }
    } else if (hall.warnings.length > 0) {
      hallScore = Math.round(hallScore * 0.5);
      issues.push(`환각 경고 신호: ${hall.warnings.slice(0, 2).join('; ')}`);
    }
    details.hallucination = hallScore;
    details.hallucinationCategory = -1; // category는 string이라 details에 못 넣음 — 로그용
    total += hallScore;
  } catch {
    const fallback = hasRawSource ? 20 : 40;
    details.hallucination = fallback;
    total += fallback;
  }

  // 3. Forbidden 패턴 (15 or 50점)
  const forbiddenWeight = hasRawSource ? 15 : 50;
  let forbiddenScore = forbiddenWeight;
  for (const fp of FORBIDDEN_PATTERNS) {
    const matches = body.match(fp.pattern);
    if (matches && matches.length > 0) {
      const penalty = Math.min(forbiddenWeight, matches.length * 5);
      forbiddenScore -= penalty;
      issues.push(`금지 패턴 [${fp.label}] ${matches.length}회 출현`);
      suggestions.push(`${fp.label} 표현 삭제 또는 자연스러운 표현으로 교체`);
    }
  }
  details.forbidden = Math.max(0, forbiddenScore);
  total += Math.max(0, forbiddenScore);

  // rawText 없으면 fidelity 슬롯이 비어있으므로 총합 100에 맞춰 정규화 안 됨
  // (hallucination 50 + forbidden 50 = 100)
  if (!hasRawSource && details.fidelity === -1) {
    delete details.fidelity;
  }

  let finalScore = Math.round(Math.max(0, Math.min(100, total)));

  if (input.mode === 'affiliate' && input.affiliateEvidenceMode) {
    const authenticity = auditAffiliateAuthenticity({
      title: input.title,
      body,
      evidenceMode: input.affiliateEvidenceMode,
    });
    details.affiliateAuthenticity = authenticity.score;
    if (authenticity.hardFail) {
      finalScore = Math.min(finalScore, 35);
      for (const issue of authenticity.issues.filter(item => item.hard)) {
        issues.push(`쇼핑 진정성 하드 실패: ${issue.message}`);
      }
      suggestions.push('작성자 실사용 근거·구매자 후기·스펙을 구분해 전체 문장을 다시 작성');
    } else if (authenticity.score < 85) {
      finalScore = Math.min(finalScore, authenticity.score);
      issues.push(...authenticity.issues.map(issue => `쇼핑 진정성: ${issue.message}`));
      suggestions.push('광고 기획 문구와 상투어를 지우고 구체 조건·한계·대상 독자로 다시 표현');
    }
  } else {
    const evidence = auditEvidenceIntegrity({
      title: input.title,
      body,
      groundingText: input.groundingText || rawText,
      firstPartyEvidenceAvailable: input.firstPartyEvidenceAvailable === true,
    });
    details.evidenceIntegrity = evidence.score;
    if (evidence.hardFail) {
      finalScore = Math.min(finalScore, 35);
      for (const issue of evidence.issues) {
        const examples = issue.examples.length > 0 ? ` (${issue.examples.join(', ')})` : '';
        const label = issue.code === 'UNSUPPORTED_FIRST_PERSON'
          ? '근거 없는 1인칭 체험'
          : '근거 없는 구체 수치';
        issues.push(`${label}: ${issue.message}${examples}`);
      }
      suggestions.push('작성자 경험, 수치, 기간, 금액은 입력 근거가 있을 때만 남기고 나머지는 조건·절차·확인처로 바꿔 작성');
    }
  }

  return {
    score: finalScore,
    details,
    issues,
    suggestions,
  };
}
