import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('immediate publish outcome wiring guard', () => {
  const source = readFileSync('src/naverBlogAutomation.ts', 'utf8');

  it('validates immediate publish outcome after every high-level publish call', () => {
    const publishCalls = source.match(/await this\.publishBlogPost\(resolvedOptions\.publishMode, resolvedOptions\.scheduleDate, resolvedOptions\.scheduleMethod\);/g) || [];
    const beforeUrlCaptures = source.match(/const beforePublishUrl = this\.page\?\.url\(\) \|\| '';/g) || [];
    const guards = source.match(/this\.verifyImmediatePublishOutcome\(beforePublishUrl\);/g) || [];

    expect(publishCalls).toHaveLength(2);
    expect(beforeUrlCaptures).toHaveLength(2);
    expect(guards).toHaveLength(2);
  });

  it('uses the shared publish outcome resolver instead of ad hoc URL checks', () => {
    expect(source).toContain("} from './automation/publishOutcomeResolver'");
    expect(source).toContain('isNaverEditorUrl,');
    expect(source).toContain('formatPublishGuardLog,');
    expect(source).toContain('const outcome = resolveImmediatePublishOutcome({');
    expect(source).toContain('throw new Error(`[${outcome.code}] ${outcome.message}`)');
    expect(source).toContain('this.publishedUrl = resolvePublishedUrlAfterOutcome(this.publishedUrl, outcome)');
    expect(source).toContain('const guardLog = formatPublishGuardLog(outcome, this.publishedUrl)');
    expect(source).not.toContain("!afterUrl.includes('GoBlogWrite')");
    expect(source).not.toContain("!afterUrl.includes('blogPostWrite')");
  });
});
