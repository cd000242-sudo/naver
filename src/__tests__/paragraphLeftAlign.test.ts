import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EDITOR_SELECTORS } from '../automation/selectors/editorSelectors';

/**
 * [2026-09-02 사장님] "문단정리 중앙정렬 말고 좌측정렬로." 5/27 의 가운데 정렬 요청을 되돌린다.
 * 에디터 진입 직후 정렬 단계가 왼쪽을 누른다. 화면 모드 단계와 이미지 가운데 정렬은 손대지 않는다.
 */
const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('에디터 진입 정렬은 왼쪽이다', () => {
  it('레지스트리에 왼쪽 정렬 옵션이 있다', () => {
    expect(EDITOR_SELECTORS.alignLeftButton.primary).toContain('align-left');
    expect(EDITOR_SELECTORS.alignLeftButton.fallbacks.some((s) => s.includes('data-value="left"'))).toBe(true);
  });

  it('정렬 단계가 왼쪽 버튼을 누르고, 가운데 버튼은 더 이상 누르지 않는다', () => {
    const src = read('automation/editorHelpers.ts');
    const fn = src.slice(src.indexOf('export async function setupMobileViewAndCenterAlign'), src.indexOf('// ── extractBodyForHeading ──'));
    expect(fn).toMatch(/SELECTORS\.editor\.alignLeftButton/u);
    expect(fn).not.toMatch(/SELECTORS\.editor\.alignCenterButton/u);
    expect(fn).toContain('왼쪽 정렬 활성화');
  });
});
