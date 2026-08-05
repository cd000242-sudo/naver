import { describe, expect, it } from 'vitest';
import { removeDuplicateHeadings } from '../contentDuplicateCleanup.js';

describe('contentDuplicateCleanup', () => {
  it('keeps the first duplicated heading and removes later duplicate heading blocks', () => {
    const body = [
      '소제목 A',
      '첫 번째 내용입니다. 충분히 긴 문단으로 남겨둡니다.',
      '',
      '소제목 A',
      '두 번째 중복 내용입니다. 이 문단은 제거되어야 합니다.',
    ].join('\n');

    const result = removeDuplicateHeadings(body, [{ title: '소제목 A' }]);

    expect(result).toContain('첫 번째 내용입니다');
    expect(result).not.toContain('두 번째 중복 내용입니다');
  });

  it('removes repeated closing paragraphs after the first one', () => {
    const result = removeDuplicateHeadings(
      [
        '본문 내용입니다. 이 문단은 충분히 길어서 유지됩니다.',
        '',
        '도움이 되었으면 좋겠습니다.',
        '',
        '도움이 되었으면 좋겠습니다.',
      ].join('\n'),
      [{ title: '본문' }],
    );

    expect((result.match(/도움이 되었으면 좋겠습니다/g) || [])).toHaveLength(0);
  });

  it('removes inline CTA leftovers from generated body text', () => {
    const result = removeDuplicateHeadings(
      '본문 내용입니다. 이 문단은 충분히 길어서 유지됩니다.\n\n자세히 보기',
      [{ title: '본문' }],
    );

    expect(result).toBe('본문 내용입니다. 이 문단은 충분히 길어서 유지됩니다.');
  });
});

