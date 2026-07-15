import type { StructuredContent } from '../contentGenerator.js';
import {
  auditAffiliateAuthenticity,
  classifyAffiliateEvidence,
  type AffiliateEvidenceInput,
} from '../content/affiliateAuthenticity.js';
import {
  SHOPPING_CONNECT_PUBLISH_MIN_SCORE,
  SHOPPING_CONNECT_TARGET_SCORE,
  resolveShoppingConnectQualityDisposition,
  validateShoppingConnectContent,
} from '../contentShoppingConnectValidation.js';

const AFFILIATE_AUTHENTICITY_TARGET_SCORE = 85;

export interface ContentQualityV3AffiliateGuardOptions {
  readonly content: Readonly<StructuredContent>;
  readonly source: AffiliateEvidenceInput;
  readonly minimumBodyChars: number;
  readonly authenticityRetryAvailable: boolean;
  readonly shoppingQualityRetryAvailable: boolean;
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
  const authenticity = auditAffiliateAuthenticity({
    title: options.content.selectedTitle,
    body: options.content.bodyPlain,
    evidenceMode,
  });
  const authenticityReason = `shopping authenticity ${authenticity.score}/100: ${authenticity.issues
    .map(issue => issue.code)
    .join(', ')}`;

  if (
    authenticity.score < AFFILIATE_AUTHENTICITY_TARGET_SCORE
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

  const validation = validateShoppingConnectContent(options.content, {
    minimumBodyChars: options.minimumBodyChars,
  });
  const shoppingDisposition = resolveShoppingConnectQualityDisposition(validation.score);

  if (!shoppingDisposition.qualityFloorReached && options.shoppingQualityRetryAvailable) {
    const corrections = validation.feedback
      .filter(message => message.startsWith('❌') || message.startsWith('⚠️'))
      .join('\n- ');
    return Object.freeze({
      action: 'retry-shopping-quality',
      instruction: `[쇼핑커넥트 품질 재작성]\n- ${corrections}\n광고 문구가 아닌 실제 구매 판단 정보로 보완하고 발행 하한 ${SHOPPING_CONNECT_PUBLISH_MIN_SCORE}점 이상, 목표 ${SHOPPING_CONNECT_TARGET_SCORE}점에 가깝게 다시 작성하세요.`,
      reason: `shopping quality ${validation.score}/100`,
    });
  }

  const content = {
    ...options.content,
    quality: {
      ...options.content.quality,
      warnings: Array.from(new Set([
        ...(options.content.quality?.warnings || []),
        ...(validation.score < 100
          ? [
            `[쇼핑커넥트 검증] 품질 ${validation.score}/100`,
            ...validation.feedback.filter(message => (
              message.startsWith('❌') || message.startsWith('⚠️')
            )),
          ]
          : []),
      ])),
      affiliateAuthenticity: {
        score: authenticity.score,
        evidenceMode,
        hardFail: authenticity.hardFail,
        advisoryAccepted: authenticity.score < AFFILIATE_AUTHENTICITY_TARGET_SCORE,
      },
      shoppingValidation: {
        score: validation.score,
        ...shoppingDisposition,
        feedback: [...validation.feedback],
      },
    },
  } as StructuredContent;

  return Object.freeze({ action: 'accept', content });
}
