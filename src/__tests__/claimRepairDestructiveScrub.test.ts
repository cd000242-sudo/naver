import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairUnsupportedClaims } from '../contentPolicy/claimRepair';
import { makeGoodDraft, makePolicyInput } from './contentPolicyFixtures';

/*
 * [2026-09-22] Inspector, not deleter.
 *
 * repairUnsupportedClaims is non-destructive by default — CONTENT_POLICY_DESTRUCTIVE_SCRUB
 * must be explicitly set to '1' to get the legacy delete-and-substitute-fallback behavior.
 * This is the exact regression the 2026-09-21 live incident diagnosed: a real user's
 * article had its title silently replaced with "… 확인 가이드" and its headings with
 * "핵심 내용부터 살펴보기" after the publish boundary scrubbed an unsupported price sentence.
 */
describe('repairUnsupportedClaims — CONTENT_POLICY_DESTRUCTIVE_SCRUB default OFF', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const unsupported = '국내생산 윈드포스 기술을 적용한 이 시트커버는 45,800원에 판매되고 있습니다.';

  function draftWithUnsupportedSentence() {
    const base = makeGoodDraft();
    return makeGoodDraft({
      title: base.title,
      introduction: `${base.introduction} ${unsupported}`,
      headings: [
        { ...base.headings[0], content: `${base.headings[0].content} ${unsupported}` },
        ...base.headings.slice(1),
      ],
    });
  }

  it('returns the draft unchanged when the env flag is unset', () => {
    vi.stubEnv('CONTENT_POLICY_DESTRUCTIVE_SCRUB', '');
    const draft = draftWithUnsupportedSentence();
    const input = makePolicyInput();

    const repaired = repairUnsupportedClaims(draft, input, [unsupported]);

    expect(repaired).toEqual(draft);
    expect(repaired.title).not.toContain('확인 가이드');
    expect(repaired.headings.some((heading) => heading.title === '핵심 내용부터 살펴보기')).toBe(false);
    expect(repaired.introduction).toContain('45,800원');
  });

  it('returns the draft unchanged when the env flag is explicitly "0"', () => {
    vi.stubEnv('CONTENT_POLICY_DESTRUCTIVE_SCRUB', '0');
    const draft = draftWithUnsupportedSentence();
    const repaired = repairUnsupportedClaims(draft, makePolicyInput(), [unsupported]);
    expect(repaired).toEqual(draft);
  });

  it('applies the legacy destructive scrub only when CONTENT_POLICY_DESTRUCTIVE_SCRUB=1', () => {
    vi.stubEnv('CONTENT_POLICY_DESTRUCTIVE_SCRUB', '1');
    const draft = draftWithUnsupportedSentence();
    const input = makePolicyInput();

    const repaired = repairUnsupportedClaims(draft, input, [unsupported]);

    expect(repaired.introduction).not.toContain('45,800원');
    expect(repaired).not.toEqual(draft);
  });
});
