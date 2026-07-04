/**
 * subKeywordCoverageGate.test.ts
 *
 * SPEC-KEYWORD-ENDGAME Phase 3 — 서브키워드 커버리지 게이트.
 * 서브키워드가 본문 어디에도 없으면 관련 소제목에 패치(롱테일 노출), 어디든 있으면 무변경
 * (왜곡 최소화), 인물+이슈 조합은 스킵(defamation 정합), 소제목당 1키워드·멱등 잠금.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { enforceSubKeywordCoverage } from '../content/subKeywordCoverageGate';

const makeContent = () => ({
  introduction: '장마철 습기 관리가 고민이라면 오늘 글이 도움이 될 겁니다.',
  conclusion: '오늘 정리한 방법으로 쾌적한 여름 보내세요.',
  headings: [
    { title: '제습기 고르는 기준 3가지', content: '용량과 소음, 전력 소비를 먼저 보세요.' },
    { title: '올바른 사용 위치와 시간대', content: '밀폐된 공간에서 사용해야 효율이 높습니다.' },
    { title: '자주 묻는 질문 정리', content: '필터는 2주에 한 번 세척하는 게 좋습니다.' },
  ],
});

describe('서브키워드 커버리지 게이트', () => {
  it('완전 부재 서브키워드는 토큰 겹침 최대 소제목에 선두 패치된다', () => {
    const content = makeContent();
    const r = enforceSubKeywordCoverage(content, ['제습기 전기세'], {});
    expect(r.patchedCount).toBe(1);
    // "제습기" 토큰이 겹치는 첫 소제목이 타깃
    expect(content.headings[0].title.startsWith('제습기 전기세 ')).toBe(true);
  });

  it('본문 어디든 이미 있으면 무변경 (자연 커버 존중 + 멱등)', () => {
    const content = makeContent();
    // "소음"은 heading[0].content에 존재
    const r = enforceSubKeywordCoverage(content, ['소음'], {});
    expect(r.patchedCount).toBe(0);
    expect(r.items[0].inBody).toBe(true);
    expect(content.headings[0].title).toBe('제습기 고르는 기준 3가지');
    // 멱등: 패치된 키워드 재실행 시 inHeadings=true → 무변경
    const c2 = makeContent();
    enforceSubKeywordCoverage(c2, ['제습기 전기세'], {});
    const titleAfterFirst = c2.headings[0].title;
    const r2 = enforceSubKeywordCoverage(c2, ['제습기 전기세'], {});
    expect(r2.patchedCount).toBe(0);
    expect(c2.headings[0].title).toBe(titleAfterFirst);
  });

  it('소제목당 1키워드 — 서로 다른 서브키워드는 서로 다른 소제목으로', () => {
    const content = makeContent();
    const r = enforceSubKeywordCoverage(content, ['제습기 전기세', '제습기 곰팡이'], {});
    expect(r.patchedCount).toBe(2);
    const patchedTitles = content.headings.filter(
      (h) => h.title.includes('전기세') || h.title.includes('곰팡이'),
    );
    expect(patchedTitles.length).toBe(2);
    // 같은 소제목에 둘 다 쌓이지 않음
    expect(content.headings.some((h) => h.title.includes('전기세') && h.title.includes('곰팡이'))).toBe(false);
  });

  it('인물+이슈 조합은 패치 스킵 (defamation 가드 재사용)', () => {
    const content = makeContent();
    const r = enforceSubKeywordCoverage(content, ['박지성 논란'], {});
    expect(r.patchedCount).toBe(0);
    expect(r.items[0].skippedReason).toBe('person-issue-keyword');
  });

  it('최대 3개 제한 + 빈/짧은 키워드 무시', () => {
    const content = makeContent();
    const r = enforceSubKeywordCoverage(content, ['가나다라1', '가나다라2', '가나다라3', '가나다라4', 'x', ''], {});
    expect(r.items.length).toBe(3); // maxKeywords 기본 3
  });
});

describe('finalize 배선 잠금 (SEO 게이트)', () => {
  it('contentGenerator가 SEO 모드에서 enforceSubKeywordCoverage를 호출한다', () => {
    const src = readFileSync(join(__dirname, '..', 'contentGenerator.ts'), 'utf8');
    expect(src).toContain('enforceSubKeywordCoverage');
    expect(src).toContain('subKeywordCoverageGate');
    expect(src).toContain('[SubKwCoverage]');
  });
});
