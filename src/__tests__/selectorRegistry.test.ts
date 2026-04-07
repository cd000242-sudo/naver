import { describe, it, expect } from 'vitest';
import {
  SELECTORS,
  LOGIN_SELECTORS,
  EDITOR_SELECTORS,
  PUBLISH_SELECTORS,
  IMAGE_SELECTORS,
  CTA_SELECTORS,
  getAllSelectors,
  getSelectorStrings,
} from '../automation/selectors';
import type { SelectorEntry } from '../automation/selectors';

describe('셀렉터 레지스트리 구조', () => {
  it('SELECTORS 통합 객체가 5개 카테고리를 포함한다', () => {
    expect(SELECTORS.login).toBeDefined();
    expect(SELECTORS.editor).toBeDefined();
    expect(SELECTORS.publish).toBeDefined();
    expect(SELECTORS.image).toBeDefined();
    expect(SELECTORS.cta).toBeDefined();
  });

  it('각 카테고리에 최소 1개 이상의 셀렉터가 있다', () => {
    expect(Object.keys(LOGIN_SELECTORS).length).toBeGreaterThan(0);
    expect(Object.keys(EDITOR_SELECTORS).length).toBeGreaterThan(0);
    expect(Object.keys(PUBLISH_SELECTORS).length).toBeGreaterThan(0);
    expect(Object.keys(IMAGE_SELECTORS).length).toBeGreaterThan(0);
    expect(Object.keys(CTA_SELECTORS).length).toBeGreaterThan(0);
  });
});

describe('SelectorEntry 구조 검증', () => {
  function validateEntry(entry: SelectorEntry, key: string) {
    expect(typeof entry.primary).toBe('string');
    expect(entry.primary.length).toBeGreaterThan(0);
    expect(Array.isArray(entry.fallbacks)).toBe(true);
    expect(entry.fallbacks.length).toBeGreaterThan(0);
    expect(typeof entry.description).toBe('string');

    // primary가 fallbacks에 포함되지 않아야 함
    expect(entry.fallbacks).not.toContain(entry.primary);
  }

  it('로그인 셀렉터가 유효하다', () => {
    for (const [key, entry] of Object.entries(LOGIN_SELECTORS)) {
      validateEntry(entry, key);
    }
  });

  it('에디터 셀렉터가 유효하다', () => {
    for (const [key, entry] of Object.entries(EDITOR_SELECTORS)) {
      validateEntry(entry, key);
    }
  });

  it('발행 셀렉터가 유효하다', () => {
    for (const [key, entry] of Object.entries(PUBLISH_SELECTORS)) {
      validateEntry(entry, key);
    }
  });

  it('이미지 셀렉터가 유효하다', () => {
    for (const [key, entry] of Object.entries(IMAGE_SELECTORS)) {
      validateEntry(entry, key);
    }
  });

  it('CTA 셀렉터가 유효하다', () => {
    for (const [key, entry] of Object.entries(CTA_SELECTORS)) {
      validateEntry(entry, key);
    }
  });
});

describe('getAllSelectors', () => {
  it('primary + fallbacks를 순서대로 반환한다', () => {
    const entry = LOGIN_SELECTORS.idInput;
    const all = getAllSelectors(entry);

    expect(all[0]).toBe(entry.primary);
    expect(all.length).toBe(1 + entry.fallbacks.length);
  });

  it('모든 요소가 문자열이다', () => {
    const all = getAllSelectors(EDITOR_SELECTORS.bodyText);
    for (const sel of all) {
      expect(typeof sel).toBe('string');
      expect(sel.length).toBeGreaterThan(0);
    }
  });
});

describe('getSelectorStrings', () => {
  it('getAllSelectors와 동일한 결과를 반환한다', () => {
    const entry = PUBLISH_SELECTORS.confirmPublishButton;
    const strings = getSelectorStrings(entry);
    const all = getAllSelectors(entry);

    expect(strings).toEqual([...all]);
  });
});

describe('핵심 셀렉터 존재 확인', () => {
  it('로그인에 필요한 셀렉터가 존재한다', () => {
    expect(LOGIN_SELECTORS.idInput).toBeDefined();
    expect(LOGIN_SELECTORS.pwInput).toBeDefined();
    expect(LOGIN_SELECTORS.loginButton).toBeDefined();
  });

  it('발행에 필요한 셀렉터가 존재한다', () => {
    expect(PUBLISH_SELECTORS.publishButton).toBeDefined();
    expect(PUBLISH_SELECTORS.confirmPublishButton).toBeDefined();
    expect(PUBLISH_SELECTORS.categoryButton).toBeDefined();
  });

  it('에디터에 필요한 셀렉터가 존재한다', () => {
    expect(EDITOR_SELECTORS.documentTitle).toBeDefined();
    expect(EDITOR_SELECTORS.bodyText).toBeDefined();
    expect(EDITOR_SELECTORS.mainFrame).toBeDefined();
    expect(EDITOR_SELECTORS.boldButton).toBeDefined();
  });

  it('이미지 관련 셀렉터가 존재한다', () => {
    expect(IMAGE_SELECTORS.imageResource).toBeDefined();
    expect(IMAGE_SELECTORS.uploadedImageConfirm).toBeDefined();
  });
});

describe('셀렉터 중복 검사', () => {
  it('로그인/발행/CTA 카테고리에서 primary 셀렉터가 중복되지 않는다', () => {
    // 에디터/이미지는 같은 요소를 다른 용도로 참조할 수 있어 의도된 중복 허용
    const strictMaps = [LOGIN_SELECTORS, PUBLISH_SELECTORS, CTA_SELECTORS];

    for (const map of strictMaps) {
      const primaries = Object.values(map).map(e => e.primary);
      const unique = new Set(primaries);
      expect(unique.size).toBe(primaries.length);
    }
  });
});

describe('셀렉터 총 개수', () => {
  it('총 76개 이상의 셀렉터 엔트리가 있다', () => {
    const total =
      Object.keys(LOGIN_SELECTORS).length +
      Object.keys(EDITOR_SELECTORS).length +
      Object.keys(PUBLISH_SELECTORS).length +
      Object.keys(IMAGE_SELECTORS).length +
      Object.keys(CTA_SELECTORS).length;

    expect(total).toBeGreaterThanOrEqual(76);
  });
});
