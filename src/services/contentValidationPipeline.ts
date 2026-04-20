/**
 * Content validation pipeline — read-only facade over existing checkers.
 *
 * Design constraints (from Agent Teams 2026-04-20 consensus):
 *   - Pure analysis only. NEVER modifies content. Callers decide what to do.
 *   - Never a blocking gate. Even critical issues do not abort publishing —
 *     they are hints for the caller's retry / warn / override logic.
 *   - Do NOT alter writing style. AuthGR learns fingerprints of validator-
 *     polished text and penalizes it. Scope is facts + structural anchors.
 *   - Facade pattern: reuse contentQualityChecker, authgrDefense (fingerprint),
 *     imageTextConsistencyChecker. This file adds ONLY the pipeline glue and
 *     three missing scanners: verification loop, QUMA anchor, zero-won guard.
 *
 * The retry cap (MaxRetry=2) is the caller's responsibility. This pipeline
 * is a pure function — call it N times, get N identical results.
 */

import {
  checkHomefeedCriticalViolations,
  type CheckableContent,
  type QualityCheckResult,
} from '../contentQualityChecker.js';
import { measureAiFingerprint } from '../authgrDefense.js';
import { scanDefinitionFirstSentences } from '../validators/seo/definitionFirstSentenceScanner.js';
import { scanMainKeywordPosition } from '../validators/seo/mainKeywordPositionScanner.js';
import { scanFaqHeadings } from '../validators/seo/faqHeadingScanner.js';
import { scanLongtailDepth } from '../validators/seo/longtailDepthScanner.js';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export type IssueCategory =
  | 'homefeed_critical'
  | 'ai_fingerprint'
  | 'verification_loop'
  | 'quma_anchor'
  | 'price_artifact'
  // ✅ [2026-04-20 SPEC-SEO-100 W1] SEO-specific categories
  | 'seo_definition_first'
  | 'seo_keyword_position'
  | 'seo_faq_heading'
  | 'seo_longtail_depth';

export interface ValidationIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  /** Where in the content the issue was found, if locatable. */
  location?: 'intro' | 'heading' | 'conclusion' | string;
  /** Optional human-readable hint the caller can show without acting. */
  hint?: string;
}

export interface ValidationMetrics {
  aiFingerprintScore: number;
  totalIssueCount: number;
  criticalIssueCount: number;
  verificationLoopTriggersFound: number;
  qumaAnchorMissCount: number;
  priceArtifactFound: boolean;
  // ✅ [2026-04-20 SPEC-SEO-100 W1] SEO-specific metrics (null when mode !== 'seo')
  seoDefinitionHitRatio: number | null;
  seoKeywordDensity: number | null;
  seoFaqHeadingCount: number | null;
  // ✅ [2026-04-20 SPEC-SEO-100 W4] Long-tail depth
  seoLongtailWordCount: number | null;
  seoLongtailConcretenessSignals: number | null;
}

export interface ValidationResult {
  /** True when no critical issues. Warnings/info do not flip this. */
  pass: boolean;
  issues: ValidationIssue[];
  metrics: ValidationMetrics;
}

export interface ValidationOptions {
  /** Skip AI fingerprint measurement (slow/expensive for bulk runs). */
  skipFingerprint?: boolean;
  /** Required only if content claims it includes images. */
  imageCount?: number;
  /** Validation mode. Defaults to 'homefeed' to preserve legacy behavior. */
  mode?: 'homefeed' | 'seo';
  /** Main keyword for SEO mode. Ignored when mode !== 'seo'. */
  mainKeyword?: string;
  /** Post title for SEO keyword-position check. */
  title?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scanners (pure functions over plain strings)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Homefeed verification-loop triggers that MUST appear in the conclusion. */
const COMMENT_TRIGGER_PATTERNS = [
  /어느\s*쪽/,
  /어떤\s*기준/,
  /비슷한\s*경험/,
  /혹시.*있.*(ㄴ|은|는)/,
];

const SAVE_TRIGGER_PATTERNS = [
  /핵심만\s*(정리|요약)/,
  /□|☐|✓/, // checklist glyphs
  /3줄\s*요약/,
  /(1\)|①|첫째)/,
];

const SHARE_TRIGGER_PATTERNS = [
  /보여주세요/,
  /주변에\s*(있|계시)/,
  /알고.*있.*(어|었).*면/,
  /아까운\s*정보/,
];

