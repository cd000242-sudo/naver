import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('publish category separation', () => {
  it('does not fall back from real blog categoryName to content category', () => {
    const fullAutoFlow = read('renderer/modules/fullAutoFlow.ts');
    const publishFn = fullAutoFlow.slice(fullAutoFlow.indexOf('async function executeBlogPublishing'));
    const resolvedNameIndex = publishFn.indexOf('const resolvedBlogCategoryName');
    const payloadNameIndex = publishFn.indexOf('categoryName: resolvedBlogCategoryName');

    expect(fullAutoFlow).not.toContain('categoryName: formData.categoryName || formData.category');
    expect(fullAutoFlow).not.toContain('formData.categoryName || formData.category ||');
    expect(resolvedNameIndex).toBeGreaterThanOrEqual(0);
    expect(payloadNameIndex).toBeGreaterThan(resolvedNameIndex);
  });
});
