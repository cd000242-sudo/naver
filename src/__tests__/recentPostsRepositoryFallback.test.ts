import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { RecentPostsRepository } from '../contentPolicy/recentPostsRepository';
import { makeRecentPosts } from './contentPolicyFixtures';

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recent-post-fallback-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('recent-post repository fallback', () => {
  it('falls back to comparable legacy rows when the primary file only has incomplete rows', async () => {
    const baseDir = await tempDir();
    await fs.writeFile(
      path.join(baseDir, 'content-policy-articles.json'),
      JSON.stringify([{ title: 'title only cannot be compared' }]),
      'utf8',
    );
    await fs.writeFile(
      path.join(baseDir, 'published-posts.json'),
      JSON.stringify(makeRecentPosts(3)),
      'utf8',
    );

    const result = await new RecentPostsRepository(baseDir).loadRecentPosts(50);

    expect(result.ok).toBe(true);
    expect(result.ok && result.posts).toHaveLength(3);
    expect(result.ok && result.source).toBe('published-posts.json');
  });
});
