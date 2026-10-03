import { describe, expect, it } from 'vitest';

import {
  extractSemiAutoDocumentFromBody,
  resolveSemiAutoPublishStructure,
} from '../renderer/utils/semiAutoHeadingExtractor';

const TITLES = [
  '함께 떠난 하와이 여행',
  '둘이 함께한 하루의 변화',
  '3년 전 혼자 갔던 하와이와 나란히 놓으면',
  '여행을 마치고 남은 이야기',
];
const COMPARISON_LINES = [
  '함께한 사람: 3년 전 혼자 / 이번엔 아내와',
  '하루 동선: 3년 전 운동과 숙소 왕복 / 이번엔 식사, 해변, 쇼핑, 불꽃놀이',
  '먹는 것: 3년 전 단조로운 식사 / 이번엔 레스토랑 저녁과 케이크',
  '아침: 이번엔 김종국이 직접 차림',
];
const SECTION_CONTENTS = [
  '이번 여행은 함께한 사람이 달라진 여행이었습니다.',
  '식사와 해변 산책으로 하루를 보냈습니다.',
  [
    '3년 전 여행과 이번 여행의 차이를 비교했습니다.',
    ...COMPARISON_LINES,
    '김종국도 먹는 것과 동선이 어찌나 다른지 모르겠다며 두 여행을 비교했습니다.',
    '다만 변하지 않은 것도 하나 있습니다. 헬스장이에요.',
  ].join('\n\n'),
  '일상으로 돌아와서도 함께한 시간이 기억에 남았습니다.',
];
const INTRODUCTION = '같은 여행지에서도 함께하는 사람에 따라 하루가 달라집니다.';
const BODY = [
  INTRODUCTION,
  ...TITLES.map((title, index) => `## ${title}\n\n${SECTION_CONTENTS[index]}`),
].join('\n\n');
const KNOWN_HEADINGS = Object.freeze(TITLES.map((title, index) => Object.freeze({
  title,
  content: SECTION_CONTENTS[index],
  prompt: `이미지 ${index + 1}`,
})));

function expectFourSections(document: ReturnType<typeof extractSemiAutoDocumentFromBody>) {
  expect(document.headings.map((heading) => heading.title)).toEqual(TITLES);
  expect(document.introduction).toBe(INTRODUCTION);
  expect(document.headings[2].content).toBe(SECTION_CONTENTS[2]);
  for (const comparison of COMPARISON_LINES) {
    expect(document.headings[2].content).toContain(comparison);
  }
}

