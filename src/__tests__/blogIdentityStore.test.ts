/**
 * The learned naverId -> blog address map survives app restarts and updates (a plain JSON file under
 * ~/.naver-blog-automation/safety-state, written atomically like the account guard's state).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlogIdentityStore } from '../automation/blogIdentityStore';

const roots: string[] = [];
const dir = () => { const d = mkdtempSync(join(tmpdir(), 'blog-identity-')); roots.push(d); return d; };
afterEach(() => { for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('BlogIdentityStore', () => {
  it('starts empty', () => {
    expect(new BlogIdentityStore({ storageDir: dir() }).get('tnqls6550-')).toBeUndefined();
  });

  it('round trip: a new instance on the same folder reads what the first one learned', () => {
    const storageDir = dir();
    expect(new BlogIdentityStore({ storageDir }).learn('TNQLS6550-', 'Leader_248')).toBe(true);
    const reopened = new BlogIdentityStore({ storageDir });
    expect(reopened.get('tnqls6550-')).toBe('leader_248');
    expect(reopened.get(' TNQLS6550- ')).toBe('leader_248');
  });

  it('keeps no readable Naver login ID on disk and leaves no temporary file behind', () => {
    const storageDir = dir();
    new BlogIdentityStore({ storageDir }).learn('tnqls6550-', 'leader_248');
    const files = readdirSync(storageDir);
    expect(files).toEqual(['blog-identity.json']);
    const text = readFileSync(join(storageDir, files[0]), 'utf8');
    expect(text).toContain('leader_248');
    expect(text).not.toContain('tnqls6550');
  });

  it('replaces an earlier value for the same Naver ID and keeps the others', () => {
    const store = new BlogIdentityStore({ storageDir: dir() });
    store.learn('a', 'blog_a'); store.learn('b', 'blog_b'); store.learn('a', 'blog_a2');
    expect(store.get('a')).toBe('blog_a2');
    expect(store.get('b')).toBe('blog_b');
  });

  it('knows when a blog is already learned by a different Naver ID', () => {
    const store = new BlogIdentityStore({ storageDir: dir() });
    store.learn('a', 'blog_a');
    expect(store.isLearnedByOther('BLOG_A', 'b')).toBe(true);
    expect(store.isLearnedByOther('blog_a', 'a')).toBe(false);
    expect(store.isLearnedByOther('blog_free', 'b')).toBe(false);
  });

  it('refuses a malformed blog id', () => {
    const store = new BlogIdentityStore({ storageDir: dir() });
    expect(store.learn('a', 'bad/blog')).toBe(false);
    expect(store.learn('a', '')).toBe(false);
    expect(store.get('a')).toBeUndefined();
  });

  it('a corrupt file reads as nothing learned and is replaced by the next learn', () => {
    const storageDir = dir();
    writeFileSync(join(storageDir, 'blog-identity.json'), '{not json');
    const store = new BlogIdentityStore({ storageDir });
    expect(store.get('a')).toBeUndefined();
    expect(store.learn('a', 'blog_a')).toBe(true);
    expect(new BlogIdentityStore({ storageDir }).get('a')).toBe('blog_a');
  });

  it('ignores entries with a wrong shape instead of trusting them', () => {
    const storageDir = dir();
    writeFileSync(join(storageDir, 'blog-identity.json'), JSON.stringify({ schema: 1, learned: { abc: 'bad/blog', def: 5 } }));
    const store = new BlogIdentityStore({ storageDir });
    expect(store.isLearnedByOther('bad/blog', 'x')).toBe(false);
  });

  it('a failed write is not fatal: the value stays known for this run and learn reports false', () => {
    const storageDir = dir();
    const store = new BlogIdentityStore({ storageDir, writeFile: () => { throw new Error('EPERM'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(store.learn('a', 'blog_a')).toBe(false);
      expect(store.get('a')).toBe('blog_a');
      expect(store.isLearnedByOther('blog_a', 'b')).toBe(true);
      expect(new BlogIdentityStore({ storageDir }).get('a')).toBeUndefined();
    } finally { warn.mockRestore(); }
  });
});
