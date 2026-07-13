import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { withFileOperationLock } from './fileOperationQueue.js';
import type { ExposureStatus, RecentPostRecord, RecentPostsLoadResult } from './types.js';

const STORE_NAME = 'content-policy-articles.json';
const LEGACY_PUBLISHED_STORE_NAME = 'published-posts.json';
const MAX_STORED_POSTS = 500;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function normalizeHeadings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((heading) => typeof heading === 'string'
      ? heading.trim()
      : asString((heading as Record<string, unknown>)?.title))
    .filter(Boolean);
}

function normalizeRecentPost(value: unknown, index: number): RecentPostRecord | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const structured = source.structuredContent && typeof source.structuredContent === 'object'
    ? source.structuredContent as Record<string, unknown>
    : {};
  const title = asString(source.title || source.selectedTitle || structured.selectedTitle || structured.title);
  const body = asString(source.body || source.content || source.bodyPlain || structured.bodyPlain || structured.content);
  const headings = normalizeHeadings(source.headings || structured.headings);
  const intro = asString(source.intro || source.introduction || structured.introduction)
    || body.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean)
    || '';
  const articleId = asString(source.article_id || source.id || source.postId)
    || `legacy-${index}-${Buffer.from(title).toString('base64url').slice(0, 12)}`;
  if (!title && !body) return null;
  return {
    article_id: articleId,
    title,
    intro,
    headings,
    body,
    topic_angle: asString(source.topic_angle || source.topicAngle || structured.topic_angle || structured.topicAngle),
    structure_type: asString(source.structure_type || source.structureType || structured.structure_type || structured.structureType),
    business_facts: asStringArray(source.business_facts || structured.business_facts),
    related_questions: asStringArray(source.related_questions || structured.related_questions),
    published_at: asString(source.published_at || source.publishedAt || source.createdAt) || undefined,
    exposure_status: asString(source.exposure_status || source.exposureStatus) as RecentPostRecord['exposure_status'] || undefined,
    template_id: asString(source.template_id || source.templateId || structured.template_id || structured.templateId) || undefined,
    url: asString(source.url || source.publishedUrl) || undefined,
  };
}

function isComparable(post: RecentPostRecord): boolean {
  return Boolean(post.title && post.intro && post.body && post.headings.length > 0);
}

function newestFirst(left: RecentPostRecord, right: RecentPostRecord): number {
  const leftTime = Date.parse(left.published_at || '') || 0;
  const rightTime = Date.parse(right.published_at || '') || 0;
  return rightTime - leftTime;
}

export class RecentPostsRepository {
  readonly filePath: string;
  readonly legacyFilePath: string;

  constructor(private readonly baseDir: string) {
    this.filePath = path.join(baseDir, STORE_NAME);
    this.legacyFilePath = path.join(baseDir, LEGACY_PUBLISHED_STORE_NAME);
  }

  async loadRecentPosts(limit = 50): Promise<RecentPostsLoadResult> {
    const boundedLimit = Math.max(1, Math.min(MAX_STORED_POSTS, Math.floor(limit)));
    let primaryStoreAvailable = false;
    try {
      const primary = await this.readArrayFile(this.filePath);
      primaryStoreAvailable = true;
      const posts = primary.map(normalizeRecentPost)
        .filter((post): post is RecentPostRecord => Boolean(post && isComparable(post)))
        .sort(newestFirst)
        .slice(0, boundedLimit);
      if (posts.length > 0) return { ok: true, posts, source: STORE_NAME };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { ok: false, code: 'RECENT_POSTS_CORRUPT', message: (error as Error).message };
      }
    }

    try {
      const legacy = await this.readArrayFile(this.legacyFilePath);
      const posts = legacy.map(normalizeRecentPost)
        .filter((post): post is RecentPostRecord => Boolean(post && isComparable(post)))
        .sort(newestFirst)
        .slice(0, boundedLimit);
      if (posts.length === 0 && primaryStoreAvailable) {
        return { ok: true, posts: [], source: STORE_NAME };
      }
      return { ok: true, posts, source: LEGACY_PUBLISHED_STORE_NAME };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (primaryStoreAvailable) return { ok: true, posts: [], source: STORE_NAME };
        return {
          ok: false,
          code: 'RECENT_POSTS_UNAVAILABLE',
          message: 'No recent-post repository is available.',
        };
      }
      return { ok: false, code: 'RECENT_POSTS_CORRUPT', message: (error as Error).message };
    }
  }

  async mergeSnapshot(snapshot: readonly RecentPostRecord[]): Promise<number> {
    const normalized = snapshot
      .map(normalizeRecentPost)
      .filter((post): post is RecentPostRecord => Boolean(post && isComparable(post)));
    if (normalized.length === 0) return 0;

    await withFileOperationLock(this.filePath, async () => {
      let existing: RecentPostRecord[] = [];
      try {
        existing = (await this.readArrayFile(this.filePath))
          .map(normalizeRecentPost)
          .filter((post): post is RecentPostRecord => Boolean(post));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      const byKey = new Map<string, RecentPostRecord>();
      for (const post of [...existing, ...normalized]) {
        const key = post.article_id || post.url || `${post.title}|${post.published_at || ''}`;
        byKey.set(key, { ...post, headings: [...post.headings] });
      }
      const merged = Array.from(byKey.values()).sort(newestFirst).slice(0, MAX_STORED_POSTS);
      await this.writeAtomicUnlocked(merged);
    });
    return normalized.length;
  }

  async record(post: RecentPostRecord): Promise<void> {
    const normalized = normalizeRecentPost(post, 0);
    if (!normalized || !isComparable(normalized)) {
      throw new Error('RECENT_POST_RECORD_INCOMPLETE');
    }
    await this.mergeSnapshot([normalized]);
  }

  async updateExposureStatus(articleId: string, status: ExposureStatus): Promise<boolean> {
    const normalizedId = articleId.trim();
    if (!normalizedId) return false;
    return withFileOperationLock(this.filePath, async () => {
      let posts: RecentPostRecord[];
      try {
        posts = (await this.readArrayFile(this.filePath))
          .map(normalizeRecentPost)
          .filter((post): post is RecentPostRecord => Boolean(post));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
      let matched = false;
      const updated = posts.map((post) => {
        if (post.article_id !== normalizedId) return cloneRecentPost(post);
        matched = true;
        return { ...cloneRecentPost(post), exposure_status: status };
      });
      if (!matched) return false;
      await this.writeAtomicUnlocked(updated);
      return true;
    });
  }

  private async readArrayFile(filePath: string): Promise<unknown[]> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { posts?: unknown[] }).posts)) {
      return (parsed as { posts: unknown[] }).posts;
    }
    throw new Error(`RECENT_POSTS_INVALID_SHAPE:${path.basename(filePath)}`);
  }

  private async writeAtomicUnlocked(posts: readonly RecentPostRecord[]): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(posts, null, 2), 'utf8');
      await fs.rename(tempPath, this.filePath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }
}

function cloneRecentPost(post: RecentPostRecord): RecentPostRecord {
  return {
    ...post,
    headings: [...post.headings],
    business_facts: post.business_facts ? [...post.business_facts] : undefined,
    related_questions: post.related_questions ? [...post.related_questions] : undefined,
  };
}
