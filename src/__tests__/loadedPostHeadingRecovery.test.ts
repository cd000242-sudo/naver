/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { reconstructGeneratedPostStructuredContent } from '../renderer/modules/postListUI';

/**
 * 실측 사고(2026-08-23): 페러프레이징 → 이미지 생성 → 글 목록에서 다시 불러오기 → 이미지 배치
 * → 발행했더니 글만 나가고 이미지가 하나도 안 들어갔다.
 * 페러프레이징이 소제목을 빈 배열로 덮던 시절(~v2.11.208)에 저장된 글은 headings=[] 로 남아
 * 있고, 그대로 불러오면 발행이 본문을 통짜로 넣어 이미지 삽입 지점이 사라진다.
 */
describe('저장된 글 불러오기 — 소제목 복구', () => {
  const body = [
    '전환하면 이런 게 달라집니다',
    '',
    '국민주택과 민영주택 청약이 모두 열립니다.',
    '',
    '창구에서 챙길 준비물',
    '',
    '신분증과 기존 통장이면 충분합니다.',
  ].join('\n');

  it('저장된 소제목이 비어 있으면 본문에서 되살린다', () => {
    const restored = reconstructGeneratedPostStructuredContent({
      id: 'p1', title: '제목', content: body, headings: [],
    });

    expect(restored.headings.length).toBeGreaterThan(0);
    expect(restored.headings[0].source).toBe('load:body-heading');
  });

  it('저장된 소제목이 있으면 그대로 쓴다 — 덮어쓰지 않는다', () => {
    const stored = [{ title: '원래 소제목', content: '내용', prompt: '원래 소제목' }];
    const restored = reconstructGeneratedPostStructuredContent({
      id: 'p2', title: '제목', content: body, headings: stored,
    });

    expect(restored.headings).toEqual(stored);
  });

  it('본문에서도 못 찾으면 빈 배열로 남는다 — 억지로 만들지 않는다', () => {
    const restored = reconstructGeneratedPostStructuredContent({
      id: 'p3', title: '제목', content: '한 줄짜리 본문입니다.', headings: [],
    });

    expect(restored.headings).toEqual([]);
  });
});
