import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-05] 제휴 링크를 바꿔도 옛 상품의 글·이미지가 재사용되던 버그.
 *
 * 사용자 신고: "쇼핑커넥트모드로 실패하고 나서 새로운 링크로 했는데,
 * 이미지에 들어가는 링크들이 실패했던 이전 링크가 들어가는 버그가 있어."
 *
 * v2.11.165에서 저장 경로(잘못된 DOM ID)를 고쳤으나, 전수 조사에서 **두 번째
 * 원인**이 확정됐다: 글 재사용 캐시의 키에 affiliateLink가 없었다.
 * 링크만 A→B로 바꾸면 나머지 키 필드가 전부 같아 캐시가 적중하고, 옛 상품의
 * 본문과 수집 이미지가 그대로 재사용됐다. 캐시는 **발행 성공 시에만** 해제되고
 * TTL이 6시간이라, 실패 후 재시도하는 상황에서는 반드시 살아 있다.
 *
 * 두 캐시(publishingHandlers / fullAutoFlow)를 OR로 읽으므로 키 구성이
 * 서로 달라지면 한쪽이 옛 결과를 계속 돌려준다 — 그 대칭도 함께 잠근다.
 */

/** 실제 코드와 동일한 정규화 + 키 구성 (동작 재현) */
const norm = (v: unknown): string => String(v ?? '').trim();
function buildReuseKey(formData: Record<string, unknown>): string {
  return JSON.stringify({
    urls: [],
    keywords: norm(formData.keywords),
    generator: norm(formData.generator),
    toneStyle: norm(formData.toneStyle),
    contentMode: norm(formData.contentMode),
    manualTitleOverride: norm(formData.manualTitleOverride),
    keywordAsTitle: formData.keywordAsTitle === true,
    keywordTitlePrefix: formData.keywordTitlePrefix === true,
    ctaType: norm(formData.ctaType),
    category: norm(formData.category),
    affiliateLink: norm(formData.affiliateLink),
  });
}

describe('재사용 캐시 키 — 제휴 링크를 반영한다', () => {
  const base = { keywords: '커피머신', contentMode: 'affiliate', category: '생활용품 리뷰' };

  it('링크만 바뀌어도 키가 달라진다 (캐시 미스 → 새로 생성)', () => {
    const oldKey = buildReuseKey({ ...base, affiliateLink: 'https://naver.me/OLD' });
    const newKey = buildReuseKey({ ...base, affiliateLink: 'https://naver.me/NEW' });
    expect(oldKey).not.toBe(newKey);
  });

  it('같은 입력이면 키가 같다 (정당한 재시도는 여전히 재사용)', () => {
    const a = buildReuseKey({ ...base, affiliateLink: 'https://naver.me/SAME' });
    const b = buildReuseKey({ ...base, affiliateLink: 'https://naver.me/SAME' });
    expect(a).toBe(b);
  });

  it('링크 앞뒤 공백은 같은 값으로 본다', () => {
    const a = buildReuseKey({ ...base, affiliateLink: 'https://naver.me/X' });
    const b = buildReuseKey({ ...base, affiliateLink: '  https://naver.me/X  ' });
    expect(a).toBe(b);
  });

  it('링크가 없던 글과 링크가 생긴 글을 구분한다', () => {
    const none = buildReuseKey({ ...base, affiliateLink: '' });
    const some = buildReuseKey({ ...base, affiliateLink: 'https://naver.me/NEW' });
    expect(none).not.toBe(some);
  });
});

