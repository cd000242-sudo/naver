// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  getVerifiedRealBlogCategoryName,
  getVerifiedRealBlogCategoryValue,
  isContentCategoryCandidate,
  markRealBlogCategoryOption,
} from '../renderer/utils/realBlogCategoryPolicy';

function selectWithOption(value: string, text: string, markAsReal = false): HTMLSelectElement {
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  if (markAsReal) {
    markRealBlogCategoryOption(option, value);
  }
  select.appendChild(option);
  select.selectedIndex = 0;
  return select;
}

describe('real blog category policy', () => {
  it('treats built-in content categories as unsafe publish categories when unverified', () => {
    expect(isContentCategoryCandidate('society_politics', '사회·정치')).toBe(true);

    const select = selectWithOption('society_politics', '사회·정치');

    expect(getVerifiedRealBlogCategoryName(select)).toBeUndefined();
    expect(getVerifiedRealBlogCategoryValue(select)).toBeUndefined();
  });

  it('allows real blog categories loaded from the blog category analyzer', () => {
    const select = selectWithOption('11', '사회·정치', true);

    expect(getVerifiedRealBlogCategoryName(select)).toBe('사회·정치');
    expect(getVerifiedRealBlogCategoryValue(select)).toBe('11');
  });

  it('allows plain existing blog folder names that are not app content categories', () => {
    const select = selectWithOption('게시판', '게시판');

    expect(getVerifiedRealBlogCategoryName(select)).toBe('게시판');
    expect(getVerifiedRealBlogCategoryValue(select)).toBe('게시판');
  });

  it('ignores placeholder options', () => {
    const select = selectWithOption('', '분석된 카테고리를 선택하세요');

    expect(getVerifiedRealBlogCategoryName(select)).toBeUndefined();
    expect(getVerifiedRealBlogCategoryValue(select)).toBeUndefined();
  });
});