// [2026-08-05 라이브 실측] SEO 이슈글 첫 소제목 본문이 2벌(불릿판+평문판)로 발행되고,
//   "…있습니다.서로를"처럼 문단이 구분자 없이 이어 붙었다. 원인 2가지:
//   (a) 꼬리 1000자 재구성이 문단 경계를 파괴하고 slice 경계를 그대로 이어붙임
//   (b) 문단 dedupe가 불릿 마커·문장부호를 정규화하지 않아 불릿판/평문판 중복을 놓침
describe('contentDuplicateCleanup — 꼬리 재구성·불릿 중복 회귀', () => {
  it('꼬리 문장 중복 제거가 무관한 문단의 경계와 원문을 보존한다', () => {
    const dupA = '두 사람이 서로를 의심하게 되는 계기가 이 장면에서 나옵니다';
    const dupB = '두 사람이 서로를 의심하게 되는 계기가 바로 이 장면에서 나옵니다';
    const keepX = '방송 편성 순서와 촬영 뒷이야기가 이어지는 정리 문단입니다.';
    const keepY = '다음 회차에서 확인할 지점을 짚어 두는 마지막 문단입니다.';
    const body = [
      keepX,
      `${dupA}. 중간에 다른 정리 문장이 하나 들어갑니다. ${dupB}.`,
      keepY,
    ].join('\n\n');

    const result = removeDuplicateHeadings(body, [{ title: '소제목' }]);

    // 중복 문장(뒤쪽)은 제거된다
    expect(result).not.toContain('계기가 바로 이 장면');
    expect(result).toContain('계기가 이 장면에서 나옵니다');
    // 무관한 문단은 원형 그대로, 문단 경계(\n\n)도 살아 있어야 한다
    expect(result).toContain(keepX);
    expect(result).toContain(keepY);
    expect(result.split(/\n\n+/).length).toBeGreaterThanOrEqual(3);
    // 구분자 없는 이음새("…니다.서로를" 류)가 생기면 안 된다
    expect(result).not.toMatch(/[가-힣]\.[가-힣]/);
  });

  it('1000자 초과 본문에서도 꼬리 문단 경계가 보존된다', () => {
    // 문단 dedupe(0.85)에 걸리지 않도록 서로 다른 내용으로 구성한다.
    const headParagraphs = [
      '첫 방송을 앞두고 제작진이 공개한 예고편에는 두 주인공의 첫 만남 장면이 담겨 있었습니다.',
      '촬영지는 서울 성수동의 한 카페 골목으로, 실제 운영 중인 매장을 빌려 진행했다고 전해집니다.',
      '대본 리딩 현장에서는 배우들의 호흡이 예상보다 잘 맞아 일정이 앞당겨졌다는 후문입니다.',
      '편성 시간대는 금토 밤 10시로 확정됐고, 경쟁작과의 시청률 구도가 관심을 모으고 있습니다.',
      '음악 감독은 전작에서 호평받은 OST 라인업을 다시 꾸렸다고 인터뷰에서 밝혔습니다.',
      '의상 팀은 계절 변화를 화면에 담기 위해 촬영 순서를 역순으로 조정했다고 설명했습니다.',
      '해외 판권은 이미 여러 플랫폼과 협의 중이며 일본 선판매가 먼저 성사됐다는 보도가 있었습니다.',
      '원작 웹툰과 달라진 설정은 주인공의 직업으로, 드라마에서는 변호사로 바뀌었습니다.',
      '조연 캐스팅에는 연극 무대 출신 배우들이 대거 합류해 연기 밀도를 높였다는 평가가 나옵니다.',
      '제작 발표회에서 감독은 결말을 열어 두는 방식은 고려하지 않는다고 선을 그었습니다.',
      '시청자 게시판에는 방영 전부터 원작 팬들의 기대와 우려가 함께 올라오고 있습니다.',
      '방영 직전 공개된 하이라이트 영상이 조회수를 빠르게 올리며 마지막 배경 정리입니다.',
    ].map((paragraph, index) =>
      `${paragraph.slice(0, -1)}, 이 내용은 ${index + 1}차 보도와 ${index + 2}차 예고를 거치며 다시 확인됐습니다.`,
    );
    const dupA = '결말에서 두 사람이 화해하게 되는 계기가 마지막 회에 나옵니다';
    const dupB = '결말에서 두 사람이 화해하게 되는 계기가 바로 마지막 회에 나옵니다';
    const body = `${headParagraphs.join('\n\n')}\n\n${dupA}. ${dupB}.`;

    const result = removeDuplicateHeadings(body, [{ title: '소제목' }]);

    expect(body.length).toBeGreaterThan(1000);
    expect(result).not.toContain('계기가 바로 마지막');
    expect(result).toContain('계기가 마지막 회에 나옵니다');
    // 꼬리 직전 문단과 중복 정리된 문단 사이 경계(\n\n)가 살아 있어야 한다
    expect(result).toMatch(/마지막 배경 정리입니다[^\n]*\n\n결말에서/);
    expect(result).not.toMatch(/[가-힣]\.[가-힣]/);
  });

  it('같은 내용의 불릿판/평문판 문단은 하나만 남긴다 (첫 번째 유지)', () => {
    const bullets = [
      '- 서로를 의심하는 장면이 반복됩니다',
      '- 감정선이 어긋나는 계기가 나옵니다',
      '- 마지막 회에서 갈등이 정리됩니다',
    ].join('\n');
    const plain = '서로를 의심하는 장면이 반복됩니다. 감정선이 어긋나는 계기가 나옵니다. 마지막 회에서 갈등이 정리됩니다.';
    const body = [bullets, plain, '남아야 하는 별개 내용의 마지막 문단입니다 편성 정보만 정리합니다'].join('\n\n');

    const result = removeDuplicateHeadings(body, [{ title: '소제목' }]);

    expect(result).toContain('- 서로를 의심하는 장면이 반복됩니다');
    expect(result).not.toContain('반복됩니다. 감정선이');
    expect(result).toContain('남아야 하는 별개 내용의 마지막 문단입니다');
  });
});
