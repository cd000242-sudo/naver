import type { QuotaLimits } from './quotaManager.js';

export const FREE_TRIAL_DAILY_PUBLISH_LIMIT = 3;
export const FREE_TRIAL_DAILY_IMAGE_API_LIMIT = 500;

export function createFreeTrialQuotaLimits(): QuotaLimits {
  return {
    publish: FREE_TRIAL_DAILY_PUBLISH_LIMIT,
    content: FREE_TRIAL_DAILY_PUBLISH_LIMIT,
    media: Number.MAX_SAFE_INTEGER,
    imageApi: FREE_TRIAL_DAILY_IMAGE_API_LIMIT,
  };
}
