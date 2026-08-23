import { describe, expect, it } from 'vitest';
import { resolveSemiAutoPublishStructure } from '../renderer/utils/semiAutoHeadingExtractor';

/**
 * 실측 사고(2026-08-23): 이미지 3장을 만들어 붙였는데 발행된 글에는 이미지가 하나도 없었다.
 * 로그상 에디터 이미지 컴포넌트 0개 — 소제목 해석이 0개가 되어 본문이 통짜로 들어갔고,
 * 이미지 삽입 지점 자체가 사라졌다.
 */
describe('발행 구조 복구 — 이미지 소제목', () => {
  // 마침표로 끝나는 문장형 소제목은 추출기 후보 필터를 전부 통과하지 못한다 — 실측으로
  // extractSemiAutoHeadingsFromBody 가 0개를 돌려주는 형태다.
  const body = [
    '전환하면 실적이 그대로 인정돼요.',
    '납입 횟수와 기간은 그대로 따라옵니다.',
    '창구에서 준비물은 이것만 챙기세요.',
    '신분증과 기존 통장만 있으면 됩니다.',
  ].join('\n\n');

  it('추출도 기존 소제목도 없으면 이미지 소제목으로 본문을 되살린다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], {
      bodyIsAuthoritative: true,
      imageHeadingTitles: ['전환하면 실적이 그대로 인정돼요.', '창구에서 준비물은 이것만 챙기세요.'],
    });

    expect(structure.strategy).toBe('body-sections');
    expect(structure.headings).toHaveLength(2);
    expect(structure.headings[0].content).toContain('납입 횟수와 기간은 그대로 따라옵니다.');
    expect(structure.headings[1].content).toContain('신분증과 기존 통장만 있으면 됩니다.');
  });

  it('이미지 소제목이 본문에 없으면 억지로 자르지 않는다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], {
      bodyIsAuthoritative: true,
      imageHeadingTitles: ['본문에 존재하지 않는 소제목'],
    });

    expect(structure.strategy).toBe('plain-body');
    expect(structure.headings).toHaveLength(0);
  });

  it('이미지 정보가 없으면 기존 동작 그대로 plain-body 로 남는다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], { bodyIsAuthoritative: true });

    expect(structure.strategy).toBe('plain-body');
    expect(structure.headings).toHaveLength(0);
  });
});
