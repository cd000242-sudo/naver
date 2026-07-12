// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { shouldShowHeadingImageButtonForTab } from '../renderer/components/HeadingImageSettings';

describe('heading image floating button visibility', () => {
  it('shows only on publishing and image workspaces', () => {
    expect(shouldShowHeadingImageButtonForTab('unified')).toBe(true);
    expect(shouldShowHeadingImageButtonForTab('images')).toBe(true);
    expect(shouldShowHeadingImageButtonForTab('image-tools')).toBe(true);
    expect(shouldShowHeadingImageButtonForTab('analytics')).toBe(false);
    expect(shouldShowHeadingImageButtonForTab('main')).toBe(false);
    expect(shouldShowHeadingImageButtonForTab(null)).toBe(false);
  });
});
