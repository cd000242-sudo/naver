import type { StructuredContent } from '../contentGenerator.js';
import {
  auditAffiliateAuthenticity,
  classifyAffiliateEvidence,
  type AffiliateEvidenceMode,
  type AffiliateEvidenceInput,
} from '../content/affiliateAuthenticity.js';
import {
  resolveShoppingConnectQualityDisposition,
  validateShoppingConnectContent,
} from '../contentShoppingConnectValidation.js';
import { stripModelGeneratedShoppingDisclosures } from '../contentShoppingDisclosure.js';
import { auditAffiliateReviewDepth } from '../content/affiliateReviewDepth.js';
import { recoverContentQualityV3BodyHtml } from './finalizer.js';

const AFFILIATE_AUTHENTICITY_TARGET_SCORE = 85;
const AFFILIATE_LOCAL_REPAIR_WARNING = '[쇼핑커넥트 자동 교정] 정책 위험 표현을 제거하고 발행을 계속합니다.';
const SAFE_AFFILIATE_BODY_FALLBACK = '상품 정보와 구매 조건은 판매 페이지의 최신 안내를 기준으로 확인해주세요.';

function hasHardAffiliateIssue(
  value: string,
  evidenceMode: AffiliateEvidenceMode,
  asTitle = false,
): boolean {
  if (!value.trim()) return false;
  const report = auditAffiliateAuthenticity({
    title: asTitle ? value : '',
    body: asTitle ? '' : value,
    evidenceMode,
  });
  return report.issues.some(issue => issue.hard);
}

function removeHardAffiliateSentences(
  value: string | undefined,
  evidenceMode: AffiliateEvidenceMode,
): { text: string; changed: boolean } {
  if (!value?.trim()) return { text: value || '', changed: false };
  let changed = false;
  const lines = value.replace(/\r\n?/gu, '\n').split('\n');
  const repairedLines = lines.map((line) => {
    if (!line.trim()) return '';
    const sentences = line.split(/(?<=[.!?])\s+/u);
    const kept = sentences.filter((sentence) => {
      const remove = hasHardAffiliateIssue(sentence, evidenceMode);
      if (remove) changed = true;
      return !remove;
    });
    return kept.join(' ').trim();
  });
  return {
    text: repairedLines.join('\n').replace(/\n{3,}/gu, '\n\n').trim(),
    changed,
  };
}

