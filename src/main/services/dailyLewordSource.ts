import axios from 'axios';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from '../../automation/safeStateRename.js';
import { dailySourceFingerprints } from './dailyPublishingExecutor.js';
import { listDailyClaimedFingerprints } from './dailyPublishingStore.js';

/** Public file, no login: LEWORD's per-topic recommended keywords, rebuilt three times a day. */
export const LEWORD_TODAY_PICKS_URL = 'https://leaderspro.kr/data/today-picks.json';
const CACHE_FILE = 'leword-today-picks-cache.json';
const CLAIMS_FILE = 'daily-source-claims-v1.json';
const FRESH_MS = 10 * 60_000;
const KEYWORD_MAX = 80;
const MAX_TOPICS = 100;
const MAX_ROWS = 200;

export interface LewordRow { keyword: string; searchVolume: number; documentCount: number; ratio: number; money: number; measuredAt: string }
export interface LewordPicks { builtAt: string; topics: Array<{ topic: string; rows: LewordRow[] }> }
export interface LewordCandidate extends LewordRow { topic: string }
export interface LewordRequest { topics: readonly string[]; accountId: string; limit: number; includeUsed?: boolean }
export interface LewordLoad { picks: LewordPicks; stale: boolean }
export interface LewordPreview { builtAt: string; stale: boolean; candidates: LewordCandidate[] }
export interface LewordSourceDeps {
  fetchJson(url: string): Promise<unknown>;
  readCache(): Promise<string | null>;
  writeCache(text: string): Promise<void>;
  /** Fingerprints the account already claimed (read-only). */
  usedFingerprints(accountId: string): Promise<ReadonlySet<string>>;
  now(): Date;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function parseRow(input: unknown): LewordRow[] {
  const row = record(input);
  const keyword = typeof row?.keyword === 'string' ? row.keyword.replace(/\s+/gu, ' ').trim() : '';
  // Control characters and URLs never become a topic to write about: the response is external input.
  if (!row || !keyword || keyword.length > KEYWORD_MAX || /[\x00-\x1f\x7f]/u.test(keyword) || /^https?:\/\//iu.test(keyword)) return [];
  const searchVolume = count(row.searchVolume), documentCount = count(row.documentCount);
  const given = typeof row.ratio === 'number' && Number.isFinite(row.ratio) && row.ratio >= 0 ? row.ratio : null;
  // A row that already went through this parser carries money as a number.
  const money = typeof row.money === 'number' ? count(row.money) : count(record(row.money)?.value);
  const measuredAt = typeof row.measuredAt === 'string' && Number.isFinite(Date.parse(row.measuredAt)) ? row.measuredAt : '';
  return [{ keyword, searchVolume, documentCount, money, measuredAt,
    ratio: given ?? (documentCount > 0 ? Math.round(searchVolume / documentCount * 100) / 100 : 0) }];
}

/** Null unless the response has at least one topic with at least one usable keyword. */
export function parseLewordTodayPicks(input: unknown): LewordPicks | null {
  const top = record(input);
  if (!top || typeof top.builtAt !== 'string' || !Number.isFinite(Date.parse(top.builtAt)) || !Array.isArray(top.topics)) return null;
  const topics = top.topics.slice(0, MAX_TOPICS).flatMap(item => {
    const entry = record(item);
    if (!entry || typeof entry.topic !== 'string' || !entry.topic.trim() || !Array.isArray(entry.rows)) return [];
    return [{ topic: entry.topic.trim(), rows: entry.rows.slice(0, MAX_ROWS).flatMap(parseRow) }];
  });
  return topics.some(topic => topic.rows.length) ? { builtAt: top.builtAt, topics } : null;
}

const keywordKey = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko-KR');
/**
 * Pure ranking: golden (ratio >= 1) first, then higher ad value, then higher search volume, then file order.
 * Only the plan's topics are read, a keyword listed under two topics counts once, and used keywords are skipped.
 */
export function rankLewordCandidates(picks: LewordPicks, topics: readonly string[], isUsed: (keyword: string) => boolean, limit: number): LewordCandidate[] {
  const seen = new Set<string>();
  const pool: LewordCandidate[] = [];
  for (const name of topics) {
    for (const row of picks.topics.find(topic => topic.topic === name)?.rows ?? []) {
      const key = keywordKey(row.keyword);
      if (seen.has(key) || isUsed(row.keyword)) continue;
      seen.add(key); pool.push({ ...row, topic: name });
    }
  }
  const golden = (item: LewordCandidate) => item.ratio >= 1 ? 1 : 0;
  return pool.map((item, index) => ({ item, index }))
    .sort((a, b) => golden(b.item) - golden(a.item) || b.item.money - a.item.money
      || b.item.searchVolume - a.item.searchVolume || a.index - b.index)
    .slice(0, Math.max(0, limit)).map(entry => entry.item);
}

function parseCache(text: string | null): LewordPicks | null {
  if (!text) return null;
  try { return parseLewordTodayPicks(JSON.parse(text)); } catch { return null; }
}

/** The supplier behind the daily executor and the preview: network first, last good download as the fallback. */
export function createLewordSource(deps: LewordSourceDeps) {
  let memo: { at: number; value: LewordLoad } | undefined;
  async function load(): Promise<LewordLoad> {
    if (memo && deps.now().getTime() - memo.at < FRESH_MS) return memo.value;
    try {
      const picks = parseLewordTodayPicks(await deps.fetchJson(LEWORD_TODAY_PICKS_URL));
      if (!picks) throw new Error('LEWORD_PICKS_INVALID');
      await deps.writeCache(JSON.stringify(picks)).catch(() => undefined);
      memo = { at: deps.now().getTime(), value: { picks, stale: false } };
      return memo.value;
    } catch {
      // A site outage or a broken file must not stop the plan while a good earlier download exists.
      const cached = parseCache(await deps.readCache().catch(() => null));
      if (!cached) throw new Error('LEWORD_PICKS_UNAVAILABLE');
      return { picks: cached, stale: true };
    }
  }
  async function usedCheck(request: LewordRequest): Promise<(keyword: string) => boolean> {
    if (request.includeUsed) return () => false;
    const used = await deps.usedFingerprints(request.accountId);
    return keyword => dailySourceFingerprints({ type: 'keyword', value: keyword }).some(fingerprint => used.has(fingerprint));
  }
  return {
    load,
    async keywords(request: LewordRequest): Promise<string[]> {
      const { picks } = await load();
      return rankLewordCandidates(picks, request.topics, await usedCheck(request), request.limit).map(item => item.keyword);
    },
    /** Shows what the next posts would use. It reserves nothing. */
    async preview(request: Omit<LewordRequest, 'includeUsed'>): Promise<LewordPreview> {
      const { picks, stale } = await load();
      return { builtAt: picks.builtAt, stale, candidates: rankLewordCandidates(picks, request.topics, await usedCheck(request), request.limit) };
    },
  };
}

async function fetchPublicJson(url: string): Promise<unknown> {
  const response = await axios.get(url, { timeout: 15_000, maxRedirects: 3, maxContentLength: 8_000_000,
    headers: { Accept: 'application/json' }, validateStatus: status => status === 200 });
  return response.data;
}

/** Real wiring: the cache and the claims file live in the app's user-data folder. */
export function createUserDataLewordSource(userData: () => string, fetchJson: (url: string) => Promise<unknown> = fetchPublicJson) {
  const cacheFile = () => path.join(userData(), CACHE_FILE);
  return createLewordSource({
    fetchJson,
    readCache: () => readFile(cacheFile(), 'utf8').catch(() => null),
    writeCache: async text => {
      await mkdir(userData(), { recursive: true });
      const temporary = `${cacheFile()}.tmp`;
      await writeFile(temporary, text, 'utf8');
      renameWithRetry(temporary, cacheFile());
    },
    usedFingerprints: accountId => listDailyClaimedFingerprints(path.join(userData(), CLAIMS_FILE), accountId),
    now: () => new Date(),
  });
}