function scanVerificationLoop(conclusion: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const hit = (pats: RegExp[]) => pats.some((p) => p.test(conclusion));
  if (!hit(COMMENT_TRIGGER_PATTERNS)) {
    issues.push({
      severity: 'warning',
      category: 'verification_loop',
      message: '결론부에 댓글 유도 질문(구체 선택지)이 감지되지 않음',
      location: 'conclusion',
      hint: '예: "여러분은 A 쪽이세요, B 쪽이세요?"',
    });
  }
  if (!hit(SAVE_TRIGGER_PATTERNS)) {
    issues.push({
      severity: 'warning',
      category: 'verification_loop',
      message: '결론부에 저장 트리거(3줄 요약/체크리스트)가 감지되지 않음',
      location: 'conclusion',
    });
  }
  if (!hit(SHARE_TRIGGER_PATTERNS)) {
    issues.push({
      severity: 'info',
      category: 'verification_loop',
      message: '결론부에 공유 트리거(친구에게 보낼 만한 인상 문장) 약함',
      location: 'conclusion',
    });
  }
  return issues;
}

/** Detects the "0원에 판매" artifact even if upstream price normalizer fails. */
function scanPriceArtifact(fullText: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Must NOT match "15,370원" — the leading 0 must not be preceded by another digit.
  const zeroWonPattern = /(?:^|[^\d,])0\s*원\s*에?\s*(?:판매|가격|팔)/;
  const missingInfoPattern = /가격\s*정보\s*없음/;
  if (zeroWonPattern.test(fullText) || missingInfoPattern.test(fullText)) {
    issues.push({
      severity: 'critical',
      category: 'price_artifact',
      message: '"0원에 판매 중" 또는 "가격 정보 없음" 문구가 본문에 주입됨',
      hint: 'priceNormalizer가 우회됐거나 LLM이 프롬프트 지시를 무시함',
    });
  }
  return issues;
}

/**
 * QUMA anchor check: when the body claims N images, each image anchor should
 * have image-referring keywords in the surrounding 3 sentences. We cannot
 * actually see the images here, so we only warn when image markers (e.g.
 * `[이미지]`, `===THUMBNAIL_HINT===`) exist without adjacent anchor verbs.
 */
