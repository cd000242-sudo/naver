/**
 * @vitest-environment happy-dom
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _invalidatePostsCache,
  loadGeneratedPosts,
  saveGeneratedPost,
  saveGeneratedPostFromData,
} from '../renderer/modules/postManager';
import {
  populateGeneratedPostFields,
  reconstructGeneratedPostStructuredContent,
} from '../renderer/modules/postListUI';
import { normalizeHashtags } from '../renderer/utils/hashtagUtils';
import { GENERATED_POSTS_KEY } from '../renderer/utils/postStorageUtils';
import {
  ContentQualityV3PublishHandoffStore,
  enforceContentQualityV3PublishPayload,
} from '../contentQualityV3/publishHandoffStore';
import { ContentQualityV3DurableProvenanceRegistry } from '../contentQualityV3/durableProvenanceRegistry';

const GLOBAL_MIGRATION_DONE_KEY = 'naver_blog_posts_migration_global_done';

function readRendererSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', 'renderer', relativePath), 'utf8');
}

describe('renderer post data integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(GLOBAL_MIGRATION_DONE_KEY, 'true');
    document.body.innerHTML = '';
    Object.assign(globalThis, {
      currentPostId: null,
      generatedImages: [],
      ImageManager: { getAllImages: () => [] },
      UnifiedDOMCache: { getRealCategory: () => '' },
      appendLog: () => undefined,
      readUnifiedCtasFromUi: () => [],
    });
    _invalidatePostsCache();
  });

  it('normalizes legacy hashtag text and mixed arrays to a fresh string array', () => {
    expect(normalizeHashtags(' #one, two\n#three ')).toEqual(['one', 'two', 'three']);
    expect(normalizeHashtags([' #one ', '', '#two #three', null, 42])).toEqual([
      'one',
      'two',
      'three',
    ]);

    // [v2.11.140d] 정규형은 # 없는 태그 — UI가 표시 시에만 #을 붙인다(이중 접두 방지).
    const original = ['#one', '#two'];
    const normalized = normalizeHashtags(original);
    expect(normalized).toEqual(['one', 'two']);
    expect(normalized).not.toBe(original);
  });

  it('normalizes loaded hashtags and derives structured content identity from the post id', () => {
    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify([
      {
        id: 'post_canonical',
        title: 'Loaded title',
        content: 'Loaded body',
        hashtags: '#one, #two',
        headings: [],
        structuredContent: {
          selectedTitle: 'Loaded title',
          hashtags: '#one #two',
          _postId: 'post_stale',
        },
        createdAt: '2026-07-11T00:00:00.000Z',
      },
    ]));

    const [loaded] = loadGeneratedPosts();

    expect(loaded.hashtags).toEqual(['one', 'two']);
    expect(loaded.structuredContent?.hashtags).toEqual(['one', 'two']);
    expect(loaded.structuredContent?._postId).toBe('post_canonical');
  });

  it('stores normalized hashtags and the generated post id without mutating input content', () => {
    const structuredContent = {
      selectedTitle: 'Saved title',
      bodyPlain: 'Saved body',
      hashtags: '#one, #two',
      headings: [],
    };

    const postId = saveGeneratedPostFromData(structuredContent);
    const storedPosts = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');

    expect(postId).toMatch(/^post_/);
    expect(storedPosts[0].hashtags).toEqual(['one', 'two']);
    expect(storedPosts[0].structuredContent.hashtags).toEqual(['one', 'two']);
    expect(storedPosts[0].structuredContent._postId).toBe(postId);
    expect(structuredContent.hashtags).toBe('#one, #two');
    expect(structuredContent).not.toHaveProperty('_postId');
  });

  it('fails closed after a V3 saved post is reloaded in a fresh main process', async () => {
    const descriptor = {
      handle: `v3h_${'a'.repeat(43)}`,
      publicationIdentity: `v3p_${'b'.repeat(43)}`,
      originalContentSha256: 'c'.repeat(64),
    };
    const postId = saveGeneratedPostFromData({
      selectedTitle: 'Saved V3 title',
      bodyPlain: 'Saved V3 body',
      hashtags: [],
      headings: [],
      _contentQualityV3PostId: `v3d_${'p'.repeat(43)}`,
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: descriptor,
    });
    expect(postId).toMatch(/^post_/);

    const rawStorage = localStorage.getItem(GENERATED_POSTS_KEY) || '';
    expect(rawStorage).toContain('_contentQualityV3Required');
    expect(rawStorage).toContain('_contentQualityV3PostId');
    expect(rawStorage).toContain('_contentQualityV3PublishHandoff');
    expect(rawStorage).not.toContain('rawText');
    expect(rawStorage).not.toContain('factualEvidence');

    _invalidatePostsCache();
    const [reloaded] = loadGeneratedPosts();
    const reconstructed = reconstructGeneratedPostStructuredContent(reloaded);
    const mutatedBody = '외부 변조된 현재 가격은 USD 999입니다.';
    const freshMainStore = new ContentQualityV3PublishHandoffStore();

    await expect(enforceContentQualityV3PublishPayload(freshMainStore, {
      title: reconstructed.selectedTitle,
      content: mutatedBody,
      structuredContent: {
        ...reconstructed,
        bodyPlain: mutatedBody,
        content: mutatedBody,
      },
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: 'renderer:restart:process:2:frame:1',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] invalid_handoff_state');
  });

  it('keeps the V3 marker through the interactive save/update path and fails closed after restart', async () => {
    const descriptor = {
      handle: `v3h_${'d'.repeat(43)}`,
      publicationIdentity: `v3p_${'e'.repeat(43)}`,
      originalContentSha256: 'f'.repeat(64),
    };
    const postId = saveGeneratedPost({
      selectedTitle: 'Interactive V3 title',
      bodyPlain: 'Interactive V3 body',
      hashtags: [],
      headings: [],
      _contentQualityV3PostId: `v3d_${'q'.repeat(43)}`,
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: descriptor,
    }, false, { forceNew: true });
    expect(postId).toMatch(/^post_/);

    const updatedPostId = saveGeneratedPost({
      _postId: postId,
      selectedTitle: 'Interactive V3 title edited',
      bodyPlain: 'Renderer-edited body after save',
      hashtags: [],
      headings: [],
    }, true);
    expect(updatedPostId).toBe(postId);

    _invalidatePostsCache();
    const reloaded = loadGeneratedPosts().find(post => post.id === postId);
    expect(reloaded).toBeDefined();
    const reconstructed = reconstructGeneratedPostStructuredContent(reloaded);
    expect(reconstructed._contentQualityV3Required).toBe(true);
    expect(reconstructed._contentQualityV3PostId).toBe(`v3d_${'q'.repeat(43)}`);
    expect(reconstructed._contentQualityV3PublishHandoff).toEqual(descriptor);

    const freshMainStore = new ContentQualityV3PublishHandoffStore();
    await expect(enforceContentQualityV3PublishPayload(freshMainStore, {
      title: reconstructed.selectedTitle,
      content: reconstructed.bodyPlain,
      structuredContent: reconstructed,
      publishMode: 'publish',
      _contentQualityV3PublishOwnerKey: 'renderer:restart:process:3:frame:1',
    })).rejects.toThrow('[content-quality-v3-publish-handoff] invalid_handoff_state');
  });

  it('reproduces both localStorage key deletions while the main-issued postId still blocks downgrade', async () => {
    const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'v3-localstorage-strip-'));
    try {
      const registry = new ContentQualityV3DurableProvenanceRegistry({ userDataPath });
      const descriptor = {
        handle: `v3h_${'r'.repeat(43)}`,
        publicationIdentity: `v3p_${'s'.repeat(43)}`,
        originalContentSha256: 'a'.repeat(64),
      };
      const initial = { selectedTitle: 'Durable saved title', bodyPlain: 'Durable saved body' };
      const issued = await registry.registerIssued({ handoff: descriptor, content: initial });
      const localPostId = saveGeneratedPostFromData({
        ...initial,
        hashtags: [],
        headings: [],
        _contentQualityV3PostId: issued.postId,
        _contentQualityV3Required: true,
        _contentQualityV3PublishHandoff: descriptor,
      });
      expect(localPostId).toMatch(/^post_/);

      const storedPosts = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');
      delete storedPosts[0].structuredContent._contentQualityV3Required;
      delete storedPosts[0].structuredContent._contentQualityV3PublishHandoff;
      localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(storedPosts));
      _invalidatePostsCache();
      const reconstructed = reconstructGeneratedPostStructuredContent(loadGeneratedPosts()[0]);
      expect(reconstructed._contentQualityV3PostId).toBe(issued.postId);
      expect(reconstructed).not.toHaveProperty('_contentQualityV3Required');
      expect(reconstructed).not.toHaveProperty('_contentQualityV3PublishHandoff');

      const restartedStore = new ContentQualityV3PublishHandoffStore({
        provenanceRegistry: new ContentQualityV3DurableProvenanceRegistry({ userDataPath }),
      });
      await expect(enforceContentQualityV3PublishPayload(restartedStore, {
        title: reconstructed.selectedTitle,
        content: 'Renderer changed the body after deleting both keys.',
        structuredContent: {
          ...reconstructed,
          bodyPlain: 'Renderer changed the body after deleting both keys.',
          content: 'Renderer changed the body after deleting both keys.',
        },
        publishMode: 'publish',
        _contentQualityV3PublishOwnerKey: 'renderer:restart:strip-test',
      }, { consume: false })).rejects.toThrow('expired_provenance');
    } finally {
      rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  it('keeps the legacy saved structured-content shape byte-compatible', () => {
    saveGeneratedPostFromData({
      selectedTitle: 'Legacy title',
      bodyPlain: 'Legacy body',
      hashtags: ['legacy'],
      headings: [],
      articleType: 'seo',
      category: 'general',
      toneStyle: 'friendly',
    });
    const [stored] = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');
    expect(Object.keys(stored.structuredContent)).toEqual([
      '_postId',
      'selectedTitle',
      'hashtags',
      'articleType',
      'category',
      'toneStyle',
    ]);
    expect(JSON.stringify(stored.structuredContent)).toBe(JSON.stringify({
      _postId: stored.id,
      selectedTitle: 'Legacy title',
      hashtags: ['legacy'],
      articleType: 'seo',
      category: 'general',
      toneStyle: 'friendly',
    }));
  });

  it('keeps the legacy interactive update serialization byte-shaped without V3 fields', () => {
    const postId = saveGeneratedPost({
      selectedTitle: 'Legacy interactive title',
      bodyPlain: 'Legacy interactive body',
      hashtags: ['legacy'],
      headings: [],
      articleType: 'seo',
      category: 'general',
      toneStyle: 'friendly',
    }, false, { forceNew: true });
    expect(postId).toMatch(/^post_/);

    saveGeneratedPost({
      _postId: postId,
      selectedTitle: 'Legacy interactive title edited',
      bodyPlain: 'Legacy interactive body edited',
      hashtags: ['legacy', 'edited'],
      headings: [],
      articleType: 'seo',
      category: 'general',
      toneStyle: 'friendly',
    }, true);

    _invalidatePostsCache();
    const stored = loadGeneratedPosts().find(post => post.id === postId);
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored?.structuredContent)).toBe(JSON.stringify({
      _postId: postId,
      selectedTitle: 'Legacy interactive title edited',
      hashtags: ['legacy', 'edited'],
      articleType: 'seo',
      category: 'general',
      toneStyle: 'friendly',
    }));
  });

  it('persists only a marker when a V3 descriptor is malformed or oversized', () => {
    saveGeneratedPostFromData({
      selectedTitle: 'Malformed V3 title',
      bodyPlain: 'Malformed V3 body',
      hashtags: [],
      headings: [],
      _contentQualityV3Required: true,
      _contentQualityV3PublishHandoff: {
        handle: `v3h_${'x'.repeat(10_000)}`,
        publicationIdentity: `v3p_${'y'.repeat(43)}`,
        originalContentSha256: 'z'.repeat(64),
        rawText: 'must never persist',
      },
    });
    const [stored] = JSON.parse(localStorage.getItem(GENERATED_POSTS_KEY) || '[]');
    expect(stored.structuredContent._contentQualityV3Required).toBe(true);
    expect(stored.structuredContent).not.toHaveProperty('_contentQualityV3PublishHandoff');
    expect(JSON.stringify(stored)).not.toContain('must never persist');
  });

  it('populates title, body, and hashtags before dispatching any input event', () => {
    document.body.innerHTML = `
      <input id="unified-generated-title">
      <textarea id="unified-generated-content"></textarea>
      <input id="unified-generated-hashtags">
      <input id="image-title">
    `;

    const snapshots: Array<{ source: string; title: string; body: string; hashtags: string }> = [];
    const ids = [
      'unified-generated-title',
      'unified-generated-content',
      'unified-generated-hashtags',
    ];
    for (const id of ids) {
      document.getElementById(id)?.addEventListener('input', () => {
        snapshots.push({
          source: id,
          title: (document.getElementById('unified-generated-title') as HTMLInputElement).value,
          body: (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value,
          hashtags: (document.getElementById('unified-generated-hashtags') as HTMLInputElement).value,
        });
      });
    }

    populateGeneratedPostFields(
      {
        title: 'Restored title',
        content: 'Restored body',
        hashtags: '#one #two',
      },
      'post_restore',
      (text) => text,
    );

    expect(snapshots.map((snapshot) => snapshot.source)).toEqual(ids);
    expect(snapshots).toHaveLength(3);
    expect(snapshots.every((snapshot) => (
      snapshot.title === 'Restored title'
      && snapshot.body === 'Restored body'
      && snapshot.hashtags === '#one #two'
    ))).toBe(true);
  });

  it('resets URL generation identity and exposes a non-persisting restore option', () => {
    const source = readRendererSource('modules/contentGeneration.ts');
    const urlStart = source.indexOf('export async function generateContentFromUrl');
    const keywordStart = source.indexOf('export async function generateContentFromKeywords');
    const fillStart = source.indexOf('export function fillSemiAutoFields');
    const paraphraseStart = source.indexOf('export async function paraphraseContent');

    const urlGenerationBlock = source.slice(urlStart, keywordStart);
    const fillBlock = source.slice(fillStart, paraphraseStart);

    expect(urlGenerationBlock).toContain('currentPostId = null');
    expect(fillBlock).toContain('options: FillSemiAutoFieldsOptions = {}');
    expect(fillBlock).toContain('options.persist !== false');
  });

  it("includes 'uncertain' in the continuous queue status contract", () => {
    const source = readRendererSource('types/index.ts');
    const queueStart = source.indexOf('export interface ContinuousQueueItem');
    const queueEnd = source.indexOf('// ── 생성된 글 ──');

    expect(source.slice(queueStart, queueEnd)).toMatch(/status:[^;]*'uncertain'/s);
  });
});
