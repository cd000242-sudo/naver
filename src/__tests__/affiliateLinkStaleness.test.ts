import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function readHtml(): string {
  return readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
}

/**
 * [2026-08-05] 쇼핑 제휴 링크가 실행 간에 남아 새 링크를 덮던 버그.
 *
 * 사용자 신고: "쇼핑커넥트모드로 실패하고 나서 새로운 링크로 했는데,
 * 이미지에 들어가는 링크들이 실패했던 이전 링크가 들어가는 버그가 있어."
 *
 * 원인: postManager.saveGeneratedPost가 `unified-affiliate-link`라는
 * **어떤 HTML에도 없는 ID**를 읽었다. getElementById가 항상 null이라
 * 사용자가 새로 입력한 링크는 통째로 무시되고, 폴백 체인
 * (structuredContent.affiliateLink → existingPost.affiliateLink)의
 * 옛 값이 저장돼 발행 시 이미지에 박혔다.
 */
describe('제휴 링크 — 새로 입력한 값이 옛 값을 이긴다', () => {
  const src = read('renderer/modules/postManager.ts');
  const html = readHtml();

  it('저장 로직이 실재하는 입력 ID를 읽는다', () => {
    // 존재하지 않던 ID 재도입 금지 (주석의 이력 설명은 제외 — 코드 라인만 본다)
    const codeOnly = src
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(codeOnly).not.toContain('unified-affiliate-link');

    // 실제로 읽는 ID가 HTML에 있어야 한다
    const readIds = [...codeOnly.matchAll(/getElementById\('([^']*affiliate[^']*|batch-link-input)'\)/g)]
      .map((m) => m[1]);
    expect(readIds.length).toBeGreaterThan(0);
    for (const id of readIds) {
      expect(html, `postManager가 읽는 #${id} 가 index.html에 없습니다`).toContain(`id="${id}"`);
    }
  });

  it('collectPayload와 같은 입력을 읽는다 (경로 간 불일치 방지)', () => {
    const form = read('renderer/modules/formAndAutomation.ts');
    // 발행 payload를 만드는 쪽이 읽는 ID
    expect(form).toContain("getElementById('shopping-connect-affiliate-link')");
    expect(form).toContain("getElementById('batch-link-input')");
    // 저장 쪽도 동일해야 한다
    expect(src).toContain("getElementById('shopping-connect-affiliate-link')");
    expect(src).toContain("getElementById('batch-link-input')");
  });

  it('입력한 링크가 기존 글의 옛 링크보다 우선한다', () => {
    // 저장 객체의 affiliateLink 해석 순서: 입력값이 최우선
    expect(src).toMatch(
      /affiliateLink: typedAffiliateLink\s*\|\|\s*affiliateLinkValue\s*\|\|\s*existingPost\?\.affiliateLink/,
    );
    // 옛 형태(입력값을 거치지 않고 곧장 existingPost로 떨어짐) 재도입 금지
    expect(src).not.toMatch(
      /affiliateLink: affiliateLinkValue \|\| existingPost\?\.affiliateLink \|\| undefined,/,
    );
  });

  it('해석 순서 재현 — 입력이 있으면 저장값을 무시한다', () => {
    // 실제 코드와 동일한 규칙
    const resolve = (typed: string, fromContent: string, fromExisting: string): string | undefined => {
      const affiliateLinkValue = typed || fromContent || '';
      return typed || affiliateLinkValue || fromExisting || undefined;
    };

    // 신고된 시나리오: 실패한 옛 링크가 저장돼 있고, 사용자가 새 링크를 입력
    expect(resolve('https://naver.me/NEW', 'https://naver.me/OLD', 'https://naver.me/OLD'))
      .toBe('https://naver.me/NEW');

    // 입력을 비워두고 수정만 하는 경우 — 기존 링크 유지
    expect(resolve('', '', 'https://naver.me/OLD')).toBe('https://naver.me/OLD');
    expect(resolve('', 'https://naver.me/FROM_CONTENT', 'https://naver.me/OLD'))
      .toBe('https://naver.me/FROM_CONTENT');

    // 아무 데도 없으면 undefined
    expect(resolve('', '', '')).toBeUndefined();
  });
});
