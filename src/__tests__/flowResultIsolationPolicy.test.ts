import { describe, expect, it } from 'vitest';
import {
  FLOW_RESULT_WAIT_TIMEOUT_MS,
  extractCorrelatedFlowImageId,
  isFlowStaticUiAssetUrl,
  shouldQuarantineFlowContext,
} from '../image/flowResultIsolationPolicy';

describe('Flow result isolation policy', () => {
  it('allows slow Flow responses without an unsafe late-result grace race', () => {
    expect(FLOW_RESULT_WAIT_TIMEOUT_MS).toBe(240_000);
  });

  it.each([
    'FLOW_IMAGE_TIMEOUT: timed out',
    'FLOW_PROMPT_INPUT_NOT_FOUND',
    'FLOW_SUBMIT_BUTTON_NOT_FOUND',
    'locator.click: Timeout 30000ms exceeded',
    'iframe intercepts pointer events',
  ])('quarantines the browser context after unresolved work: %s', (message) => {
    expect(shouldQuarantineFlowContext(message)).toBe(true);
  });

  it('does not quarantine explicit quota failures', () => {
    expect(shouldQuarantineFlowContext('FLOW_QUOTA_EXCEEDED')).toBe(false);
  });

  it('accepts only generated Flow media UUIDs as network results', () => {
    expect(extractCorrelatedFlowImageId('https://flow-content.google/image/73c8158c-def2-4f5e-8271-7d720d0c22c5?Expires=1'))
      .toBe('73c8158c-def2-4f5e-8271-7d720d0c22c5');
    expect(extractCorrelatedFlowImageId('https://example.test/getMediaUrlRedirect?name=f793da93-d74b-43ad-9a84-3584d857cfd0'))
      .toBe('f793da93-d74b-43ad-9a84-3584d857cfd0');
    expect(extractCorrelatedFlowImageId('https://www.gstatic.com/aitestkitchen/website/flow/landing_page/landing_video__poster-desktop.png'))
      .toBeNull();
    expect(extractCorrelatedFlowImageId('https://lh3.googleusercontent.com/avatar=s96-c'))
      .toBeNull();
  });

  it.each([
    'https://www.gstatic.com/aitestkitchen/website/flow/zero_states/brainstorm_with_me.jpeg',
    'https://www.gstatic.com/aitestkitchen/website/flow/landing_page/landing_video__poster-desktop.png',
    'https://www.gstatic.com/aitestkitchen/website/flow/banners/io2026-banner.png',
    'https://www.gstatic.com/aitestkitchen/website/flow/changelogs/update.webp',
    'https://labs.google/fx/pinhole/flower-placeholder.svg',
  ])('classifies Flow UI artwork separately from generated results: %s', (url) => {
    expect(isFlowStaticUiAssetUrl(url)).toBe(true);
  });
});
