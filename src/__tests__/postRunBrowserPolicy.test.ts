import { describe, expect, it } from 'vitest';
import { resolvePostRunBrowserPolicy } from '../automation/postRunBrowserPolicy.js';

describe('resolvePostRunBrowserPolicy', () => {
  it('defaults to keeping the browser session open after publishing', () => {
    const policy = resolvePostRunBrowserPolicy({
      keepBrowserOpen: undefined,
      hasBrowser: true,
      hasPage: true,
      hasPublishedUrl: true,
    });

    expect(policy).toEqual({
      keepOpen: true,
      shouldCloseBrowser: false,
      shouldLogKeepOpen: true,
      shouldReviewPublishedPost: true,
      shouldMinimizeBrowser: true,
      shouldCheckPageHealth: true,
      shouldCleanupStalePages: true,
    });
  });

  it('closes the browser only when keepBrowserOpen is false and a browser exists', () => {
    expect(resolvePostRunBrowserPolicy({
      keepBrowserOpen: false,
      hasBrowser: true,
      hasPage: true,
      hasPublishedUrl: true,
    })).toMatchObject({
      keepOpen: false,
      shouldCloseBrowser: true,
      shouldReviewPublishedPost: false,
      shouldMinimizeBrowser: false,
      shouldCheckPageHealth: false,
      shouldCleanupStalePages: false,
    });

    expect(resolvePostRunBrowserPolicy({
      keepBrowserOpen: false,
      hasBrowser: false,
      hasPage: true,
      hasPublishedUrl: true,
    })).toMatchObject({
      keepOpen: false,
      shouldCloseBrowser: false,
    });
  });

  it('keeps review and health work tied to the resources that actually exist', () => {
    expect(resolvePostRunBrowserPolicy({
      keepBrowserOpen: true,
      hasBrowser: true,
      hasPage: false,
      hasPublishedUrl: true,
    })).toMatchObject({
      shouldReviewPublishedPost: false,
      shouldCheckPageHealth: false,
      shouldCleanupStalePages: true,
    });

    expect(resolvePostRunBrowserPolicy({
      keepBrowserOpen: true,
      hasBrowser: false,
      hasPage: true,
      hasPublishedUrl: false,
    })).toMatchObject({
      shouldReviewPublishedPost: false,
      shouldCheckPageHealth: true,
      shouldCleanupStalePages: false,
    });
  });
});
