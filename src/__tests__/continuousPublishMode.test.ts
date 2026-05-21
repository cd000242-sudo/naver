import { describe, it, expect } from 'vitest';
import { resolvePublishModeAfterScheduleRemoved } from '../renderer/modules/continuousPublishModeHelpers';

// Bug: continuous publishing ignored draft mode. The schedule-clear button and
// the individual schedule modal's uncheck branch unconditionally set
// publishMode='publish', overwriting a user-selected 'draft'. Removing a
// schedule must keep 'draft' intact.

describe('resolvePublishModeAfterScheduleRemoved', () => {
  it('preserves draft mode when a schedule is removed', () => {
    expect(resolvePublishModeAfterScheduleRemoved('draft')).toBe('draft');
  });

  it('demotes schedule to immediate publish', () => {
    expect(resolvePublishModeAfterScheduleRemoved('schedule')).toBe('publish');
  });

  it('keeps publish as publish', () => {
    expect(resolvePublishModeAfterScheduleRemoved('publish')).toBe('publish');
  });

  it('falls back to publish when the mode is undefined', () => {
    expect(resolvePublishModeAfterScheduleRemoved(undefined)).toBe('publish');
  });
});
