import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] 경험 입력을 SEO·홈판에도 연다 (선택형).
 *
 * 지금까지 사용자가 자기 경험을 넣을 수 있는 곳은 쇼핑커넥트 한 곳뿐이었다.
 * 그런데 13개 카테고리 프롬프트가 전부 "사용자 메모가 있을 때만 1인칭으로 쓴다"고
 * 계약한다 — 메모를 받을 경로가 없으니 SEO·홈판에서는 **영구히 거짓인 조건**이었다.
 * 결과적으로 그 두 모드는 구조적으로 정보나열이 될 수밖에 없었다.
 *
 * 뒷단은 이미 열려 있다(실측):
 *   main.ts   personalExperience 를 모드 조건 없이 받아 source 에 넣고
 *             rawText 에 "=== 작성자 직접 사용 메모 ===" 마커로 덧붙인다.
 *   evidenceIntegrity.hasExplicitFirstPartyEvidence 도 그 마커를 이미 인식한다.
 * 막고 있던 것은 렌더러의 `contentMode === 'affiliate'` 게이트 4줄이었다.
 *
 * 비워두면 undefined 가 되어 main.ts 의 `if (personalExperience)` 에 진입하지
 * 않는다 — 기존 동작과 100% 동일하다. 완전 옵트인이다.
 */

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const gen = read('renderer/modules/contentGeneration.ts');

describe('경험 입력 — SEO·홈판에서도 수집한다', () => {
  it('affiliate 전용 게이트가 남아 있지 않다', () => {
    expect(
      gen,
      "contentMode === 'affiliate' 로 막으면 SEO·홈판은 영원히 메모를 못 받는다",
    ).not.toMatch(/personalExperience\s*=\s*contentMode === 'affiliate'/);
  });

  it('두 수집 경로(URL·키워드) 모두에서 값을 읽는다', () => {
    const occurrences = (gen.match(/const personalExperience\s*=/g) || []).length;
    expect(occurrences, 'URL 플로우와 키워드 플로우 두 곳이다').toBe(2);
  });

  it('공용 입력란을 읽는다', () => {
    expect(html, '공용 경험 입력란이 UI에 있어야 한다').toMatch(/id="unified-personal-experience"/);
    expect(gen).toMatch(/unified-personal-experience/);
  });

  it('쇼핑커넥트 전용 입력란도 계속 읽는다 (회귀 방지)', () => {
    expect(gen).toMatch(/shopping-connect-personal-experience/);
  });

  it('길이 상한 4000자를 유지한다', () => {
    const blocks = [...gen.matchAll(/const personalExperience[\s\S]{0,400}?;/g)].map((m) => m[0]);
    expect(blocks.length).toBe(2);
    for (const b of blocks) expect(b).toMatch(/slice\(0,\s*4000\)/);
  });

  it('비어 있으면 undefined 를 넘긴다 (옵트인 보장)', () => {
    const blocks = [...gen.matchAll(/const personalExperience[\s\S]{0,400}?;/g)].map((m) => m[0]);
    for (const b of blocks) expect(b, '빈 문자열을 넘기면 main.ts 가드가 통과된다').toMatch(/\|\|\s*undefined/);
  });
});

describe('후킹 도입부 — UI 상한과 코드 상한이 같다', () => {
  it('코드가 200자로 자르지 않는다', () => {
    // HTML maxlength=1500, contentHookIntroPolicy 도 500자 × 3줄 = 1500자인데
    // 코드만 200자로 잘라 1300자가 조용히 사라졌다.
    expect(gen).not.toMatch(/hookHint[\s\S]{0,200}?slice\(0,\s*200\)/);
  });

  it('UI maxlength 와 코드 상한이 일치한다', () => {
    const uiMax = html.match(/id="unified-hook-sentence"[^>]*maxlength="(\d+)"/)?.[1];
    expect(uiMax).toBeTruthy();
    const hookBlocks = [...gen.matchAll(/hookHint[\s\S]{0,220}?slice\(0,\s*(\d+)\)/g)].map((m) => m[1]);
    expect(hookBlocks.length, 'hookHint 수집 지점 2곳').toBe(2);
    for (const n of hookBlocks) expect(n).toBe(uiMax);
  });
});

describe('후킹 도입부 — 앱이 권하는 예시가 앱 감점에 걸리지 않는다', () => {
  it('placeholder 가 1인칭 체험 문장이 아니다', () => {
    const ph = html.match(/id="unified-hook-sentence"[\s\S]{0,400}?placeholder="([^"]*)"/)?.[1] || '';
    expect(ph.length, 'placeholder 를 찾지 못했다').toBeGreaterThan(0);
    // evidenceIntegrity 의 1인칭 검출 패턴 3종에 걸리는 형태를 예시로 주면
    // 사용자가 시키는 대로 쓸수록 점수가 깎인다.
    expect(ph).not.toMatch(/\d+\s*(?:일|주|개월|달|년)\s*(?:동안\s*)?(?:써|사용|복용|신청|다녀|먹어)/);
    expect(ph).not.toMatch(/써보니|직접\s*(?:써|해|가)/);
  });
});
