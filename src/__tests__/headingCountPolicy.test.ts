import { describe, it, expect } from 'vitest';
import {
  resolveHeadingCountRange,
  judgeHeadingCount,
  describeHeadingCount,
} from '../content/headingCountPolicy';

describe('소제목 개수 단일 출처 (2026-08-26 하네스 충돌 정리)', () => {
  it('SEO 3개는 두 검증기 모두 통과 — 예전의 정반대 판정이 사라진다', () => {
    const range = resolveHeadingCountRange('seo');
    expect(judgeHeadingCount(3, range)).toBe('ok');
    expect(describeHeadingCount(3, range)).toContain('✅');
  });

  it('모드마다 프롬프트가 요구하는 범위를 그대로 쓴다', () => {
    expect(resolveHeadingCountRange('mate')).toMatchObject({ min: 5, max: 7 });
    expect(resolveHeadingCountRange('affiliate')).toMatchObject({ min: 4, max: 7 });
    expect(resolveHeadingCountRange('homefeed')).toMatchObject({ min: 3, max: 7 });
  });

  it('홈판 이슈 서사는 소제목 0개도 정상이다 (issue-story.prompt 0~3)', () => {
    const range = resolveHeadingCountRange('homefeed', { issueStory: true });
    expect(judgeHeadingCount(0, range)).toBe('ok');
    expect(judgeHeadingCount(2, range)).toBe('ok');
    expect(judgeHeadingCount(5, range)).toBe('too-many');
  });

  it('모르는 모드는 SEO 기준으로 폴백한다', () => {
    expect(resolveHeadingCountRange('unknown-mode')).toEqual(resolveHeadingCountRange('seo'));
  });
});
