import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] 키워드 제목 앞 배치를 "생성 단계 강제"에서 "사용자 옵션"으로 옮겼다.
 *
 * 생성 단계의 앞 3자 강제(SPEC-KEYWORD-ENDGAME)는 base R0-1·evidenceIntegrity 와
 * 정면 충돌해 폐기했다. 그래서 이제 앞 배치를 원하는 사용자에게 남은 통로는
 * "키워드 제목 앞 배치" 체크박스 하나뿐이다. 이 경로가 끊기면 기능이 사라진다.
 *
 * 배선: UI 체크박스 → keywordTitleOpts.useKeywordTitlePrefix
 *       → contentGeneration.ts 가 생성된 제목 앞에 키워드를 붙인다(발행 단계).
 */

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

describe('키워드 앞 배치 — 사용자 옵션 경로가 살아 있다', () => {
  it('UI 체크박스가 존재한다', () => {
    const ids = [...html.matchAll(/id="([a-z-]*keyword-title-prefix)"/g)].map((m) => m[1]);
    expect(ids.length, '앞 배치를 켤 UI가 없으면 기능에 접근할 수 없다').toBeGreaterThan(0);
    expect(ids).toContain('keyword-title-prefix');
  });

  it('체크박스 값이 옵션 객체로 전달된다', () => {
    expect(read('renderer/renderer.ts')).toMatch(/useKeywordTitlePrefix/);
  });

  it('옵션이 켜지면 제목 앞에 키워드를 붙이는 처리가 있다', () => {
    const src = read('renderer/modules/contentGeneration.ts');
    expect(src).toMatch(/keywordTitleOpts\.useKeywordTitlePrefix/);
    // 이미 키워드로 시작하면 중복으로 붙이지 않아야 한다.
    // [2026-08-06] 기준점을 후처리 분기(keywordTitleOpts.useKeywordTitlePrefix)로 고정한다.
    //   단순 'useKeywordTitlePrefix' 첫 매치는 옵션 세팅부(배선)에도 걸려, 그 사이 코드가
    //   늘면 근접 범위를 벗어나 오탐한다.
    // [2026-08-26] 그 판정이 decideKeywordPrefix 로 옮겨갔다(starts-with-keyword +
    //   흩어진 토큰까지 본다). 계약은 그대로이고 위치만 바뀌었으므로 여기서는 호출을
    //   확인하고, 판정 자체는 keywordTitlePrefixPolicy.test.ts 가 직접 실행해 검증한다.
    const idx = src.indexOf('keywordTitleOpts.useKeywordTitlePrefix');
    expect(src.slice(idx, idx + 900)).toMatch(/decideKeywordPrefix\(keyword, currentTitle\)/);
    expect(src.slice(idx, idx + 900)).toMatch(/if \(!prefixDecision\.shouldPrefix\)/);
  });

  it('다중계정 경로에도 같은 처리가 있다', () => {
    expect(read('renderer/modules/multiAccountManager.ts')).toMatch(/useKeywordTitlePrefix/);
  });
});

describe('키워드 앞 배치 — 생성 단계에서는 강제하지 않는다', () => {
  it('SEO base가 앞 3자 공식을 제시하지 않는다', () => {
    expect(read('prompts/seo/base.prompt')).not.toMatch(/메인 키워드\(앞\s*3자/);
  });

  it('앞 3자 고정 금지 규칙(R0-1)은 그대로 살아 있다', () => {
    expect(read('prompts/seo/base.prompt')).toMatch(/첫 3글자나 고정 위치로 옮기지 않는다/);
  });

  it('제목 글자수가 base 안에서 한 값이다', () => {
    const base = read('prompts/seo/base.prompt');
    const ranges = new Set([...base.matchAll(/제목[^\n]{0,24}?(\d{2}~\d{2})자/g)].map((m) => m[1]));
    expect([...ranges], 'R0-9(22~42)와 SECTION 11(28~40)이 어긋나 있었다').toEqual(['22~42']);
  });
});
