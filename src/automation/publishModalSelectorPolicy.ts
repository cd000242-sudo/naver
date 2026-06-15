import { getAllSelectors, PUBLISH_SELECTORS } from './selectors/index.js';

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function getPublishButtonSelectors(extraSelectors: readonly string[] = []): string[] {
  return unique([
    'button[data-click-area="tpb.publish"]',
    '[data-click-area="tpb.publish"]',
    'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
    ...extraSelectors,
    ...getAllSelectors(PUBLISH_SELECTORS.publishButton),
    'button.publish_btn__m9KHH',
    '.publish_btn__bzc5B',
    '[data-testid="publish-button"]',
  ]);
}

export function getPublishModalIndicatorSelectors(): string[] {
  return unique([
    '[data-testid="seOnePublishBtn"]',
    'button[data-click-area="tpb*i.publish"]',
    'button.confirm_btn__WEaBq',
    PUBLISH_SELECTORS.categoryButton.primary,
    PUBLISH_SELECTORS.immediateRadio.primary,
  ]);
}

export function getConfirmPublishSelectors(extraSelectors: readonly string[] = []): string[] {
  return unique([
    'button[data-testid="seOnePublishBtn"]',
    'button[data-click-area="tpb*i.publish"]',
    '[data-testid="seOnePublishBtn"]',
    ...extraSelectors,
    ...getAllSelectors(PUBLISH_SELECTORS.confirmPublishButton),
    'button.confirm_btn__WEaBq[data-click-area="tpb*i.publish"]',
    'button[class*="confirm_btn"][data-click-area="tpb*i.publish"]',
  ]);
}
