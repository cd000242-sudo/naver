import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  getSaveButtonSelectors,
  isSaveButtonTextCandidate,
} from '../automation/publishSaveButtonPolicy';
import {
  getPublishModalIndicatorSelectors,
  getSchedulePublishOptionSelectors,
} from '../automation/publishModalSelectorPolicy';
import { getAllSelectors, PUBLISH_SELECTORS } from '../automation/selectors';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

describe('semi-auto draft publish wiring', () => {
  it('keeps the selected draft mode from renderer to main automation', () => {
    const publishingHandlers = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const fullAutoFlow = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const blogExecutor = read('src', 'main', 'services', 'BlogExecutor.ts');

    expect(publishingHandlers).toMatch(/getElementById\('unified-publish-mode'\)[\s\S]{0,120}\?\.value \|\| 'publish'/);
    expect(publishingHandlers).toMatch(/const formData: any = \{[\s\S]*publishMode,/);
    expect(fullAutoFlow).toMatch(/publishMode: formData\.publishMode/);
    expect(blogExecutor).toMatch(/publishMode: payload\.publishMode/);
  });

  it('uses resilient save-button selectors for draft mode', () => {
    const automation = read('src', 'naverBlogAutomation.ts');

    expect(automation).toContain('private readonly SAVE_BUTTON_SELECTORS');
    expect(automation).toContain('const saveButtonSelectors = this.SAVE_BUTTON_SELECTORS');
    expect(automation).toContain('findVisibleSaveButtonFallback(frame)');
  });
});

describe('immediate publish pre-publish guard', () => {
  it('does not exit publishBlogPost when body-read verification falls back open', () => {
    const automation = read('src', 'naverBlogAutomation.ts');
    const failOpenIndex = automation.indexOf('pre-publish-body-unreadable-fail-open');
    const publishStepIndex = automation.indexOf(
      'await imageHelpers.applyDocumentWidthToAllImagesBeforePublish(this, frame)',
      failOpenIndex,
    );

    expect(failOpenIndex).toBeGreaterThan(-1);
    expect(publishStepIndex).toBeGreaterThan(failOpenIndex);
    expect(automation.slice(failOpenIndex, publishStepIndex)).not.toMatch(/\breturn\s*;/);
    expect(automation.slice(failOpenIndex, publishStepIndex)).toContain('if (!skipPrePublishReport)');
  });
});

describe('publish save button policy', () => {
  it('extends the selector registry with modern fallback selectors', () => {
    const selectors = getSaveButtonSelectors(getAllSelectors(PUBLISH_SELECTORS.saveButton));

    expect(selectors[0]).toBe('button.save_btn__bzc5B[data-click-area="tpb.save"]');
    expect(selectors).toContain('button[class*="save_btn"]');
    expect(selectors).toContain('button[aria-label*="저장"]');
    expect(selectors).toContain('button[data-testid*="save" i]');
  });

  it('recognizes visible Korean save-button text variants', () => {
    expect(isSaveButtonTextCandidate('저장')).toBe(true);
    expect(isSaveButtonTextCandidate(' 임시 저장 ')).toBe(true);
    expect(isSaveButtonTextCandidate('발행')).toBe(false);
  });
});

describe('semi-auto schedule publish wiring', () => {
  it('keeps schedule mode and schedule date through the renderer payload', () => {
    const publishingHandlers = read('src', 'renderer', 'modules', 'publishingHandlers.ts');
    const fullAutoFlow = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const blogExecutor = read('src', 'main', 'services', 'BlogExecutor.ts');

    expect(publishingHandlers).toMatch(/const scheduleDate = publishMode === 'schedule' \? getScheduleDateFromInput\('unified-schedule-date'\) : undefined/);
    expect(publishingHandlers).toMatch(/scheduleTime,/);
    expect(fullAutoFlow).toMatch(/scheduleDate: formData\.publishMode === 'schedule' \? formData\.scheduleDate : undefined/);
    expect(blogExecutor).toMatch(/scheduleDate: \(\(\) => \{[\s\S]*payload\.publishMode === 'schedule'/);
  });

  it('routes scheduled publish modal selectors through the shared policy', () => {
    const publishHelpers = read('src', 'automation', 'publishHelpers.ts');

    expect(publishHelpers).toContain('getPublishButtonSelectors');
    expect(publishHelpers).toContain('getPublishModalIndicatorSelectors');
    expect(publishHelpers).toContain('getSchedulePublishOptionSelectors');
    expect(publishHelpers).toContain('getConfirmPublishSelectors');
    expect(publishHelpers).toContain('const scheduleRadioSelectors = getSchedulePublishOptionSelectors(legacyScheduleRadioSelectors)');
  });
});

describe('schedule publish selector policy', () => {
  it('covers current and likely Naver schedule radio variants', () => {
    const selectors = getSchedulePublishOptionSelectors();

    expect(selectors).toContain('input#radio_time2');
    expect(selectors).toContain('input[name="radio_time"][value="pre"]');
    expect(selectors).toContain('input[type="radio"][value="schedule"]');
    expect(selectors).toContain('input[type="radio"][value="pre"]');
    expect(selectors).toContain('label[for="radio_time2"]');
  });

  it('uses schedule controls as modal-open indicators too', () => {
    const selectors = getPublishModalIndicatorSelectors();

    expect(selectors).toContain('input#radio_time2');
    expect(selectors).toContain('input[name="radio_time"]');
  });
});
