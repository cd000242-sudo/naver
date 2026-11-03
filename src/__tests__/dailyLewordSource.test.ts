import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLewordSource, createUserDataLewordSource, parseLewordTodayPicks, rankLewordCandidates, type LewordPicks, type LewordSourceDeps } from '../main/services/dailyLewordSource.js';
import { dailySourceFingerprints } from '../main/services/dailyPublishingExecutor.js';

const row = (keyword: string, extra: Record<string, unknown> = {}) => ({
  keyword, searchVolume: 100, documentCount: 200, ratio: 0.5, measuredAt: '2026-11-03T00:00:00.000Z', money: { value: 70, tier: 'none' }, ...extra,
});
const raw = (topics: Array<{ topic: string; rows: unknown[] }> = [{ topic: '자동차', rows: [row('신차 할인')] }]) => ({
  builtAt: '2026-11-03T01:00:00.000Z', round: { id: 'r', label: '오전', scheduledAt: '2026-11-03T00:00:00.000Z' }, topics, history: ['ignored'],
});
const picks = (): LewordPicks => parseLewordTodayPicks(raw([
  { topic: '자동차', rows: [row('낮은비율', { ratio: 0.4, money: { value: 99 }, searchVolume: 9000 }), row('황금B', { ratio: 1.5, money: { value: 50 }, searchVolume: 10 }),
    row('황금A', { ratio: 2, money: { value: 80 }, searchVolume: 5 }), row('황금C', { ratio: 1, money: { value: 80 }, searchVolume: 700 })] },
  { topic: '맛집', rows: [row('맛집황금', { ratio: 3, money: { value: 10 } }), row('황금A', { ratio: 2, money: { value: 80 } })] },
  { topic: '게임', rows: [row('게임키워드', { ratio: 5 })] },
]))!;

describe('parseLewordTodayPicks', () => {
  it('keeps only the fields the app needs and normalizes rows', () => {
    const parsed = parseLewordTodayPicks(raw())!;
    expect(parsed.builtAt).toBe('2026-11-03T01:00:00.000Z');
    expect(parsed.topics).toEqual([{ topic: '자동차', rows: [{ keyword: '신차 할인', searchVolume: 100, documentCount: 200, ratio: 0.5, money: 70, measuredAt: '2026-11-03T00:00:00.000Z' }] }]);
    expect(JSON.stringify(parsed)).not.toContain('history');
  });
  it.each([null, 'text', [], {}, { builtAt: 'x', topics: [] }, { builtAt: '2026-11-03T01:00:00.000Z', topics: 'no' },
    { builtAt: '2026-11-03T01:00:00.000Z', topics: [] }, { builtAt: '2026-11-03T01:00:00.000Z', topics: [{ topic: '', rows: [row('a')] }] },
    { builtAt: '2026-11-03T01:00:00.000Z', topics: [{ topic: '자동차', rows: 'no' }] }])('rejects a broken response: %j', (input) => {
    expect(parseLewordTodayPicks(input)).toBeNull();
  });
  it('drops unsafe rows but keeps the rest of the topic', () => {
    const parsed = parseLewordTodayPicks(raw([{ topic: '자동차', rows: [row('http://evil.example/x'), row(''), row('bad\u0000key'), row('a'.repeat(81)), 3, null, row('정상 키워드', { ratio: null, searchVolume: 300, documentCount: 100 })] }]))!;
    expect(parsed.topics[0].rows.map(r => r.keyword)).toEqual(['정상 키워드']);
    expect(parsed.topics[0].rows[0].ratio).toBe(3);
  });
});

describe('rankLewordCandidates', () => {
  it('puts golden keywords first, then money, then search volume, and dedupes across topics', () => {
    const ranked = rankLewordCandidates(picks(), ['자동차', '맛집'], () => false, 10);
    expect(ranked.map(r => r.keyword)).toEqual(['황금C', '황금A', '황금B', '맛집황금', '낮은비율']);
    expect(ranked.find(r => r.keyword === '황금A')!.topic).toBe('자동차');
  });
  it('excludes keywords the account already used and filters by plan topics only', () => {
    const ranked = rankLewordCandidates(picks(), ['자동차'], keyword => keyword === '황금A', 10);
    expect(ranked.map(r => r.keyword)).toEqual(['황금C', '황금B', '낮은비율']);
    expect(rankLewordCandidates(picks(), ['없는 주제'], () => false, 10)).toEqual([]);
    expect(rankLewordCandidates(picks(), ['자동차'], () => false, 2)).toHaveLength(2);
  });
});