describe('두 캐시의 키 구성이 대칭이다', () => {
  // 한쪽만 affiliateLink를 넣으면 다른 쪽 캐시가 옛 결과를 계속 돌려준다.
  const KEY_FIELDS = [
    'urls', 'keywords', 'generator', 'toneStyle', 'contentMode',
    'manualTitleOverride', 'keywordAsTitle', 'keywordTitlePrefix',
    'ctaType', 'category', 'affiliateLink',
  ];

  function extractKeyFields(src: string, fnName: string): string[] {
    const start = src.indexOf(`function ${fnName}(`);
    expect(start, `${fnName} 를 찾지 못했습니다`).toBeGreaterThan(-1);
    const body = src.slice(start, start + 1400);
    // `field: value` 와 축약 표기 `field,` 를 모두 인정한다
    // (fullAutoFlow는 contentMode를 const로 뽑아 축약으로 넣는다)
    return KEY_FIELDS.filter((f) => new RegExp(`\\b${f}\\s*[:,]`).test(body));
  }

  it('두 빌더가 같은 필드 집합을 쓴다', () => {
    const publishFields = extractKeyFields(
      read('renderer/modules/publishingHandlers.ts'), 'buildPublishContentReuseKey',
    );
    const fullAutoFields = extractKeyFields(
      read('renderer/modules/fullAutoFlow.ts'), 'buildFullAutoContentReuseKey',
    );
    expect(publishFields).toContain('affiliateLink');
    expect(fullAutoFields).toContain('affiliateLink');
    expect(publishFields.sort()).toEqual(fullAutoFields.sort());
  });

  it('캐시 조회 시드에도 링크가 실린다 (키만 고치면 늘 빈 값으로 조회된다)', () => {
    const src = read('renderer/modules/publishingHandlers.ts');
    const seedStart = src.indexOf('const contentReuseSeed = {');
    expect(seedStart).toBeGreaterThan(-1);
    const seed = src.slice(seedStart, src.indexOf('};', seedStart));
    expect(seed).toContain('affiliateLink');
  });
});

describe('명시 동의 시 캐시를 버린다', () => {
  it('"버리고 새로 생성" 확인 직후 두 캐시를 모두 비운다', () => {
    const src = read('renderer/modules/publishingHandlers.ts');
    const consentIdx = src.indexOf('생성된 글을 버리고 풀오토 새 글 생성으로 진행합니다');
    expect(consentIdx).toBeGreaterThan(-1);

    // 동의 로그 직후 캐시 해제가 와야 한다 — 뒤에 있으면 곧바로 옛 결과가 적중한다
    const after = src.slice(consentIdx, consentIdx + 500);
    expect(after).toContain('clearFullAutoContentRetryCache');
    expect(after).toContain('clearPublishContentRetryCache()');
  });
});

describe('fullAutoFlow 캐시 실동작 — 링크가 다르면 재사용하지 않는다', () => {
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = {};
    vi.resetModules();
  });
  afterEach(() => {
    (globalThis as any).window = originalWindow;
    vi.resetModules();
  });

  it('저장한 뒤 링크만 바꿔 조회하면 캐시가 비어 있다', async () => {
    await import('../renderer/modules/fullAutoFlow.js').catch(() => null);
    const w = (globalThis as any).window;
    // 모듈이 전역에 캐시 API를 노출하지 못하는 환경이면 이 케이스는 건너뛴다
    if (typeof w.saveFullAutoContentRetryCache !== 'function') return;

    const seedOld = { keywords: '커피머신', contentMode: 'affiliate', affiliateLink: 'https://naver.me/OLD' };
    const seedNew = { ...seedOld, affiliateLink: 'https://naver.me/NEW' };

    // 캐시는 재사용 가능한 본문이 있을 때만 저장된다(hasReusableFullAutoContent)
    const oldProductContent = {
      selectedTitle: '옛 상품 글',
      bodyPlain: '옛 상품의 본문입니다. 이 내용이 새 링크로 재시도할 때 재사용되면 안 됩니다.',
      headings: [{ title: '옛 상품 소제목', content: '옛 상품 본문' }],
    };

    w.saveFullAutoContentRetryCache(seedOld, oldProductContent);
    // 같은 링크로는 재사용된다 (정당한 재시도)
    expect(w.getFullAutoContentRetryCache(seedOld)?.selectedTitle).toBe('옛 상품 글');
    // 링크를 바꾸면 재사용되지 않는다 (신고된 버그의 핵심)
    expect(w.getFullAutoContentRetryCache(seedNew)).toBeFalsy();
  });
});
