import { describe, expect, it } from 'vitest';
import { isNonBodyImageHeading, resolveSemiAutoPublishStructure } from '../renderer/utils/semiAutoHeadingExtractor';

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

  /**
   * 실측(2026-08-30 진단리포트): URL 로 이미지를 수집해 이미지 관리 탭에 붙였는데
   * 발행 직전 "이미지 N개가 준비돼 있는데 넣을 자리를 찾지 못했습니다" 경고가 반복됐다.
   * 썸네일은 본문에 글자로 존재하지 않는 가짜 소제목인데, 이것이 앵커 목록에 섞여
   * "전부 순서대로 있어야 한다"는 조건을 깨뜨려 복구가 통째로 무산됐다.
   */
  it('썸네일이 섞여 있어도 본문에 실재하는 이미지 소제목으로 복구한다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], {
      bodyIsAuthoritative: true,
      imageHeadingTitles: [
        '🖼️ 썸네일',
        '전환하면 실적이 그대로 인정돼요.',
        '창구에서 준비물은 이것만 챙기세요.',
      ],
    });

    expect(structure.strategy).toBe('body-sections');
    expect(structure.headings).toHaveLength(2);
    expect(structure.headings.map((heading) => heading.title)).not.toContain('🖼️ 썸네일');
  });

  it('본문에 없는 소제목 하나가 섞여도 나머지 실재 소제목은 살린다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], {
      bodyIsAuthoritative: true,
      imageHeadingTitles: [
        '전환하면 실적이 그대로 인정돼요.',
        '본문에서 사용자가 지운 소제목',
        '창구에서 준비물은 이것만 챙기세요.',
      ],
    });

    expect(structure.strategy).toBe('body-sections');
    expect(structure.headings).toHaveLength(2);
  });

  /**
   * 썸네일은 소제목이 아니라 "제목"과 매칭된다 — main.ts 의 전용 썸네일은
   * `heading: title || '🖼️ 썸네일'` 로 만들어져 heading 이 글 제목인 경우가 정상이다.
   * 그 이름이 본문에 없다고 나머지 진짜 소제목까지 버리면 안 된다.
   */
  it('제목 이름을 단 썸네일이 섞여도 본문 소제목 앵커는 살린다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], {
      bodyIsAuthoritative: true,
      imageHeadingTitles: [
        '청약통장 전환, 지금 해도 되나 — 실적 인정 기준 정리',
        '전환하면 실적이 그대로 인정돼요.',
        '창구에서 준비물은 이것만 챙기세요.',
      ],
    });

    expect(structure.strategy).toBe('body-sections');
    expect(structure.headings).toHaveLength(2);
  });

  it('이미지 정보가 없으면 기존 동작 그대로 plain-body 로 남는다', () => {
    const structure = resolveSemiAutoPublishStructure(body, [], { bodyIsAuthoritative: true });

    expect(structure.strategy).toBe('plain-body');
    expect(structure.headings).toHaveLength(0);
  });

  it.each(['🖼️ 썸네일', '썸네일', '🖼️썸네일', '블로그 썸네일', '대표 이미지'])(
    '%s 는 본문 앵커가 아니다',
    (title) => {
      expect(isNonBodyImageHeading(title)).toBe(true);
    },
  );

  it.each(['전환하면 실적이 그대로 인정돼요.', '창구에서 준비물은 이것만 챙기세요.'])(
    '%s 는 본문 앵커로 그대로 쓴다',
    (title) => {
      expect(isNonBodyImageHeading(title)).toBe(false);
    },
  );
});
