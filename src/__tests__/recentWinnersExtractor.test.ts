import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  extractRecentWinners,
  formatWinnersForPrompt,
} from '../learning/recentWinnersExtractor';
import {
  appendMetric,
  __setStorageForTest,
  __clearForTest,
} from '../analytics/postMetricsStore';

const tmpFile = path.join(os.tmpdir(), `winners_test_${Date.now()}.json`);

beforeEach(() => {
  __setStorageForTest(tmpFile);
  __clearForTest();
});

afterEach(() => {
  __clearForTest();
});

function seedMetric(postId: string, views: number, likes = 0) {
  appendMetric({
    postId,
    checkedAt: '2026-04-20T00:00:00Z',
    views,
    likes,
    comments: 0,
    source: 'manual',
  });
}

function resolver(map: Record<string, { title: string; intro: string }>) {
  return (postId: string) => map[postId] ?? null;
}

describe('extractRecentWinners — minimum sample gate', () => {
  it('returns empty when fewer than 5 posts have metrics', () => {
    for (let i = 0; i < 4; i++) seedMetric(`p-${i}`, 100 * (i + 1));
    const winners = extractRecentWinners(() => ({ title: 't', intro: 'i' }));
    expect(winners).toEqual([]);
  });

  it('returns winners once sample reaches the minimum', () => {
    for (let i = 0; i < 10; i++) seedMetric(`p-${i}`, 100 * (i + 1));
    const textMap: Record<string, { title: string; intro: string }> = {};
    for (let i = 0; i < 10; i++) textMap[`p-${i}`] = { title: `T-${i}`, intro: `I-${i}` };
    const winners = extractRecentWinners(resolver(textMap));
    expect(winners.length).toBeGreaterThan(0);
  });
});

describe('extractRecentWinners — ranking', () => {
  it('picks top 20% by views DESC', () => {
    for (let i = 0; i < 10; i++) seedMetric(`p-${i}`, 100 * (i + 1));
    const textMap: Record<string, { title: string; intro: string }> = {};
    for (let i = 0; i < 10; i++) textMap[`p-${i}`] = { title: `T-${i}`, intro: `I-${i}` };
    const winners = extractRecentWinners(resolver(textMap), { topFraction: 0.2 });
    expect(winners.length).toBe(2);
    expect(winners[0].postId).toBe('p-9'); // views 1000
    expect(winners[1].postId).toBe('p-8'); // views 900
  });

  it('breaks ties on views by likes DESC', () => {
    seedMetric('tie-a', 500, 10);
    seedMetric('tie-b', 500, 25);
    for (let i = 0; i < 5; i++) seedMetric(`p-${i}`, 100);
    const textMap: Record<string, { title: string; intro: string }> = {
      'tie-a': { title: 'A', intro: 'Ai' },
      'tie-b': { title: 'B', intro: 'Bi' },
    };
    const winners = extractRecentWinners(resolver(textMap), { topFraction: 0.3, maxWinners: 2 });
    expect(winners[0].postId).toBe('tie-b');
  });

  it('caps results at maxWinners', () => {
    for (let i = 0; i < 20; i++) seedMetric(`p-${i}`, 100 * (i + 1));
    const textMap: Record<string, { title: string; intro: string }> = {};
    for (let i = 0; i < 20; i++) textMap[`p-${i}`] = { title: `T-${i}`, intro: `I-${i}` };
    const winners = extractRecentWinners(resolver(textMap), { topFraction: 1.0, maxWinners: 3 });
    expect(winners.length).toBe(3);
  });
});

describe('extractRecentWinners — resolver integration', () => {
  it('silently skips posts whose text cannot be resolved', () => {
    for (let i = 0; i < 10; i++) seedMetric(`p-${i}`, 100 * (i + 1));
    const textMap: Record<string, { title: string; intro: string }> = {
      'p-9': { title: 'only winner', intro: 'intro' },
    };
    const winners = extractRecentWinners(resolver(textMap), { topFraction: 0.2 });
    expect(winners.length).toBe(1);
    expect(winners[0].postId).toBe('p-9');
  });

  it('skips posts with empty title or intro', () => {
    for (let i = 0; i < 10; i++) seedMetric(`p-${i}`, 100 * (i + 1));
    const textMap: Record<string, { title: string; intro: string }> = {
      'p-9': { title: '', intro: 'intro' },
      'p-8': { title: 'valid', intro: '' },
      'p-7': { title: 'valid', intro: 'valid' },
    };
    const winners = extractRecentWinners(resolver(textMap), { topFraction: 0.3 });
    expect(winners.length).toBe(1);
    expect(winners[0].postId).toBe('p-7');
  });
});

describe('formatWinnersForPrompt', () => {
  it('returns empty string when winners list is empty', () => {
    expect(formatWinnersForPrompt([])).toBe('');
  });

  it('includes RECENT_WINNERS header and examples', () => {
    const block = formatWinnersForPrompt([
      { postId: 'p-1', title: '제목 A', intro: '도입부 A', views: 1500 },
      { postId: 'p-2', title: '제목 B', intro: '도입부 B', views: 1000 },
    ]);
    expect(block).toContain('RECENT_WINNERS');
    expect(block).toContain('제목 A');
    expect(block).toContain('도입부 A');
    expect(block).toContain('1,500');
    expect(block).toContain('복사 금지');
  });
});
