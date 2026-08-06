import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06 사용자 실측] "입력한 키워드 그대로 제목 사용하기"를 체크해도 적용되지 않음.
 *
 * 원인: 후처리 로직(contentGeneration.ts, window._keywordTitleOptions 소비)은 있는데,
 * 일반 키워드 발행 경로에서 체크박스(#keyword-as-title / #keyword-title-prefix)를
 * 읽어 그 옵션을 세팅하는 코드가 없었다. 연속발행(continuous-)·풀오토(fullauto-)·
 * 다중계정(ma-setting-)은 각자 읽는데 일반 발행만 빠져 있었다 — 체크가 아무 데도
 * 전달되지 않는 죽은 UI.
 */
describe('keyword-as-title wiring (일반 키워드 발행)', () => {
  const gen = readFileSync(new URL('../renderer/modules/contentGeneration.ts', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

  it('체크박스가 마크업에 존재한다 (회귀 앵커)', () => {
    expect(html).toContain('id="keyword-as-title"');
    expect(html).toContain('id="keyword-title-prefix"');
  });

  it('생성 경로가 일반 발행 체크박스를 읽는다', () => {
    expect(gen).toMatch(/getElementById\('keyword-as-title'\)/);
    expect(gen).toMatch(/getElementById\('keyword-title-prefix'\)/);
  });

  it('읽은 값을 _keywordTitleOptions 에 세팅한다 (후처리가 소비하는 형태)', () => {
    expect(gen).toMatch(/_keywordTitleOptions\s*=\s*\{[\s\S]{0,200}useKeywordAsTitle/);
    expect(gen).toMatch(/useKeywordTitlePrefix/);
  });

  it('키워드 원문을 옵션에 담는다 (제목 교체 소스)', () => {
    expect(gen).toMatch(/_keywordTitleOptions[\s\S]{0,300}keyword:/);
  });

  it('연속발행이 이미 세팅한 옵션을 덮어쓰지 않는다', () => {
    // 연속발행은 setKeywordTitleOptionsFromItem 으로 아이템별 옵션을 먼저 넣는다.
    expect(gen).toMatch(/이미 세팅|연속발행|suppressModal/);
  });

  it('두 옵션 동시 선택 시 "그대로 사용"이 우선한다 (UI 안내와 동일)', () => {
    expect(gen).toMatch(/useKeywordAsTitle \? false : useKeywordTitlePrefix/);
  });

  it('일반 발행 체크박스도 상호배타로 등록된다', () => {
    const renderer = readFileSync(new URL('../renderer/renderer.ts', import.meta.url), 'utf8');
    expect(renderer).toMatch(/setupMutualExclusiveCheckboxes\('keyword-as-title', 'keyword-title-prefix'\)/);
  });
});