describe('명시된 소제목 사이의 비교 항목은 발행 중 소제목으로 늘어나지 않는다', () => {
  it('일반 본문 분석도 ## 네 개가 있으면 본문 비교 항목을 세 번째 본문에 보존한다', () => {
    expectFourSections(extractSemiAutoDocumentFromBody(BODY));
  });

  it('이미지 관리의 네 소제목으로 발행할 때 다섯 번째 이미지 슬롯을 만들지 않는다', () => {
    const resolved = resolveSemiAutoPublishStructure(BODY, KNOWN_HEADINGS, {
      bodyIsAuthoritative: true,
      imageHeadingTitles: TITLES,
    });

    expectFourSections(resolved);
    expect(resolved.strategy).toBe('body-sections');
    expect(resolved.orderLocked).toBe(true);
    expect(KNOWN_HEADINGS.map((heading) => heading.content)).toEqual(SECTION_CONTENTS);
  });

  it('저장된 소제목이 없어도 명시된 네 개와 본문 비교 문장을 보존한다', () => {
    expectFourSections(resolveSemiAutoPublishStructure(BODY, [], {
      bodyIsAuthoritative: true,
    }));
  });

  it('오인식한 비교 제목이 과거 소제목과 이미지에 남아 있어도 명시된 네 개만 발행한다', () => {
    const staleTitles = [...TITLES.slice(0, 3), COMPARISON_LINES[0], TITLES[3]];
    const staleHeadings = staleTitles.map((title) => ({ title, content: '저장된 옛 본문' }));
    const resolved = resolveSemiAutoPublishStructure(BODY, staleHeadings, {
      bodyIsAuthoritative: true,
      imageHeadingTitles: staleTitles,
    });

    expectFourSections(resolved);
  });

  it('사용자가 비교 항목에도 ## 표기를 붙이면 지정한 다섯 개를 모두 발행한다', () => {
    const markedComparisonBody = BODY.replace(COMPARISON_LINES[0], `## ${COMPARISON_LINES[0]}`);
    const expectedTitles = [...TITLES.slice(0, 3), COMPARISON_LINES[0], TITLES[3]];
    const analyzed = extractSemiAutoDocumentFromBody(markedComparisonBody);
    const published = resolveSemiAutoPublishStructure(markedComparisonBody, KNOWN_HEADINGS, {
      bodyIsAuthoritative: true,
      imageHeadingTitles: TITLES,
    });

    expect(analyzed.headings.map((heading) => heading.title)).toEqual(expectedTitles);
    expect(published.headings.map((heading) => heading.title)).toEqual(expectedTitles);
    expect(published.headings[3].content).toContain(COMPARISON_LINES[1]);
    expect(published.headings[3].content).toContain(COMPARISON_LINES[3]);
  });

  it('markedOnly 분석과 사용자 지정 잠금 발행 결과가 동일하다', () => {
    const analyzed = extractSemiAutoDocumentFromBody(BODY, { markedOnly: true });
    const published = resolveSemiAutoPublishStructure(BODY, KNOWN_HEADINGS, {
      bodyMarkupIsAuthoritative: true,
      imageHeadingTitles: [...TITLES, COMPARISON_LINES[0]],
    });

    expectFourSections(analyzed);
    expectFourSections(published);
    expect(published.headings).toEqual(analyzed.headings);
  });

  it('사용자가 표기를 모두 해제해 잠근 본문에 과거 소제목을 되살리지 않는다', () => {
    const plainBody = BODY.replace(/^## /gm, '');
    const published = resolveSemiAutoPublishStructure(plainBody, KNOWN_HEADINGS, {
      bodyMarkupIsAuthoritative: true,
      imageHeadingTitles: TITLES,
    });

    expect(published.headings).toEqual([]);
    expect(published.introduction).toBe(plainBody);
    expect(published.strategy).toBe('plain-body');
  });
});

describe('표기가 없는 생성 원고는 확인된 이미지 관리 소제목과 발행 구조를 맞춘다', () => {
  const unmarkedBody = BODY.replace(/^## /gm, '');

  it('기존 네 제목이 독립된 줄에 순서대로 있으면 비교 문장을 추가 소제목으로 만들지 않는다', () => {
    // 표기 없는 원고의 일반 추출 규칙은 유지하고 발행 단계에서 확인된 구조를 우선한다.
    expect(extractSemiAutoDocumentFromBody(unmarkedBody).headings).toHaveLength(5);
    const resolved = resolveSemiAutoPublishStructure(unmarkedBody, KNOWN_HEADINGS, {
      bodyIsAuthoritative: true,
      preferKnownHeadings: true,
      imageHeadingTitles: TITLES,
    });

    expectFourSections(resolved);
  });

  it('확인된 제목으로 구분할 때 저장된 옛 본문 대신 사용자가 수정한 최신 본문을 쓴다', () => {
    const editedBody = unmarkedBody.replace(COMPARISON_LINES[1], '하루 동선: 사용자가 수정한 새로운 일정');
    const resolved = resolveSemiAutoPublishStructure(editedBody, KNOWN_HEADINGS, {
      bodyIsAuthoritative: true,
      preferKnownHeadings: true,
    });

    expect(resolved.headings.map((heading) => heading.title)).toEqual(TITLES);
    expect(resolved.headings[2].content).toContain('하루 동선: 사용자가 수정한 새로운 일정');
    expect(resolved.headings[2].content).not.toContain(COMPARISON_LINES[1]);
    expect(resolved.headings[2].prompt).toBe('이미지 3');
    expect(KNOWN_HEADINGS[2].content).toContain(COMPARISON_LINES[1]);
  });

  it('옛 제목이 본문 문장 안에만 있으면 제목으로 잘라내지 않고 기존 분석을 사용한다', () => {
    const staleHeadings = [{ title: '여행과 이번 여행의 차이', content: '옛 글 내용' }];
    const resolved = resolveSemiAutoPublishStructure(unmarkedBody, staleHeadings, {
      bodyIsAuthoritative: true,
      preferKnownHeadings: true,
    });

    expect(resolved.headings).toEqual(extractSemiAutoDocumentFromBody(unmarkedBody).headings);
    expect(resolved.headings[2].content).toContain('3년 전 여행과 이번 여행의 차이를 비교했습니다.');
  });

  it('기존 제목 중 일부가 본문에 없으면 불완전한 과거 목록으로 현재 구조를 덮지 않는다', () => {
    const staleHeadings = [...KNOWN_HEADINGS, { title: '다른 글에 있던 제목', content: '옛 글 내용' }];
    const resolved = resolveSemiAutoPublishStructure(unmarkedBody, staleHeadings, {
      bodyIsAuthoritative: true,
      preferKnownHeadings: true,
    });

    expect(resolved.headings).toEqual(extractSemiAutoDocumentFromBody(unmarkedBody).headings);
  });
});