function scanQumaAnchors(fullText: string, imageCount: number): ValidationIssue[] {
  if (imageCount === 0) return [];
  const anchorVerbPattern = /(보면|위|아래|왼쪽|오른쪽|사진|이미지|그림)/g;
  const matches = fullText.match(anchorVerbPattern) || [];
  // Heuristic: at least 2× imageCount anchor-verb mentions expected
  // (one before + one after each image).
  const expected = imageCount * 2;
  const found = matches.length;
  if (found < expected) {
    return [
      {
        severity: 'warning',
        category: 'quma_anchor',
        message: `QUMA 앵커 키워드 부족 (발견 ${found} / 기대 ${expected}+)`,
        hint: '이미지 직전·직후 문장에 "아래 사진", "위 이미지", 피사체 키워드 필요',
      },
    ];
  }
  return [];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pipeline entrypoint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function flattenContent(content: CheckableContent): string {
  const parts: string[] = [];
  if (content.introduction) parts.push(content.introduction);
  for (const h of content.headings ?? []) {
    if (h.title) parts.push(h.title);
    if (h.body) parts.push(h.body);
    if (h.content) parts.push(h.content);
  }
  if (content.conclusion) parts.push(content.conclusion);
  return parts.join('\n\n');
}

export function validateContent(
  content: CheckableContent,
  options: ValidationOptions = {},
): ValidationResult {
  const flat = flattenContent(content);
  const issues: ValidationIssue[] = [];

  // 1. Homefeed critical violations (existing module)
  const criticalCheck: QualityCheckResult = checkHomefeedCriticalViolations(content);
  for (const violation of criticalCheck.violations) {
    issues.push({
      severity: 'critical',
      category: 'homefeed_critical',
      message: violation,
    });
  }

  // 2. AI fingerprint — inform only, never block
  let fingerprintScore = 0;
  if (!options.skipFingerprint) {
    const fp = measureAiFingerprint(flat);
    fingerprintScore = fp.overallRisk ?? 0;
    if (fingerprintScore >= 70) {
      issues.push({
        severity: 'warning',
        category: 'ai_fingerprint',
        message: `AI 지문 위험도 ${fingerprintScore}/100 — 문체 다양화 권장`,
      });
    }
  }

  // 3. Verification loop (comment / save / share triggers in conclusion)
  const conclusion = content.conclusion ?? '';
  const loopIssues = scanVerificationLoop(conclusion);
  issues.push(...loopIssues);

  // 4. Price artifact (2nd line of defense over promptLoader fix)
  const priceIssues = scanPriceArtifact(flat);
  issues.push(...priceIssues);

  // 5. QUMA anchors (only when image count is provided)
  const imageCount = options.imageCount ?? 0;
  const qumaIssues = scanQumaAnchors(flat, imageCount);
  issues.push(...qumaIssues);

  // 6. SEO-specific scanners (only when mode === 'seo')
  let seoDefinitionHitRatio: number | null = null;
  let seoKeywordDensity: number | null = null;
  let seoFaqHeadingCount: number | null = null;
  let seoLongtailWordCount: number | null = null;
  let seoLongtailConcretenessSignals: number | null = null;

  if (options.mode === 'seo') {
    const defCheck = scanDefinitionFirstSentences(content);
    seoDefinitionHitRatio = defCheck.hitRatio;
    if (defCheck.totalHeadings > 0 && defCheck.hitRatio < 0.6) {
      issues.push({
        severity: 'warning',
        category: 'seo_definition_first',
        message: `H2 정의문 비율 낮음 (${Math.round(defCheck.hitRatio * 100)}%, 60% 이상 권장) — AI 브리핑 인용 확률 저하`,
        hint: '각 H2 첫 문장을 "A는 B이다" 또는 "핵심은 ~" 형태로',
      });
    }

    const kwCheck = scanMainKeywordPosition(
      { ...content, title: options.title },
      options.mainKeyword ?? '',
    );
    if (!kwCheck.emptyInput) {
      seoKeywordDensity = kwCheck.keywordDensity;
      if (!kwCheck.titleHasKeywordInFirst3Chars) {
        issues.push({
          severity: 'warning',
          category: 'seo_keyword_position',
          message: '제목 앞 3자 이내에 메인 키워드 미배치 — 검색 매칭 손실',
          hint: '제목 맨 앞에 메인 키워드를 배치하세요',
        });
      }
      if (!kwCheck.introMentionsKeyword) {
        issues.push({
          severity: 'warning',
          category: 'seo_keyword_position',
          message: '도입부 첫 100자에 메인 키워드 미등장',
        });
      }
    }

    const faqCheck = scanFaqHeadings(content);
    seoFaqHeadingCount = faqCheck.questionHeadingCount;
    if (!faqCheck.withinRecommendedRange && faqCheck.totalHeadings >= 3) {
      issues.push({
        severity: faqCheck.questionHeadingCount === 0 ? 'warning' : 'info',
        category: 'seo_faq_heading',
        message: `질문형 소제목 개수 권장 범위(1~2) 밖 (현재 ${faqCheck.questionHeadingCount}개)`,
        hint: 'AI 브리핑 인용 확률 2배 상승 구간',
      });
    }

    // ✅ [SEO W4] Long-tail depth scanner
    const longtailCheck = scanLongtailDepth(
      options.title ?? '',
      options.mainKeyword ?? '',
      flat,
    );
    seoLongtailWordCount = longtailCheck.keywordWordCount;
    seoLongtailConcretenessSignals = longtailCheck.bodyConcretenessSignals;
    for (const warning of longtailCheck.warnings) {
      issues.push({
        severity: 'warning',
        category: 'seo_longtail_depth',
        message: warning,
      });
    }
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;

  const metrics: ValidationMetrics = {
    aiFingerprintScore: fingerprintScore,
    totalIssueCount: issues.length,
    criticalIssueCount: criticalCount,
    verificationLoopTriggersFound: 3 - loopIssues.length,
    qumaAnchorMissCount: qumaIssues.length,
    priceArtifactFound: priceIssues.length > 0,
    seoDefinitionHitRatio,
    seoKeywordDensity,
    seoFaqHeadingCount,
    seoLongtailWordCount,
    seoLongtailConcretenessSignals,
  };

  return {
    pass: criticalCount === 0,
    issues,
    metrics,
  };
}
