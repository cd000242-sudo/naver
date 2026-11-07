/**
 * [2026-11-07] Naver mobile search moved to `sds-comps-*` markup; the keyless collection path
 * parsed 0 results ("네이버 모바일 검색 파싱 결과 부족") on every run. Fixture mirrors live markup.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseNaverMobileSearchSnippets } from '../content/naverMobileSearchParse';

const LIVE_2026_11 = [
  '<a class="fds-anchor-layout" href="https://m.cafe.naver.com/x/1">',
  '<span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-2 VjFoW4ZXJcQZbHy1"><mark>네이버</mark> 블로그 <mark>자동화</mark>하면 저품질 걸릴까?</span></a>',
  '<a class="fds-anchor-layout" href="https://m.cafe.naver.com/x/1">',
  '<span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-2 sds-comps-text-type-body1 YpLyvD5bpmADXfj1">영상은 이 카페에 워낙 많으실 테고, <mark>네이버</mark> 블로그도 발행까지 <mark>자동</mark>으로 돌리는 분들이 있으실 겁니다 &amp; 저도 씁니다.</span></a>',
  '<span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-2 VjFoW4ZXJcQZbHy1">짧은 설명뿐인 글</span>',
  '<span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-2 sds-comps-text-type-body1">너무 짧다</span>',
  '<span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-2">두 번째 글 제목</span>',
  '<span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-2 sds-comps-text-type-body1">두 번째 글 본문 미리보기는 서른 글자를 넘겨야 자료로 쓰입니다. 넘겼습니다.</span>',
].join('');

describe('parseNaverMobileSearchSnippets', () => {
  it('reads the 2026-11 design-system markup as title/snippet pairs', () => {
    const out = parseNaverMobileSearchSnippets(LIVE_2026_11);
    expect(out).toEqual([
      {
        title: '네이버 블로그 자동화하면 저품질 걸릴까?',
        description: '영상은 이 카페에 워낙 많으실 테고, 네이버 블로그도 발행까지 자동으로 돌리는 분들이 있으실 겁니다 & 저도 씁니다.',
      },
      {
        title: '두 번째 글 제목',
        description: '두 번째 글 본문 미리보기는 서른 글자를 넘겨야 자료로 쓰입니다. 넘겼습니다.',
      },
    ]);
  });

  it('still reads the legacy api_txt_lines markup', () => {
    const legacy = '<a class="api_txt_lines total_tit">옛 제목</a>'
      + '<div class="api_txt_lines dsc_txt">옛 화면 설명도 서른 글자를 넘으면 그대로 자료로 들어가야 합니다.</div>';
    expect(parseNaverMobileSearchSnippets(legacy)).toEqual([
      { title: '옛 제목', description: '옛 화면 설명도 서른 글자를 넘으면 그대로 자료로 들어가야 합니다.' },
    ]);
  });

  it('returns nothing for a page without results', () => {
    expect(parseNaverMobileSearchSnippets('<html><body>검색결과가 없습니다</body></html>')).toEqual([]);
  });
});

describe('sourceAssembler keyless path uses the parser', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sourceAssembler.ts'), 'utf8');
  it('replaces the dead api_txt_lines regex', () => {
    expect(src).toMatch(/parseNaverMobileSearchSnippets\(html\)/);
    expect(src).not.toMatch(/const titleMatches = html\.match\(\/class="api_txt_lines/);
  });
});
