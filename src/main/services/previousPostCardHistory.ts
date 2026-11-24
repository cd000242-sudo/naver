import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import path from 'path';

/** Posts remembered per blog; with three cards each this covers the last ~30 attached cards. */
export const PREVIOUS_POST_CARD_HISTORY_LIMIT = 10;
export const PREVIOUS_POST_CARD_HISTORY_FILE = 'previous-post-card-history.json';

interface HistoryEntry {
  readonly at: string;
  readonly urls: readonly string[];
}

interface HistoryFile {
  readonly version: 1;
  readonly blogs: Readonly<Record<string, readonly HistoryEntry[]>>;
}

export interface PreviousPostCardHistory {
  /** Card URLs attached to recent posts of this blog, most recent post first. */
  readRecentUrls(blogId: string): string[];
  /** Remember the cards of one confirmed post. Returns false instead of throwing on any failure. */
  record(blogId: string, urls: readonly string[], at?: Date): boolean;
}

function normalizeBlogId(value: unknown): string | undefined {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,100}$/.test(id) ? id : undefined;
}

function sanitizeEntries(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !Array.isArray((entry as HistoryEntry).urls)) return [];
    const urls = (entry as HistoryEntry).urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
    return urls.length ? [{ at: String((entry as HistoryEntry).at || ''), urls }] : [];
  });
}

function readHistory(filePath: string): HistoryFile {
  try {
    if (!existsSync(filePath)) return { version: 1, blogs: {} };
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const blogs: Record<string, HistoryEntry[]> = {};
    for (const [blogId, entries] of Object.entries(parsed?.blogs || {})) {
      const id = normalizeBlogId(blogId);
      if (id) blogs[id] = sanitizeEntries(entries);
    }
    return { version: 1, blogs };
  } catch {
    // A broken file must never block publishing; start over with an empty history.
    return { version: 1, blogs: {} };
  }
}

export function createPreviousPostCardHistory(filePath: string): PreviousPostCardHistory {
  return {
    readRecentUrls(blogId) {
      const id = normalizeBlogId(blogId);
      if (!id) return [];
      return (readHistory(filePath).blogs[id] || []).flatMap(entry => [...entry.urls]);
    },
    record(blogId, urls, at = new Date()) {
      const id = normalizeBlogId(blogId);
      const cleanUrls = (Array.isArray(urls) ? urls : []).map(url => String(url || '').trim()).filter(Boolean);
      if (!id || cleanUrls.length === 0) return false;
      try {
        const current = readHistory(filePath);
        const entries = [{ at: at.toISOString(), urls: cleanUrls }, ...(current.blogs[id] || [])]
          .slice(0, PREVIOUS_POST_CARD_HISTORY_LIMIT);
        const next: HistoryFile = { version: 1, blogs: { ...current.blogs, [id]: entries } };
        const tempPath = `${filePath}.tmp`;
        writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf8');
        renameSync(tempPath, filePath);
        return true;
      } catch {
        return false;
      }
    },
  };
}

let defaultHistory: PreviousPostCardHistory | null | undefined;

/** History under Electron userData; null outside Electron (tests, CLI). */
export function getDefaultPreviousPostCardHistory(): PreviousPostCardHistory | null {
  if (defaultHistory !== undefined) return defaultHistory;
  try {
    const { app } = require('electron');
    const userData = app?.getPath?.('userData');
    defaultHistory = userData ? createPreviousPostCardHistory(path.join(userData, PREVIOUS_POST_CARD_HISTORY_FILE)) : null;
  } catch {
    defaultHistory = null;
  }
  return defaultHistory;
}

interface PublishedRunState {
  readonly __previousPostCardsAttached?: unknown;
  readonly __publicationBlogId?: unknown;
  readonly publishedUrl?: unknown;
}

/**
 * Called only on the success path after publish/reservation confirmation. Drafts and
 * immediate publishes without a confirmed post URL are not recorded. Never throws.
 */
export function recordPreviousPostCardsAfterPublish(
  state: PublishedRunState,
  publishMode: unknown,
  history: PreviousPostCardHistory | null = getDefaultPreviousPostCardHistory(),
): boolean {
  try {
    const mode = String(publishMode || 'publish');
    if (mode === 'draft' || !history) return false;
    if (mode === 'publish' && !String(state?.publishedUrl || '').trim()) return false;
    const urls = Array.isArray(state?.__previousPostCardsAttached) ? state.__previousPostCardsAttached.map(String) : [];
    const blogId = typeof state?.__publicationBlogId === 'string' ? state.__publicationBlogId : '';
    if (!blogId || urls.length === 0) return false;
    return history.record(blogId, urls);
  } catch {
    return false;
  }
}
