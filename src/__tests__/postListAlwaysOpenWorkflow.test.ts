// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  chunkGeneratedPostItems,
  escapeGeneratedPostAttribute,
  focusLoadedPostEditor,
  GENERATED_POST_RENDER_CHUNK_SIZE,
  makeLoadedPostEditorVisible,
  sanitizeGeneratedPostExternalUrl,
} from '../renderer/modules/postListUI';

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('generated post library workflow', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <button type="button" data-tab="unified">글 발행하기</button>
      <select id="publish-mode-top-select"><option value="full-auto">완전자동</option><option value="semi-auto">반자동</option></select>
      <select id="publish-mode-select"><option value="full-auto">완전자동</option><option value="semi-auto">반자동</option></select>
      <section id="unified-semi-auto-section" style="display:none"></section>
    `;
  });

  it('moves a loaded post to the publishing tab and activates semi-auto editing', async () => {
    const tab = document.querySelector<HTMLButtonElement>('[data-tab="unified"]')!;
    const clickSpy = vi.spyOn(tab, 'click');
    const syncPublishMode = vi.fn();
    (window as any).syncPublishMode = syncPublishMode;
    const module = await import('../renderer/modules/postListUI');

    module.activateSemiAutoPublishEditor();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((document.getElementById('publish-mode-top-select') as HTMLSelectElement).value).toBe('semi-auto');
    expect((document.getElementById('publish-mode-select') as HTMLSelectElement).value).toBe('semi-auto');
    expect(syncPublishMode).toHaveBeenCalledWith('semi-auto');
    expect(document.getElementById('unified-semi-auto-section')?.style.display).toBe('block');
  });

  it('keeps the loaded editor visible and settles scroll/focus without an opacity flash', () => {
    const editor = document.getElementById('unified-semi-auto-section') as HTMLElement;
    const titleInput = document.createElement('input');
    titleInput.id = 'unified-generated-title';
    document.body.appendChild(titleInput);
    editor.style.opacity = '0';
    editor.style.transition = 'opacity 0.5s ease';

    const scrollIntoView = vi.fn();
    Object.defineProperty(editor, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const focus = vi.spyOn(titleInput, 'focus');
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);

    try {
      makeLoadedPostEditorVisible();
      focusLoadedPostEditor();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(editor.style.display).toBe('block');
    expect(editor.style.opacity).toBe('');
    expect(editor.style.transition).toBe('');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('preserves a semi-auto transition requested before smart-publish initialization', async () => {
    delete (window as any).syncPublishMode;
    const module = await import('../renderer/modules/postListUI');

    module.activateSemiAutoPublishEditor();

    expect((window as any).__pendingPublishMode).toBe('semi-auto');
    expect(read('renderer/modules/tailUIUtils.ts')).toContain("pendingMode === 'semi-auto'");
  });

  it('keeps the whole library, account groups, and category groups permanently expanded', () => {
    const html = read('../public/index.html');
    const tailUi = read('renderer/modules/tailUIUtils.ts');
    const postList = read('renderer/modules/postListUI.ts');

    expect(html).not.toContain('onclick="togglePostsListSection()"');
    expect(html).not.toContain('id="posts-list-toggle-hint"');
    expect(html).not.toMatch(/id="generated-posts-list"[\s\S]{0,220}max-height:\s*500px/);
    expect(tailUi).toContain("postsListContent.style.display = 'block'");
    expect(tailUi).not.toContain("postsListContent.style.display = 'none'");
    expect(postList).not.toContain('isAccountCollapsed');
    expect(postList).not.toContain('isGeneratedPostCategoryCollapsed');
    expect(postList).not.toContain("body.style.display = 'none'");
    expect(postList).toContain('loading="lazy" decoding="async"');
    expect(postList).toContain('generatedPostLoadInFlight');
    expect(postList).toContain("target.closest<HTMLElement>('button[data-post-id], button[data-url]')");
    expect(postList).toContain("titleInput?.focus({ preventScroll: true })");
    expect(read('../public/styles.css')).toContain('content-visibility: auto');
  });

  it('progressively renders large expanded groups in bounded chunks', () => {
    const items = Array.from({ length: 1000 }, (_, index) => index);
    const chunks = chunkGeneratedPostItems(items);

    expect(GENERATED_POST_RENDER_CHUNK_SIZE).toBe(24);
    expect(chunks.flat()).toEqual(items);
    expect(Math.max(...chunks.map(chunk => chunk.length))).toBeLessThanOrEqual(24);
    const source = read('renderer/modules/postListUI.ts');
    expect(source).toContain("status.insertAdjacentHTML('beforebegin', html)");
    expect(source).toContain('delegatedPostListContainers');
  });

  it('escapes untrusted list attributes and rejects executable external URLs', () => {
    expect(escapeGeneratedPostAttribute(`post\"'><img src=x onerror=alert(1)>`))
      .toBe('post&quot;&#039;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(sanitizeGeneratedPostExternalUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeGeneratedPostExternalUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeGeneratedPostExternalUrl('https://blog.naver.com/test/123')).toBe('https://blog.naver.com/test/123');

    const source = read('renderer/modules/postListUI.ts');
    expect(source).not.toContain("window.open('${post.publishedUrl}'");
    expect(source).not.toContain("showImageModal('${thumbnailImage}'");

    const continuous = read('renderer/modules/continuousPublishing.ts');
    expect(continuous).toContain('sanitizeContinuousPostExternalUrl');
    expect(continuous).not.toContain('data-url="${post.publishedUrl}"');
    expect(continuous).not.toContain('data-url="${p.publishedUrl || \'\'}"');
  });
});
