import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [2026-08-27 사장님 실측] "줄바꿈 회귀됐나...? 또 엄청 넓네"
 *
 * 빈 문단은 회귀가 아니었다 — 원본 2문단에 빈 문단 2개로 정상이었다.
 * 넓어 보인 원인은 다른 데 있었다. 붙여넣기는 읽기 편하라고 문장마다 <p> 를
 * 하나씩 만드는데, 그 <p> 가 전부 아래 여백 30px 을 달고 있었다.
 * 한 문단 안 문장 사이에도 30px 이 들어가 문단 경계와 구분이 안 됐다.
 *
 * 30px 은 스페이서가 없던 시절(v2.11.152) 문단 간격을 혼자 맡던 값이다.
 * 지금은 문단 경계를 빈 문단이 맡으므로, 문장 사이는 좁혀야 둘이 구별된다.
 */
const gapOf = (tag: string): number => {
  const m = tag.match(/margin:0 auto (\d+)px/);
  return m ? Number(m[1]) : -1;
};

describe('문단 안 문장 간격', () => {
  const html = buildMobileRichHtml('첫 문장입니다. 둘째 문장입니다.\n\n다음 문단입니다.').html;
  const tags = html.match(/<p[^>]*>/g) || [];
  const inner = tags.filter((t) => !t.includes('data-rich-para-end') && !t.includes('data-rich-spacer'));
  const ends = tags.filter((t) => t.includes('data-rich-para-end'));

  it('문단 안 문장은 좁게 붙는다', () => {
    expect(inner.length).toBeGreaterThan(0);
    for (const tag of inner) expect(gapOf(tag)).toBeLessThanOrEqual(10);
  });

  it('문단 끝은 넓게 벌린다 — 경계가 보여야 한다', () => {
    expect(ends.length).toBeGreaterThan(0);
    for (const tag of ends) expect(gapOf(tag)).toBeGreaterThanOrEqual(20);
  });

  it('문단 경계가 문장 사이보다 확실히 넓다', () => {
    expect(gapOf(ends[0])).toBeGreaterThan(gapOf(inner[0]) * 2);
  });

  it('빈 문단은 문단 경계에만 남는다 — 이전 수정이 유지된다', () => {
    expect((html.match(/data-rich-spacer/g) || []).length).toBe(2);
  });
});

describe('사장님이 받은 본문으로 확인', () => {
  const text = [
    "26일 공개된 유튜브 채널 '효연의 레벨업' 티파니가 당황한 대목은 유리의 눈웃음 흉내였어요."
      + ' 이유는 장난이 세서가 아니라 검색창 쪽이었습니다.',
    '본인이 온 이유도 직접 말했거든요. "요즘에 효리수가 루머가 많다. 해체 위기가 왔다더라.'
      + ' 그래서 제가 왔다."라고 설명했죠.',
  ].join('\n\n');

  it('문장이 많아도 빈 문단은 문단 수만큼만 생긴다', () => {
    const html = buildMobileRichHtml(text).html;
    expect((html.match(/data-rich-spacer/g) || []).length).toBe(2);
  });

  it('30px 짜리 문장 간격이 남아 있지 않다', () => {
    const html = buildMobileRichHtml(text).html;
    const wide = (html.match(/<p(?![^>]*data-rich-para-end)[^>]*margin:0 auto 30px/g) || []).length;
    expect(wide).toBe(0);
  });
});
