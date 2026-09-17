// [2026-09-17] 번호 붙은 소제목 줄("4. 제목")로 본문을 자를 때 번호가 앞 섹션 꼬리에 남지 않는다.
// 라이브: 발행 글에 "4." 한 줄이 구분선 위에 따로 찍혔다(나나 정당방위 글). 발행된 섹션 길이가
// indexOf(제목) 슬라이스와 정확히 일치했다 — 줄 단위 추출이 아니라 제목 위치 슬라이스가 만든 내용이다.
import { describe, expect, it } from 'vitest';
import { resolveSemiAutoPublishStructure } from '../renderer/utils/semiAutoHeadingExtractor';
import { headingLineBoundary } from '../automation/structuredHeadingCleanup';

const A = '강도를 제압한 나나가 고소당한 경위';
// 물음표로 끝나 휴리스틱 추출이 버리는 제목 — 그래서 알려진 제목 복구 사다리(indexOf 슬라이스)를 탄다.
const B = '검찰은 왜 다시 10년을 요구했을까?';
const body = [
  '도입부 문장입니다.',
  '',
  `1. ${A}`,
  '',
  '경찰은 불송치했습니다. 다시 살펴볼 수 있는 재판입니다.',
  '',
  `2. ${B}`,
  '',
  '검찰은 범행 이후 행동을 짚었습니다.',
].join('\n');

describe('numbered heading line: known-title slice cuts at the line head', () => {
  it('existing-title recovery leaves no "2." tail on the previous section', () => {
    const out = resolveSemiAutoPublishStructure(body, [
      { title: A, content: 'x' },
      { title: B, content: 'y' },
    ]);
    expect(out.strategy).toBe('body-sections');
    expect(out.headings.map((h) => h.title)).toEqual([A, B]);
    expect(out.headings[0].content).toBe('경찰은 불송치했습니다. 다시 살펴볼 수 있는 재판입니다.');
    expect(out.headings[1].content).toBe('검찰은 범행 이후 행동을 짚었습니다.');
    expect(out.introduction).toBe('도입부 문장입니다.');
  });

  it('image-title slice (last-resort ladder) cuts the same way', () => {
    const noExtract = body.replace(`1. ${A}`, `1. ${A}?`); // 둘 다 추출 실패 → 이미지 제목 사다리
    const out = resolveSemiAutoPublishStructure(noExtract, [], { imageHeadingTitles: [A, B] });
    expect(out.strategy).toBe('body-sections');
    expect(out.headings[0].content).not.toMatch(/\d\.\s*$/);
    expect(out.introduction).toBe('도입부 문장입니다.');
  });

  it('a title preceded by real words on the same line still cuts at the title', () => {
    const inline = `도입.\n\n앞말 ${A}\n\n내용.\n\n${B}\n\n끝.`;
    const out = resolveSemiAutoPublishStructure(inline, [
      { title: A, content: 'x' },
      { title: B, content: 'y' },
    ]);
    expect(out.introduction).toBe('도입.\n\n앞말');
  });
});

describe('headingLineBoundary (publish-side slicer) knows numbered prefixes', () => {
  it('returns the line start for "4. ", "4) ", "## " and "**" prefixes', () => {
    for (const prefix of ['4. ', '4) ', '12. ', '## ', '**', '#### **']) {
      const text = `앞 문단.\n${prefix}${B}\n내용`;
      const at = text.indexOf(B);
      expect(headingLineBoundary(text, at)).toBe(text.indexOf(prefix + B));
    }
  });

  it('keeps the title index when real words precede it', () => {
    const text = `앞 문단.\n앞말 ${B}\n내용`;
    const at = text.indexOf(B);
    expect(headingLineBoundary(text, at)).toBe(at);
  });
});
