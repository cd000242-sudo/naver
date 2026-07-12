import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  createImmediatePublishOutcomeUnknownError,
  isImmediatePublishOutcomeUnknown,
} from '../automation/immediatePublishCommitPolicy';

describe('immediate publish commit boundary', () => {
  it('uses a non-retryable stable error after an irreversible click', () => {
    const error = createImmediatePublishOutcomeUnknownError(
      new Error('사용자가 자동화를 취소했습니다.'),
    );

    expect(error.message).toContain('PUBLISH_UNCONFIRMED');
    expect(error.message).not.toContain('USER_CANCELLED');
    expect(isImmediatePublishOutcomeUnknown(error)).toBe(true);
  });

  it('marks every immediate confirmation click before clicking', () => {
    const source = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    const clickPattern = /await confirmPublishButton\.click\(\)/g;
    const clickIndexes = [...source.matchAll(clickPattern)].map((match) => match.index ?? -1);

    expect(clickIndexes.length).toBeGreaterThanOrEqual(3);
    for (const clickIndex of clickIndexes) {
      const preceding = source.slice(Math.max(0, clickIndex - 180), clickIndex);
      expect(preceding).toContain('immediatePublishCommitAttempted = true');
    }
    expect(source).toContain('createImmediatePublishOutcomeUnknownError');
  });
});
