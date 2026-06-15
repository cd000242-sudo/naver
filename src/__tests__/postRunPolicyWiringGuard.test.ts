import { describe, expect, it } from 'vitest';
import fs from 'fs';

const source = fs.readFileSync('src/naverBlogAutomation.ts', 'utf8');

describe('post-run policy wiring guard', () => {
  it('routes run() browser cleanup decisions through post-run policies', () => {
    expect(source).toContain("from './automation/postRunBrowserPolicy.js'");
    expect(source).toContain("from './automation/postRunPageHealthPolicy.js'");
    expect(source).toContain("from './automation/postRunStalePagePolicy.js'");
    expect(source).toContain('resolvePostRunBrowserPolicy({');
    expect(source).toContain('resolvePostRunPageHealthDecision({');
    expect(source).toContain('resolveStalePageCleanupPlan(allPages, this.page)');
    expect(source).toContain('createPostPublishReviewPlan({');
    expect(source).toContain('reviewPlan.reviewScrollCount');
    expect(source).toContain('reviewPlan.afterHomeDelayMs');
  });
});
