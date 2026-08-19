// 노출 판정이 네이버 디자인 변경에 다시 눈멀지 않게 잠근다.
//
// 실측(2026-08-19): 네이버가 검색 화면을 `sds-comps-*` 디자인시스템으로 바꾸면서
// 기존 카드 셀렉터(.lst_total/.blog_area/.total_wrap/.title_link)가 전부 0건이 됐다.
// HTML 415KB 안에 글 링크 304개가 그대로 있었는데도 카드는 0개로 잡혔고,
// 그 결과 노출 판정 117회가 100% "상위 0개 중 미발견"으로 기록됐다.
// (그 데이터를 먹는 복리 학습 루프·캘리브레이션까지 같이 죽어 있었다.)

import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { extractCards, extractCardsByLinkOrder } from '../analytics/dynamicSerpProbe';

/** 새 마크업 흉내 — 클래스 이름에 옛 셀렉터가 하나도 없다. */
function newMarkup(entries: Array<{ blogId: string; logNo: string; title: string }>): string {
  const body = entries.map((e) => `
    <div class="sds-comps-vertical-layout">
      <a href="https://blog.naver.com/${e.blogId}/${e.logNo}" class="sds-comps-profile"><span>${e.blogId}</span></a>
      <a href="https://blog.naver.com/${e.blogId}/${e.logNo}" class="sds-comps-text"><span>${e.title}</span></a>
    </div>`).join('');
  return `<html><body><div class="sds-comps-base-layout">${body}</div></body></html>`;
}

const SAMPLE = [
  { blogId: 'jalanika2', logNo: '224370507170', title: '모두가 궁금해한 손 진단의 정체' },
  { blogId: 'ncbv1', logNo: '224375937970', title: '이모란 등장인물 정리' },
  { blogId: 'leader_248', logNo: '224372990473', title: '이모란의 정체는? 손 진단은 어디까지' },
];

describe('링크 순서 추출 — 클래스가 바뀌어도 순위를 얻는다', () => {
  it('문서 등장 순서대로 위치를 매긴다', () => {
    const cards = extractCardsByLinkOrder(cheerio.load(newMarkup(SAMPLE)), 10);
    expect(cards.map((c) => c.blogger)).toEqual(['jalanika2', 'ncbv1', 'leader_248']);
    expect(cards.map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it('같은 글의 링크가 여러 번 나와도 한 번만 센다 (썸네일·블로그명·제목)', () => {
    const cards = extractCardsByLinkOrder(cheerio.load(newMarkup(SAMPLE)), 10);
    expect(cards).toHaveLength(3);
  });

  it('같은 글을 가리키는 앵커 중 가장 긴 텍스트를 제목으로 쓴다', () => {
    const cards = extractCardsByLinkOrder(cheerio.load(newMarkup(SAMPLE)), 10);
    // 짧은 쪽(blogId)이 아니라 제목이 잡혀야 한다
    expect(cards[0].title).toBe('모두가 궁금해한 손 진단의 정체');
    expect(cards[0].title).not.toBe('jalanika2');
  });

  it('maxCards 를 넘지 않는다', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      blogId: `blogger${i}`, logNo: String(224000000000 + i), title: `글 ${i}`,
    }));
    expect(extractCardsByLinkOrder(cheerio.load(newMarkup(many)), 10)).toHaveLength(10);
  });

  it('모바일 도메인(m.blog.naver.com)도 잡는다', () => {
    const $ = cheerio.load('<a href="https://m.blog.naver.com/someone/224111111111">모바일 글</a>');
    const cards = extractCardsByLinkOrder($, 10);
    expect(cards).toHaveLength(1);
    expect(cards[0].blogger).toBe('someone');
  });

  it('블로그 링크가 없으면 빈 배열 (예외 없이)', () => {
    expect(extractCardsByLinkOrder(cheerio.load('<html><body>결과 없음</body></html>'), 10)).toEqual([]);
  });
});

describe('extractCards — 셀렉터가 죽으면 링크 순서로 되짚는다', () => {
  it('옛 셀렉터가 하나도 안 맞아도 카드를 뽑는다 (2026-08 회귀 지점)', () => {
    const cards = extractCards(cheerio.load(newMarkup(SAMPLE)), 10);
    expect(cards.length).toBe(3);
    expect(cards.find((c) => c.blogger === 'leader_248')?.position).toBe(3);
  });

  it('옛 마크업이 살아 있으면 그 경로를 그대로 쓴다 (기존 동작 보존)', () => {
    const legacy = `<html><body><div class="lst_total">
      ${['a1', 'a2', 'a3', 'a4'].map((id, i) => `
        <li class="bx">
          <a class="api_txt_lines" href="https://blog.naver.com/${id}/2240000000${i}">옛 카드 ${i}</a>
        </li>`).join('')}
    </div></body></html>`;
    const cards = extractCards(cheerio.load(legacy), 10);
    expect(cards).toHaveLength(4);
    expect(cards[0].title).toBe('옛 카드 0');
  });

  it('카드가 0개로 잡히는 상태를 그대로 통과시키지 않는다', () => {
    // 이 테스트가 깨지면 노출 판정이 다시 100% "미발견"으로 굳는다.
    const cards = extractCards(cheerio.load(newMarkup(SAMPLE)), 10);
    expect(cards.length).toBeGreaterThan(0);
  });
});
