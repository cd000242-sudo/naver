/**
 * [2026-10-09 outcome audit] A real 2026-08-09 log landed on
 * https://blog.naver.com/<id>?Redirect=Update&...&logNo=<N> after an immediate publish. The post existed, but the
 * resolver only knew /<id>/<logNo> and ?blogId=&logNo=, so a real publish was reported as "no post URL confirmed".
 */
import { describe, expect, it } from 'vitest';
import {
  extractNaverBlogPostIdentity,
  isConcreteNaverBlogPostUrl,
  normalizeNaverBlogPostUrl,
  resolveImmediatePublishOutcome,
} from '../automation/publishOutcomeResolver';

const editor = 'https://blog.naver.com/leader_248?Redirect=Write&';
const redirectForm = 'https://blog.naver.com/leader_248?Redirect=Update&categoryNo=3&logNo=224318800353';

describe('post identity from the Redirect=Update landing URL', () => {
  it.each([
    redirectForm,
    'https://m.blog.naver.com/leader_248?Redirect=Update&logNo=224318800353',
    'https://blog.naver.com/leader_248/?Redirect=Update&logNo=224318800353',
  ])('reads the path blog id and the logNo query (%s)', (url) => {
    expect(extractNaverBlogPostIdentity(url)).toEqual({ blogId: 'leader_248', logNo: '224318800353' });
    expect(isConcreteNaverBlogPostUrl(url)).toBe(true);
  });

  it('normalises that shape to https://blog.naver.com/<id>/<logNo>', () => {
    expect(normalizeNaverBlogPostUrl(redirectForm)).toBe('https://blog.naver.com/leader_248/224318800353');
    expect(normalizeNaverBlogPostUrl('https://m.blog.naver.com/leader_248?logNo=224318800353'))
      .toBe('https://blog.naver.com/leader_248/224318800353');
  });

  it('leaves the shapes that were already accepted untouched', () => {
    expect(normalizeNaverBlogPostUrl('https://blog.naver.com/leader_248/224318800353'))
      .toBe('https://blog.naver.com/leader_248/224318800353');
    expect(normalizeNaverBlogPostUrl('https://blog.naver.com/PostView.naver?blogId=leader_248&logNo=224318800353'))
      .toBe('https://blog.naver.com/PostView.naver?blogId=leader_248&logNo=224318800353');
  });

  it.each([
    ['a look-alike host', 'https://blog.naver.com.attacker.test/leader_248?Redirect=Update&logNo=224318800353'],
    ['a sibling sub-domain', 'https://evilblog.naver.com/leader_248?logNo=224318800353'],
    ['credentials in front of another host', 'https://blog.naver.com@attacker.test/leader_248?logNo=224318800353'],
    ['the editor itself', 'https://blog.naver.com/leader_248?Redirect=Write&logNo=224318800353'],
    ['a write form', 'https://blog.naver.com/PostWriteForm.naver?logNo=224318800353'],
    ['a list page (page name, not a blog id)', 'https://blog.naver.com/PostList.naver?logNo=224318800353'],
    ['no logNo', 'https://blog.naver.com/leader_248?Redirect=Update'],
    ['a non-numeric logNo', 'https://blog.naver.com/leader_248?Redirect=Update&logNo=abc'],
    ['an empty logNo', 'https://blog.naver.com/leader_248?Redirect=Update&logNo='],
    ['the blog home', 'https://blog.naver.com/leader_248'],
    ['an invalid blog id character', 'https://blog.naver.com/lead%20er?logNo=224318800353'],
  ])('never treats %s as a post', (_label, url) => {
    expect(extractNaverBlogPostIdentity(url)).toBeNull();
    expect(isConcreteNaverBlogPostUrl(url)).toBe(false);
    expect(normalizeNaverBlogPostUrl(url)).toBeNull();
  });
});

describe('resolveImmediatePublishOutcome with the Redirect=Update landing', () => {
  it('counts it as the published post and returns the normalised URL', () => {
    expect(resolveImmediatePublishOutcome({ beforeUrl: editor, finalUrl: redirectForm })).toEqual({
      success: true,
      url: 'https://blog.naver.com/leader_248/224318800353',
      reason: 'CONCRETE_POST_URL',
      needsManualUrlCheck: false,
    });
  });

  it('still rejects the blog home so a draft/redirect is never shown as a publish', () => {
    expect(resolveImmediatePublishOutcome({ beforeUrl: editor, finalUrl: 'https://blog.naver.com/leader_248' }))
      .toMatchObject({ success: false });
  });
});
