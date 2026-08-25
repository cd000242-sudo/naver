import { describe, expect, it } from 'vitest';

import {
  extractSemiAutoDocumentFromBody,
  resolveSemiAutoPublishStructure,
} from '../renderer/utils/semiAutoHeadingExtractor';

/**
 * [2026-08-24 사용자 실측 / 진단리포트 2026-08-24T06-55]
 *
 * 소제목을 분석해 이미지를 수집·배치하고 발행했는데, 중간 소제목이 사라지고 일부만
 * 살아남았다. 사라진 소제목에 걸려 있던 이미지는 전부 글 끝으로 쏠린 채 하나도 삽입되지
 * 않았다. 리포트에는 "소제목 2개 · 전달 이미지 3개 · strategy=body-sections" 로 찍혔다.
 *
 * 원인: resolveSemiAutoPublishStructure 의 첫 분기가 "추출이 1개라도 있으면 즉시 확정"
 * 이었다. 그 아래 복구 사다리(기존 소제목 슬라이스 / 이미지 소제목 슬라이스)는 추출이
 * 0개일 때만 돌았다. 추출 휴리스틱은 34자를 넘고 특정 어미로 끝나지 않는 제목을 버리므로
 * "일부만 잡히는" 경우가 오히려 흔한데, 그 경우가 통째로 방치돼 있었다.
 *
 * 소제목이 사라지면 이미지 슬롯도 함께 사라진다 — 이미지가 끝으로 쏠린 것은 결과이지
 * 원인이 아니다.
 */

/** 34자를 넘고 키워드로 끝나지 않아 추출 휴리스틱이 버리는 제목. */
const LONG_TITLE = '어린 시절 방송에서 보여준 모습과 지금의 모습을 나란히 놓고 본 사람들의 이야기';
const SHORT_TITLE_A = '스타 2세 수식어를 넘어선 순간과 대중들의 반응';
const SHORT_TITLE_B = '가족사 재조명과 사실관계를 바라보는 시선';

const BODY = [
  '예전 예능에서 아빠 손을 잡고 나오던 꼬마를 기억하시나요? 그 아이가 성인이 되어 무대에 섰습니다.',
  '',
  SHORT_TITLE_A,
  '',
  '수상 소식이 알려지자 반응이 빠르게 퍼졌습니다. 이름보다 부모의 이름이 먼저 불리는 일이 반복됐습니다.',
  '',
  LONG_TITLE,
  '',
  '방송 당시 영상과 최근 사진을 나란히 올린 글이 여러 곳에서 공유됐습니다. 닮았다는 반응이 많았습니다.',
  '',
  SHORT_TITLE_B,
  '',
  '확인되지 않은 이야기가 함께 돌기도 했습니다. 공개된 사실과 추측을 나누어 볼 필요가 있습니다.',
].join('\n');

const KNOWN_HEADINGS = [
  { title: SHORT_TITLE_A, content: '이전 내용 A' },
  { title: LONG_TITLE, content: '이전 내용 B' },
  { title: SHORT_TITLE_B, content: '이전 내용 C' },
];

describe('추출 휴리스틱의 한계 (사고의 출발점)', () => {
  it('긴 제목을 조용히 버려 일부만 잡는다', () => {
    const extracted = extractSemiAutoDocumentFromBody(BODY);
    expect(extracted.headings.length).toBeLessThan(KNOWN_HEADINGS.length);
    expect(extracted.headings.map((h) => h.title)).not.toContain(LONG_TITLE);
  });
});

describe('부분 유실 복구 — 아는 소제목이 더 많으면 그것을 쓴다', () => {
  it('기존 소제목으로 전체 구조를 되살린다 (사고 재현)', () => {
    const structure = resolveSemiAutoPublishStructure(BODY, KNOWN_HEADINGS, {
      bodyIsAuthoritative: true,
    });
    expect(structure.headings.map((h) => h.title)).toEqual([
      SHORT_TITLE_A, LONG_TITLE, SHORT_TITLE_B,
    ]);
  });

  it('되살린 각 구간에 본문이 들어 있다 (이미지 슬롯이 살아난다)', () => {
    const structure = resolveSemiAutoPublishStructure(BODY, KNOWN_HEADINGS, {
      bodyIsAuthoritative: true,
    });
    for (const heading of structure.headings) {
      expect(heading.content.trim().length, heading.title).toBeGreaterThan(0);
    }
    expect(structure.introduction).toContain('꼬마를 기억하시나요');
  });

  it('기존 소제목이 없어도 이미지가 걸린 제목으로 되살린다', () => {
    const structure = resolveSemiAutoPublishStructure(BODY, [], {
      bodyIsAuthoritative: true,
      imageHeadingTitles: [SHORT_TITLE_A, LONG_TITLE, SHORT_TITLE_B],
    });
    expect(structure.headings).toHaveLength(3);
    expect(structure.headings.map((h) => h.title)).toContain(LONG_TITLE);
  });

  it('기존 소제목의 다른 필드(프롬프트 등)를 잃지 않는다', () => {
    const withPrompt = KNOWN_HEADINGS.map((h) => ({ ...h, prompt: `프롬프트:${h.title}` }));
    const structure = resolveSemiAutoPublishStructure(BODY, withPrompt, {
      bodyIsAuthoritative: true,
    });
    expect(structure.headings[1].prompt).toBe(`프롬프트:${LONG_TITLE}`);
  });
});

describe('근거가 없으면 구조를 만들어내지 않는다', () => {
  it('아는 제목이 본문에 없으면 추출 결과를 그대로 둔다', () => {
    const structure = resolveSemiAutoPublishStructure(BODY, [
      { title: '본문에 없는 소제목 하나', content: 'x' },
      { title: '본문에 없는 소제목 둘', content: 'y' },
      { title: '본문에 없는 소제목 셋', content: 'z' },
      { title: '본문에 없는 소제목 넷', content: 'w' },
    ], { bodyIsAuthoritative: true });
    const extracted = extractSemiAutoDocumentFromBody(BODY);
    expect(structure.headings.map((h) => h.title)).toEqual(extracted.headings.map((h) => h.title));
  });

  it('아는 제목이 추출보다 적으면 뒤집지 않는다', () => {
    const extracted = extractSemiAutoDocumentFromBody(BODY);
    const structure = resolveSemiAutoPublishStructure(BODY, [KNOWN_HEADINGS[0]], {
      bodyIsAuthoritative: true,
    });
    expect(structure.headings).toHaveLength(extracted.headings.length);
  });

  it('제목 순서가 본문과 어긋나면 되살리지 않는다', () => {
    const reversed = [...KNOWN_HEADINGS].reverse();
    const structure = resolveSemiAutoPublishStructure(BODY, reversed, {
      bodyIsAuthoritative: true,
    });
    const extracted = extractSemiAutoDocumentFromBody(BODY);
    expect(structure.headings).toHaveLength(extracted.headings.length);
  });
});
