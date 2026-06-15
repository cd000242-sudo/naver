import { describe, expect, it } from 'vitest';
import {
  EDITOR_TITLE_DIAGNOSTIC_SELECTORS,
  formatEditorReadinessDiagnostics,
  shouldRetryEditorReadiness,
  summarizeEditorReadiness,
} from '../automation/editorReadinessDiagnostics';

describe('editorReadinessDiagnostics', () => {
  it('keeps the selector list focused on title and main editor readiness', () => {
    expect(EDITOR_TITLE_DIAGNOSTIC_SELECTORS).toContain('.se-section-documentTitle');
    expect(EDITOR_TITLE_DIAGNOSTIC_SELECTORS).toContain('[data-name="documentTitle"]');
    expect(EDITOR_TITLE_DIAGNOSTIC_SELECTORS).toContain('[contenteditable="true"]');
    expect(EDITOR_TITLE_DIAGNOSTIC_SELECTORS).toContain('.se-main-container');
  });

  it('summarizes a ready editor when title selectors are present', () => {
    expect(summarizeEditorReadiness({
      pageUrl: 'https://blog.naver.com/GoBlogWrite.naver',
      frameUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      selectorCounts: {
        '.se-section-documentTitle': 1,
        '[contenteditable="true"]': 3,
      },
    })).toEqual({
      urlState: 'writer',
      titleReady: true,
      bodyReady: false,
    });
  });

  it('distinguishes blog-home, login, and browser-error states for user-actionable errors', () => {
    expect(summarizeEditorReadiness({
      pageUrl: 'https://blog.naver.com/test',
      frameUrl: 'https://blog.naver.com/test',
      selectorCounts: {},
    }).urlState).toBe('blog-home');

    expect(summarizeEditorReadiness({
      pageUrl: 'https://nid.naver.com/nidlogin.login',
      frameUrl: 'https://nid.naver.com/nidlogin.login',
      selectorCounts: {},
    }).urlState).toBe('login');

    expect(summarizeEditorReadiness({
      pageUrl: 'chrome-error://chromewebdata/',
      frameUrl: 'chrome-error://chromewebdata/',
      selectorCounts: {},
    }).urlState).toBe('browser-error');
  });

  it('formats compact diagnostics with URL state and selector counts', () => {
    const formatted = formatEditorReadinessDiagnostics({
      pageUrl: 'https://blog.naver.com/test',
      pageTitle: 'Test Blog',
      frameUrl: 'https://blog.naver.com/test',
      selectorCounts: {
        '.se-section-documentTitle': 0,
        '[data-name="documentTitle"]': 0,
        '.se-main-container': 1,
      },
    });

    expect(formatted).toContain('pageUrl=https://blog.naver.com/test');
    expect(formatted).toContain('pageTitle=Test Blog');
    expect(formatted).toContain('urlState=blog-home');
    expect(formatted).toContain('titleReady=false');
    expect(formatted).toContain('bodyReady=true');
    expect(formatted).toContain('.se-section-documentTitle=0');
  });

  it('retries writer shells when neither title nor body editor selectors are ready', () => {
    expect(shouldRetryEditorReadiness({
      pageUrl: 'https://blog.naver.com/someone?Redirect=Write',
      frameUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=someone',
      selectorCounts: {
        '.se-section-documentTitle': 0,
        '.se-section-text': 0,
        '.se-main-container': 0,
      },
    })).toBe(true);

    expect(shouldRetryEditorReadiness({
      pageUrl: 'https://blog.naver.com/GoBlogWrite.naver',
      frameUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=someone',
      selectorCounts: {
        '.se-section-documentTitle': 1,
        '.se-section-text': 0,
      },
    })).toBe(false);
  });
});
