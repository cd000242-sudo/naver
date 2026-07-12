/**
 * @vitest-environment happy-dom
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _invalidatePostsCache,
  loadGeneratedPosts,
  saveGeneratedPostFromData,
} from '../renderer/modules/postManager';
import { populateGeneratedPostFields } from '../renderer/modules/postListUI';
import { normalizeHashtags } from '../renderer/utils/hashtagUtils';
import { GENERATED_POSTS_KEY } from '../renderer/utils/postStorageUtils';

const GLOBAL_MIGRATION_DONE_KEY = 'naver_blog_posts_migration_global_done';

function readRendererSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', 'renderer', relativePath), 'utf8');
}

describe('renderer post data integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(GLOBAL_MIGRATION_DONE_KEY, 'true');
    document.body.innerHTML = '';
    _invalidatePostsCache();
  });

  it('normalizes legacy hashtag text and mixed arrays to a fresh string array', () => {
    expect(normalizeHashtags(' #one, two\n#three ')).toEqual(['#one', 'two', '#three']);
    expect(normalizeHashtags([' #one ', '', '#two #three', null, 42])).toEqual([
      '#one',
      '#two',
      '#three',
    ]);

    const original = ['#one', '#two'];
    const normalized = normalizeHashtags(original);
    expect(normalized).toEqual(original);
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

    expect(loaded.hashtags).toEqual(['#one', '#two']);
    expect(loaded.structuredContent?.hashtags).toEqual(['#one', '#two']);
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
    expect(storedPosts[0].hashtags).toEqual(['#one', '#two']);
    expect(storedPosts[0].structuredContent.hashtags).toEqual(['#one', '#two']);
    expect(storedPosts[0].structuredContent._postId).toBe(postId);
    expect(structuredContent.hashtags).toBe('#one, #two');
    expect(structuredContent).not.toHaveProperty('_postId');
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