function fakeDeps(over: Partial<LewordSourceDeps> = {}) {
  let cache: string | null = null;
  const deps: LewordSourceDeps = {
    fetchJson: vi.fn(async () => raw()), readCache: vi.fn(async () => cache), writeCache: vi.fn(async (text: string) => { cache = text; }),
    usedFingerprints: vi.fn(async () => new Set<string>()), now: () => new Date('2026-11-03T02:00:00.000Z'), ...over,
  };
  return deps;
}

describe('createLewordSource', () => {
  it('stores the last good response and falls back to it when the site fails', async () => {
    const deps = fakeDeps();
    const fresh = await createLewordSource(deps).load();
    expect(fresh.stale).toBe(false);
    expect(deps.writeCache).toHaveBeenCalledTimes(1);
    const down = fakeDeps({ fetchJson: vi.fn(async () => { throw new Error('ECONNRESET'); }), readCache: deps.readCache });
    const cached = await createLewordSource(down).load();
    expect(cached.stale).toBe(true);
    expect(cached.picks.builtAt).toBe('2026-11-03T01:00:00.000Z');
  });
  it('treats a broken response like an outage and never overwrites the good cache with it', async () => {
    const deps = fakeDeps();
    await createLewordSource(deps).load();
    const broken = fakeDeps({ fetchJson: vi.fn(async () => ({ nonsense: true })), readCache: deps.readCache });
    expect((await createLewordSource(broken).load()).stale).toBe(true);
    expect(broken.writeCache).not.toHaveBeenCalled();
  });
  it('reports unavailable when the site is down and nothing was cached', async () => {
    const deps = fakeDeps({ fetchJson: vi.fn(async () => { throw new Error('down'); }), readCache: vi.fn(async () => 'not json') });
    await expect(createLewordSource(deps).load()).rejects.toThrow('LEWORD_PICKS_UNAVAILABLE');
  });
  it('reuses a fresh download for ten minutes', async () => {
    const deps = fakeDeps(); const source = createLewordSource(deps);
    await source.load(); await source.load();
    expect(deps.fetchJson).toHaveBeenCalledTimes(1);
  });
  it('skips keywords already claimed by the account unless seeds are requested', async () => {
    const used = new Set(dailySourceFingerprints({ type: 'keyword', value: '신차 할인' }));
    const deps = fakeDeps({ usedFingerprints: vi.fn(async () => used) });
    const source = createLewordSource(deps);
    expect(await source.keywords({ topics: ['자동차'], accountId: 'a', limit: 5 })).toEqual([]);
    expect(await source.keywords({ topics: ['자동차'], accountId: 'a', limit: 5, includeUsed: true })).toEqual(['신차 할인']);
    expect(deps.usedFingerprints).toHaveBeenCalledWith('a');
  });
  it('previews the next candidates with the data time and stale flag', async () => {
    const preview = await createLewordSource(fakeDeps()).preview({ topics: ['자동차'], accountId: 'a', limit: 5 });
    expect(preview).toMatchObject({ builtAt: '2026-11-03T01:00:00.000Z', stale: false });
    expect(preview.candidates[0]).toMatchObject({ keyword: '신차 할인', topic: '자동차', ratio: 0.5, searchVolume: 100, documentCount: 200, money: 70 });
  });
});

describe('createUserDataLewordSource', () => {
  let dir = '';
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = ''; });
  it('preview reads the claims file but never writes it', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'leword-'));
    const claims = path.join(dir, 'daily-source-claims-v1.json');
    const [used] = dailySourceFingerprints({ type: 'keyword', value: '신차 할인' });
    const body = JSON.stringify({ version: 1, claims: { [`a:${used}`]: { jobId: 'j', at: '2026-11-01T00:00:00.000Z' } } });
    await writeFile(claims, body, 'utf8');
    const source = createUserDataLewordSource(() => dir, async () => raw([{ topic: '자동차', rows: [row('신차 할인'), row('중고차 시세')] }]));
    const preview = await source.preview({ topics: ['자동차'], accountId: 'a', limit: 5 });
    expect(preview.candidates.map(c => c.keyword)).toEqual(['중고차 시세']);
    expect(await readFile(claims, 'utf8')).toBe(body);
    expect(JSON.parse(await readFile(path.join(dir, 'leword-today-picks-cache.json'), 'utf8')).topics[0].topic).toBe('자동차');
  });
  it('preview works with no claims file and creates none', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'leword-'));
    const source = createUserDataLewordSource(() => dir, async () => raw());
    expect((await source.preview({ topics: ['자동차'], accountId: 'a', limit: 5 })).candidates).toHaveLength(1);
    await expect(readFile(path.join(dir, 'daily-source-claims-v1.json'), 'utf8')).rejects.toThrow();
  });
});