function repairAffiliateTitle(title: string, evidenceMode: AffiliateEvidenceMode): string {
  if (!hasHardAffiliateIssue(title, evidenceMode, true)) return title;
  const subject = title
    .replace(/(?:직접|사용\s*후기|후기|리뷰|사용기|체험기|오늘만|무조건|놓치면\s*후회|지금이\s*마지막)/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const candidate = `${subject || '상품'} 구매 전 확인 가이드`.slice(0, 60).trim();
  return hasHardAffiliateIssue(candidate, evidenceMode, true)
    ? '상품 구매 전 확인 가이드'
    : candidate;
}

export function repairContentQualityV3AffiliateTitle(
  title: string,
  source: AffiliateEvidenceInput,
): string {
  return repairAffiliateTitle(title, classifyAffiliateEvidence(source).mode);
}

function repairAffiliateHardFailures(
  content: Readonly<StructuredContent>,
  evidenceMode: AffiliateEvidenceMode,
): { content: StructuredContent; repaired: boolean } {
  const disclosureRepair = stripModelGeneratedShoppingDisclosures(content);
  const workingContent = disclosureRepair.content;
  const selectedTitle = repairAffiliateTitle(workingContent.selectedTitle, evidenceMode);
  const body = removeHardAffiliateSentences(workingContent.bodyPlain, evidenceMode);
  const introduction = removeHardAffiliateSentences(workingContent.introduction, evidenceMode);
  const conclusion = removeHardAffiliateSentences(workingContent.conclusion, evidenceMode);
  let headingChanged = false;
  const headings = workingContent.headings.map((heading, index) => {
    const safeTitle = hasHardAffiliateIssue(heading.title, evidenceMode, true)
      ? `상품 정보 ${index + 1}`
      : heading.title;
    const safeContent = removeHardAffiliateSentences(heading.content, evidenceMode);
    if (safeTitle !== heading.title || safeContent.changed) headingChanged = true;
    return {
      ...heading,
      title: safeTitle,
      content: safeContent.text || SAFE_AFFILIATE_BODY_FALLBACK,
    };
  });
  const repaired = disclosureRepair.repaired
    || selectedTitle !== workingContent.selectedTitle
    || body.changed
    || introduction.changed
    || conclusion.changed
    || headingChanged;
  if (!repaired) return { content: workingContent, repaired: false };

  const bodyPlain = body.text || SAFE_AFFILIATE_BODY_FALLBACK;
  return {
    repaired: true,
    content: {
      ...workingContent,
      selectedTitle,
      bodyPlain,
      bodyHtml: recoverContentQualityV3BodyHtml(bodyPlain),
      content: bodyPlain,
      introduction: introduction.changed
        ? (introduction.text || SAFE_AFFILIATE_BODY_FALLBACK)
        : workingContent.introduction,
      conclusion: conclusion.text,
      headings,
      quality: {
        ...workingContent.quality,
        warnings: Array.from(new Set([
          ...(workingContent.quality?.warnings || []),
          AFFILIATE_LOCAL_REPAIR_WARNING,
        ])),
      },
    },
  };
}

export interface ContentQualityV3AffiliateGuardOptions {
  readonly content: Readonly<StructuredContent>;
  readonly source: AffiliateEvidenceInput;
  readonly minimumBodyChars: number;
  readonly authenticityRetryAvailable: boolean;
  readonly shoppingQualityRetryAvailable: boolean;
  readonly allowLocalRepair?: boolean;
}

export type ContentQualityV3AffiliateGuardDecision = Readonly<
  | {
    action: 'retry-authenticity';
    instruction: string;
    reason: string;
  }
  | {
    action: 'retry-shopping-quality';
    instruction: string;
    reason: string;
  }
  | { action: 'fail'; message: string }
  | { action: 'accept'; content: StructuredContent }
>;

export function evaluateContentQualityV3AffiliateGuard(
  options: ContentQualityV3AffiliateGuardOptions,
): ContentQualityV3AffiliateGuardDecision {
  const evidenceMode = classifyAffiliateEvidence(options.source).mode;
  const localRepair = options.allowLocalRepair === false
    ? { content: options.content as StructuredContent, repaired: false }
    : repairAffiliateHardFailures(options.content, evidenceMode);
  const authenticity = auditAffiliateAuthenticity({
    title: localRepair.content.selectedTitle,
    body: localRepair.content.bodyPlain,
    evidenceMode,
  });
  const authenticityReason = `shopping authenticity ${authenticity.score}/100: ${authenticity.issues
    .map(issue => issue.code)
    .join(', ')}`;
  const reviewDepth = auditAffiliateReviewDepth({
    title: localRepair.content.selectedTitle,
    body: localRepair.content.bodyPlain,
    productReviews: options.source.productReviews,
  });

  if (
    authenticity.score < AFFILIATE_AUTHENTICITY_TARGET_SCORE
    && !localRepair.repaired
    && options.authenticityRetryAvailable
  ) {
    return Object.freeze({
      action: 'retry-authenticity',
      instruction: authenticity.retryDirective,
      reason: authenticityReason,
    });
  }

  if (authenticity.hardFail) {
    const reasons = authenticity.issues.map(issue => issue.message).join(' / ');
    return Object.freeze({
      action: 'fail',
      message: `[CONTENT_SAFETY_BLOCKED] ${reasons}`,
    });
  }

  const validation = validateShoppingConnectContent(localRepair.content, {
    minimumBodyChars: options.minimumBodyChars,
  });
  const shoppingDisposition = resolveShoppingConnectQualityDisposition(validation.score);

  const content = {
    ...localRepair.content,
    quality: {
      ...localRepair.content.quality,
      warnings: Array.from(new Set([
        ...(localRepair.content.quality?.warnings || []),
        ...(validation.score < 100
          ? [
            `[쇼핑커넥트 검증] 품질 ${validation.score}/100`,
            ...validation.feedback.filter(message => (
              message.startsWith('❌') || message.startsWith('⚠️')
            )),
          ]
          : []),
        ...(reviewDepth.issues.length > 0
          ? [`[쇼핑커넥트 후기 품질 경고] ${reviewDepth.issues.map(issue => issue.code).join(', ')}`]
          : []),
      ])),
      affiliateAuthenticity: {
        score: authenticity.score,
        evidenceMode,
        hardFail: authenticity.hardFail,
        advisoryAccepted: authenticity.score < AFFILIATE_AUTHENTICITY_TARGET_SCORE,
      },
      affiliateReviewDepth: reviewDepth,
      shoppingValidation: {
        score: validation.score,
        ...shoppingDisposition,
        feedback: [...validation.feedback],
      },
    },
  } as StructuredContent;

  return Object.freeze({ action: 'accept', content });
}
