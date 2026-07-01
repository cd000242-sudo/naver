import { describe, expect, it } from 'vitest';
import {
  getConfirmPublishSelectors,
  getImmediatePublishOptionSelectors,
  getPublishButtonSelectors,
  getPublishModalIndicatorSelectors,
} from '../automation/publishModalSelectorPolicy';

describe('publishModalSelectorPolicy', () => {
  it('keeps stable toolbar publish selectors first', () => {
    const selectors = getPublishButtonSelectors(['custom-publish']);

    expect(selectors[0]).toBe('button[data-click-area="tpb.publish"]');
    expect(selectors).toContain('[data-click-area="tpb.publish"]');
    expect(selectors).toContain('custom-publish');
    expect(selectors).toContain('[data-testid="publish-button"]');
  });

  it('keeps modal readiness selectors for confirm, category, and immediate publish controls', () => {
    const selectors = getPublishModalIndicatorSelectors();

    expect(selectors).toContain('[data-testid="seOnePublishBtn"]');
    expect(selectors).toContain('button[data-click-area="tpb*i.publish"]');
    expect(selectors).toContain('[data-click-area="tpb*i.category"]');
    expect(selectors).toContain('input#radio_time1');
  });

  it('keeps confirm publish selectors without duplicates', () => {
    const selectors = getConfirmPublishSelectors(['button.confirm_btn__WEaBq']);

    expect(selectors).toContain('button[data-testid="seOnePublishBtn"]');
    expect(selectors).toContain('button[data-click-area="tpb*i.publish"]');
    expect(selectors).toContain('button[class*="confirm_btn"]');
    expect(selectors.length).toBe(new Set(selectors).size);
  });

  it('keeps immediate publish option selectors separate from the final confirm button', () => {
    const selectors = getImmediatePublishOptionSelectors();
    const joined = selectors.join('\n');

    expect(selectors).toContain('input#radio_time1');
    expect(selectors).toContain('label[for="radio_time1"]');
    expect(selectors).toContain('[data-value="publish"]:not(button)');
    expect(joined).not.toContain('seOnePublishBtn');
    expect(joined).not.toContain('confirm_btn');
    expect(joined).not.toContain('tpb*i.publish');
    expect(selectors.length).toBe(new Set(selectors).size);
  });
});
