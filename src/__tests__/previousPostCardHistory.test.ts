import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createPreviousPostCardHistory, PREVIOUS_POST_CARD_HISTORY_LIMIT, recordPreviousPostCardsAfterPublish } from '../main/services/previousPostCardHistory.js';

let dir = '';
let file = '';

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'bln-prev-cards-'));
  file = path.join(dir, 'previous-post-card-history.json');
});


describe('previous-post card history', () => {
  it('returns an empty history when the file does not exist', () => {
    expect(createPreviousPostCardHistory(file).readRecentUrls('my_blog')).toEqual([]);
  });

  it('records per blog and returns the most recent cards first', () => {
    const history = createPreviousPostCardHistory(file);
    history.record('my_blog', ['https://blog.naver.com/my_blog/1', 'https://blog.naver.com/my_blog/2'], new Date('2026-11-01T00:00:00Z'));
    history.record('my_blog', ['https://blog.naver.com/my_blog/3'], new Date('2026-11-02T00:00:00Z'));
    history.record('other_blog', ['https://blog.naver.com/other_blog/9'], new Date('2026-11-02T00:00:00Z'));
    expect(history.readRecentUrls('MY_BLOG')).toEqual([
      'https://blog.naver.com/my_blog/3',
      'https://blog.naver.com/my_blog/1',
      'https://blog.naver.com/my_blog/2',
    ]);
    expect(history.readRecentUrls('other_blog')).toEqual(['https://blog.naver.com/other_blog/9']);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    expect(saved.version).toBe(1);
    expect(saved.blogs.my_blog[0]).toEqual({ at: '2026-11-02T00:00:00.000Z', urls: ['https://blog.naver.com/my_blog/3'] });
  });

  it(`keeps only the latest ${PREVIOUS_POST_CARD_HISTORY_LIMIT} posts per blog`, () => {
    const history = createPreviousPostCardHistory(file);
    for (let i = 1; i <= PREVIOUS_POST_CARD_HISTORY_LIMIT + 2; i += 1) {
      history.record('my_blog', [`https://blog.naver.com/my_blog/${i}`]);
    }
    const urls = history.readRecentUrls('my_blog');
    expect(urls).toHaveLength(PREVIOUS_POST_CARD_HISTORY_LIMIT);
    expect(urls[0]).toBe(`https://blog.naver.com/my_blog/${PREVIOUS_POST_CARD_HISTORY_LIMIT + 2}`);
    expect(urls).not.toContain('https://blog.naver.com/my_blog/1');
  });

  it('treats a broken file as an empty history and recovers on the next record', () => {
    writeFileSync(file, '{not json', 'utf8');
    const history = createPreviousPostCardHistory(file);
    expect(history.readRecentUrls('my_blog')).toEqual([]);
    history.record('my_blog', ['https://blog.naver.com/my_blog/1']);
    expect(history.readRecentUrls('my_blog')).toEqual(['https://blog.naver.com/my_blog/1']);
  });

  it('ignores invalid blog ids, empty url lists and malformed entries', () => {
    writeFileSync(file, JSON.stringify({ version: 1, blogs: { my_blog: [{ at: 'x', urls: [1, 'https://blog.naver.com/my_blog/5'] }, 'junk'] } }), 'utf8');
    const history = createPreviousPostCardHistory(file);
    expect(history.readRecentUrls('my_blog')).toEqual(['https://blog.naver.com/my_blog/5']);
    expect(history.record('../evil', ['https://blog.naver.com/my_blog/1'])).toBe(false);
    expect(history.record('my_blog', [])).toBe(false);
    expect(history.readRecentUrls('../evil')).toEqual([]);
  });

  it('writes through a temporary file so a partial write never replaces the record', () => {
    const history = createPreviousPostCardHistory(file);
    expect(history.record('my_blog', ['https://blog.naver.com/my_blog/1'])).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('never throws when the location cannot be written', () => {
    const history = createPreviousPostCardHistory(path.join(dir, 'missing', 'deeper', '\u0000bad.json'));
    expect(history.record('my_blog', ['https://blog.naver.com/my_blog/1'])).toBe(false);
    expect(history.readRecentUrls('my_blog')).toEqual([]);
  });
});

describe('recordPreviousPostCardsAfterPublish', () => {
  const urls = ['https://blog.naver.com/my_blog/1', 'https://blog.naver.com/my_blog/2'];
  const confirmed = { __previousPostCardsAttached: urls, __publicationBlogId: 'my_blog', publishedUrl: 'https://blog.naver.com/my_blog/99' };

  it('records the attached cards only after a confirmed publish or reservation', () => {
    const history = createPreviousPostCardHistory(file);
    expect(recordPreviousPostCardsAfterPublish(confirmed, 'publish', history)).toBe(true);
    expect(recordPreviousPostCardsAfterPublish({ ...confirmed, publishedUrl: undefined }, 'schedule', history)).toBe(true);
    expect(history.readRecentUrls('my_blog')).toHaveLength(4);
  });

  it('skips drafts, unconfirmed publishes, missing blogs and posts without cards', () => {
    const history = createPreviousPostCardHistory(file);
    expect(recordPreviousPostCardsAfterPublish(confirmed, 'draft', history)).toBe(false);
    expect(recordPreviousPostCardsAfterPublish({ ...confirmed, publishedUrl: '' }, 'publish', history)).toBe(false);
    expect(recordPreviousPostCardsAfterPublish({ ...confirmed, __publicationBlogId: undefined }, 'publish', history)).toBe(false);
    expect(recordPreviousPostCardsAfterPublish({ ...confirmed, __previousPostCardsAttached: [] }, 'publish', history)).toBe(false);
    expect(recordPreviousPostCardsAfterPublish(confirmed, 'publish', null)).toBe(false);
    expect(history.readRecentUrls('my_blog')).toEqual([]);
  });

  it('never throws when the history itself fails', () => {
    const broken = { readRecentUrls: () => [], record: () => { throw new Error('disk'); } };
    expect(recordPreviousPostCardsAfterPublish(confirmed, 'publish', broken)).toBe(false);
  });
});
